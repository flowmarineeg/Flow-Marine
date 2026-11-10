'use strict';

const mongoose = require('mongoose');
const lock = require('../rounds/roundLock');
const AppError = require('../../utils/AppError');
const ExcelJS       = require('exceljs');
const Booking       = require('./booking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const Port          = require('../locations/port.model');
const { nextNumberBatch } = require('../../utils/autoNumber');
const { invalidateRoundCache } = require('../capacity/capacity.service');
const { SAVEABLE, pickExisting, classifyExisting, markDuplicates, assertManifestComplete, sweepTargets } = require('./importRules.logic');
const { loadBookableRound, loadRoundVoyages, match, describe } = require('./bookingVoyage.service');
const { assertPartner } = require('./partnerScope');

// ── Sprint 042 — single source of truth for the import's recognized columns.
// Used by BOTH the downloadable blank template (buildImportTemplate) AND the
// frontend's "Expected Excel Columns" guide card (via getTemplateColumns,
// GET /bookings/import/template-columns) — never duplicated as a second,
// hand-maintained array on the frontend, so the two can never drift apart.
// `required` mirrors EXCEL_COLUMN_MAP's primary alias per internal field;
// imdgCode is conditionally required (only when Hazardous=Yes) and is
// deliberately NOT flagged required here — same as Sprint 041's original
// frontend-only TEMPLATE_FIELDS list this replaces.
const TEMPLATE_FIELDS = [
  { header: 'Container Number', field: 'containerNumber', note: 'Primary match key e.g. MSCU1234567', required: true },
  { header: 'Container Type',   field: 'containerType',   note: 'e.g. 40HC, 20DRY — code or size', required: true },
  { header: 'Container Size',   field: 'containerSize',   note: 'e.g. 40ft, 20ft. Also accepts: Size, Length', required: false },
  { header: 'Container Status', field: 'containerStatus', note: 'Full or Empty only', required: true },
  { header: 'POL',              field: 'pol',             note: "Port of Loading — with the POD it decides the voyage automatically", required: true },
  { header: 'POD',              field: 'pod',             note: "Port of Discharge — may be an intermediate port of a run; the voyage is assigned automatically", required: true },
  { header: 'Rate',             field: 'rate',            note: 'Freight rate per container (one row = one container)', required: true },
  { header: 'Booking Number',   field: 'bookingNumber',   note: 'Optional — auto-generated if blank', required: false },
  { header: 'Shipper',          field: 'shipper',         note: 'Optional — shipper company name', required: false },
  { header: 'Consignee',        field: 'consignee',       note: 'Optional — consignee company name', required: false },
  { header: 'Carrier Name',     field: 'carrierName',     note: 'Optional — e.g. MSC, Maersk. Also accepts: Carrier', required: false },
  { header: 'Commodity',        field: 'commodity',       note: 'Optional — cargo description', required: false },
  { header: 'VGM',              field: 'vgm',             note: 'Optional — Verified Gross Mass in kg', required: false },
  { header: 'Hazardous',        field: 'dg',              note: 'Optional — Yes/No. Also accepts: DG, Dangerous Goods', required: false },
  { header: 'IMDG Code',        field: 'imdgCode',        note: 'Required if Hazardous=Yes — free text e.g. 3.1, UN1203', required: false },
];

const getTemplateColumns = () => TEMPLATE_FIELDS;

// Sprint 042 — required column headers get a light red fill, optional
// columns a light yellow fill. Only the header CELL is colored, not the
// full column (confirmed client request). SheetJS (xlsx) community edition
// cannot write cell styles at all, which is why this moved server-side —
// ExcelJS already does this exact fill pattern in export.service.js.
const buildImportTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Logistics SaaS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Import Template');
  worksheet.columns = TEMPLATE_FIELDS.map(f => ({
    header: f.header, key: f.field, width: Math.max(f.header.length + 4, 16),
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.height = 20;
  headerRow.eachCell((cell, colNumber) => {
    const field = TEMPLATE_FIELDS[colNumber - 1];
    cell.font      = { bold: true, color: { argb: 'FF3A2020' } };
    cell.fill      = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: field.required ? 'FFF8D7DA' : 'FFFFF3CD' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  return workbook.xlsx.writeBuffer();
};

// ── Helpers ───────────────────────────────────────────────────────────────────
// Sprint 041: case-insensitive — Excel cell text case (Yes/YES/TRUE/etc.) must
// not silently read as false. Accepted literal value set is unchanged, only
// matched case-insensitively now (same normalization pattern already used
// below for containerType/containerSize/pol/pod/containerNumber).
const parseDg = (val) => {
  if (val === true || val === 1) return true;
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
};

// Sprint 041: case-insensitive Full/Empty matching — returns the canonical
// 'Full'/'Empty' string, or null if unrecognized.
const normContainerStatus = (val) => {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'full') return 'Full';
  if (s === 'empty') return 'Empty';
  return null;
};

const parseNum = (val) =>
  val !== undefined && val !== '' && val !== null && !isNaN(Number(val))
    ? Number(val)
    : null;

const normCntr = (val) =>
  val ? String(val).trim().toUpperCase() : '';


// ── Validate a single row ─────────────────────────────────────────────────────
// Required-field checks only. Unknown ports / same port / voyage matching live in analyseRows below.
const validateRow = (row) => {
  const errors = [];
  // containerNumber is now required — it is the primary match key
  if (!row.containerNumber || !row.containerNumber.trim())
    errors.push('Container Number is required');
  if (!row.pol) errors.push('POL is required');
  if (!row.pod) errors.push('POD is required');
  if (!row.containerType && !row.containerSize) errors.push('Container Type is required');
  // Sprint 025: quantity removed from Layer 2; one row = one container
  if (row.rate === undefined || row.rate === '' || isNaN(Number(row.rate)) || Number(row.rate) < 0)
    errors.push('Rate must be a non-negative number');
  // Sprint 026: currency removed; containerStatus required; dgPercent -> imdgCode
  if (!row.containerStatus) errors.push('Container Status is required');
  else if (!normContainerStatus(row.containerStatus))
    errors.push('Container Status must be Full or Empty');
  if (parseDg(row.dg) && (!row.imdgCode || !String(row.imdgCode).trim()))
    errors.push('IMDG Code is required when Hazardous is Yes');
  return errors;
};

// ── Bookings sprint 2026-11-10 ─────────────────────────────────────────────────
// Scope = (Round + Agent). The voyage of every row is assigned by the server from the row's own POL/POD
// (voyageMatch.logic: a run that visits POL and then POD, in the right direction). `voyageOverrideId` is only
// the user's pick among the candidates of an ambiguous row. Save never trusts the preview echo: it analyses the
// raw rows again, so every id comes from the server (FL-02).

const inTransaction = async (fn) => {
  const s = await mongoose.startSession();
  try {
    let out;
    await s.withTransaction(async () => { out = await fn(s); });
    return out;
  } finally { s.endSession(); }
};

const voyageView = (c) => (c ? {
  _id: c.voyageId, voyageNumber: c.voyageNumber, voyageName: c.voyageName, direction: c.direction, status: c.status,
  polLegKey: c.polLegKey, podLegKey: c.podLegKey,
} : null);

// A partner user may only import plain bookings (Final Loading and Discharge bulk-change bookings they do not own).
const assertImportAllowed = (importType, scope) => {
  if (scope && importType !== 'booking') throw { status: 403, message: 'Partner users can only import bookings' };
};

/** Existing live bookings of the agent in the round by container number, and which of them sit on a live invoice. */
const loadExisting = async (containers, roundVoyageIds, agentId) => {
  const found = containers.length
    ? await Booking.find({ containerNumber: { $in: containers }, voyageId: { $in: roundVoyageIds }, agentId }).lean()
    : [];
  const byContainer = {};
  found.forEach((b) => { (byContainer[b.containerNumber] = byContainer[b.containerNumber] || []).push(b); });
  const existingMap = {};
  Object.keys(byContainer).forEach((c) => { const e = pickExisting(byContainer[c]); if (e) existingMap[c] = e; });

  const invoicedIds = new Set();
  const ids = Object.values(existingMap).map((b) => b._id);
  if (ids.length) {
    const Invoice = require('../invoices/invoice.model');
    const billed = await Invoice.find({
      status: { $ne: 'Cancelled' },
      lineItems: { $elemMatch: { bookingId: { $in: ids }, orphaned: { $ne: true } } },
    }).select('lineItems.bookingId').lean();
    billed.forEach((i) => i.lineItems.forEach((li) => invoicedIds.add(String(li.bookingId))));
  }
  return { existingMap, invoicedIds };
};

/** Every row, analysed from its raw fields. Used by preview AND save. */
const analyseRows = async ({ rows, agentId, roundId, importType, scope = null }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows provided' };
  if (!agentId)      throw { status: 400, message: 'Agent is required' };
  if (!roundId)      throw { status: 400, message: 'Round is required' };
  assertImportAllowed(importType, scope);
  await require('../agents/agent.service').assertBookingSource(agentId);
  await loadBookableRound(roundId);

  const voyages = await loadRoundVoyages(roundId);
  if (!voyages.length) throw { status: 404, message: 'No voyages found in this Round' };
  const roundVoyageIds = voyages.map((v) => v._id);

  const [containerTypes, ports] = await Promise.all([
    ContainerType.find({}).lean(),
    Port.find({}).select('name code').lean(),
  ]);
  const ctMap = {};
  containerTypes.forEach((ct) => {
    ctMap[ct.code.toUpperCase()]                 = ct;
    ctMap[ct.size.toUpperCase()]                 = ct;
    ctMap[`${ct.code}:${ct.size}`.toUpperCase()] = ct;
  });
  const portMap = {};
  ports.forEach((p) => {
    if (p.name) portMap[p.name.trim().toUpperCase()] = p;
    if (p.code) portMap[p.code.trim().toUpperCase()] = p;
  });

  const { existingMap, invoicedIds } = await loadExisting(rows.map((r) => normCntr(r.containerNumber)).filter(Boolean), roundVoyageIds, agentId);

  const out = rows.map((row, idx) => {
    const errors = validateRow(row);
    const cntr = normCntr(row.containerNumber);

    const ct =
      ctMap[`${row.containerType}:${row.containerSize}`.toUpperCase()] ||
      ctMap[(row.containerType || '').toUpperCase()]                    ||
      ctMap[(row.containerSize || '').toUpperCase()]                    ||
      null;
    if (!ct && (row.containerType || row.containerSize)) {
      errors.push(`Container type "${((row.containerType || '') + ' ' + (row.containerSize || '')).trim()}" not found in system`);
    }

    const polPort = portMap[(row.pol || '').trim().toUpperCase()] || null;
    const podPort = portMap[(row.pod || '').trim().toUpperCase()] || null;
    if (row.pol && !polPort) errors.push(`POL "${row.pol}" not found in system`);
    if (row.pod && !podPort) errors.push(`POD "${row.pod}" not found in system`);
    if (polPort && podPort && String(polPort._id) === String(podPort._id)) errors.push('POL and POD cannot be the same port');

    let res = { status: 'unresolved', voyage: null, candidates: [] };
    if (polPort && podPort && String(polPort._id) !== String(podPort._id)) {
      res = describe(match({ voyages, polId: polPort._id, podId: podPort._id, voyageId: row.voyageOverrideId || undefined }));
    }
    let voyageError = null;
    if (!errors.length) {
      if (res.overrideInvalid) voyageError = 'The selected voyage does not run from this POL to this POD';
      else if (res.status === 'unresolved') voyageError = 'No voyage in this Round runs from this POL to this POD';
      else if (res.status === 'ambiguous') voyageError = 'Several voyages in this Round run from this POL to this POD — choose the intended one';
    }

    const existingDoc = cntr ? existingMap[cntr] || null : null;
    let rowStatus;
    let existingError = null;
    if (errors.length) {
      rowStatus = 'invalid';
    } else if (res.status !== 'resolved') {
      rowStatus = res.status; // 'unresolved' | 'ambiguous'
    } else {
      const c = classifyExisting({ importType, existing: existingDoc, invoiced: existingDoc ? invoicedIds.has(String(existingDoc._id)) : false, partnerScope: scope });
      rowStatus = c.rowStatus;
      existingError = c.error || null;
    }

    return {
      _rowIndex:       idx,
      bookingNumber:   row.bookingNumber   || '',
      containerNumber: cntr,
      containerType:   row.containerType   || '',
      containerSize:   row.containerSize   || '',
      pol:             row.pol             || '',
      pod:             row.pod             || '',
      rate:            row.rate      != null ? String(row.rate) : '',
      shipper:         row.shipper         || '',
      consignee:       row.consignee       || '',
      carrierName:     row.carrierName     || '',
      commodity:       row.commodity       || '',
      vgm:             row.vgm      != null ? String(row.vgm)  : '',
      dg:              row.dg              || '',
      imdgCode:        row.imdgCode        || '',
      containerStatus: row.containerStatus || '',
      voyageOverrideId: row.voyageOverrideId || '',
      _resolvedCt:  ct      ? { _id: String(ct._id), code: ct.code, size: ct.size, type: ct.type } : null,
      _resolvedPol: polPort ? { _id: String(polPort._id), name: polPort.name, code: polPort.code } : null,
      _resolvedPod: podPort ? { _id: String(podPort._id), name: podPort.name, code: podPort.code } : null,
      _resolvedVoyage: res.voyage ? voyageView(res.voyage) : null,
      _voyageManual:   !!res.manual,
      _voyageRanked:   !!res.ranked,
      _voyageCandidates: (res.candidates || []).map(voyageView),
      _errors:     [...errors, ...(voyageError ? [voyageError] : []), ...(existingError ? [existingError] : [])],
      _rowStatus:  rowStatus,
      _existingId: existingDoc?._id || null,
      _existingBookingNumber: existingDoc?.bookingNumber || null,
    };
  });
  return { rows: markDuplicates(out), roundVoyageIds };
};

// ── Preview ───────────────────────────────────────────────────────────────────
const previewImport = async (args) => (await analyseRows(args)).rows;

// ── Save ──────────────────────────────────────────────────────────────────────
const saveImport = async ({ rows, agentId, roundId, importType, createdBy, partnerId = null, scope = null }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows to save' };
  const { rows: analysed, roundVoyageIds } = await analyseRows({ rows, agentId, roundId, importType, scope });

  const saveable = analysed.filter((r) => SAVEABLE.includes(r._rowStatus));
  if (importType === 'finalLoading') assertManifestComplete(analysed); // FL-04
  if (!saveable.length) throw { status: 400, message: 'No valid rows to save' };

  const labelPartner = scope || await assertPartner(partnerId); // null = leave the label alone
  const source = scope ? 'PartnerUser' : 'Staff';

  const toInsert = saveable.filter((r) => r._rowStatus === 'valid' || r._rowStatus === 'new');
  const toUpdate = saveable.filter((r) => r._rowStatus === 'update');
  const unchanged = saveable.filter((r) => r._rowStatus === 'unchanged');
  const failed = analysed.filter((r) => !SAVEABLE.includes(r._rowStatus))
    .map((r) => ({ containerNumber: r.containerNumber, reason: (r._errors || [])[0] || 'Unresolved' }));

  const needsNumber = toInsert.filter((r) => !r.bookingNumber?.trim());
  const autoNumbers = await nextNumberBatch('booking', needsNumber.length); // outside the transaction: a rollback burns numbers, never duplicates
  let autoIdx = 0;
  const docs = toInsert.map((r) => {
    const freightRate = Number(r.rate);
    const dgFlag = parseDg(r.dg);
    return {
      bookingNumber:   r.bookingNumber?.trim() || autoNumbers[autoIdx++],
      voyageId:        r._resolvedVoyage._id,
      agentId,
      shipper:         r.shipper      || null,
      consignee:       r.consignee    || null,
      carrierName:     r.carrierName  || null,
      polId:           r._resolvedPol._id,
      podId:           r._resolvedPod._id,
      polLegKey:       r._resolvedVoyage.polLegKey,
      podLegKey:       r._resolvedVoyage.podLegKey,
      partnerId:       labelPartner,
      source,
      containerTypeId: r._resolvedCt._id,
      freightRate,
      totalFreight:    freightRate, // flat rate per container
      commodity:       r.commodity       || null,
      containerNumber: r.containerNumber,
      vgm:             parseNum(r.vgm),
      dg:              dgFlag,
      imdgCode:        dgFlag ? (r.imdgCode?.trim() || null) : null,
      containerStatus: normContainerStatus(r.containerStatus),
      remarks:         `Imported (${importType})`,
      status:          'Pending',
      createdBy,
      updatedBy: createdBy,
    };
  });

  const ops = toUpdate.map((r) => {
    const freightRate = Number(r.rate);
    const dgFlag = parseDg(r.dg);
    const $set = {
      voyageId:        r._resolvedVoyage._id,
      containerTypeId: r._resolvedCt._id,
      polId:           r._resolvedPol._id,
      podId:           r._resolvedPod._id,
      polLegKey:       r._resolvedVoyage.polLegKey,
      podLegKey:       r._resolvedVoyage.podLegKey,
      freightRate,
      totalFreight:    freightRate,
      dg:              dgFlag,
      imdgCode:        dgFlag ? (r.imdgCode?.trim() || null) : null,
      updatedBy:       createdBy,
    };
    if (labelPartner) { $set.partnerId = labelPartner; $set.source = source; }
    if (r.shipper        !== undefined) $set.shipper        = r.shipper        || null;
    if (r.consignee      !== undefined) $set.consignee      = r.consignee      || null;
    if (r.carrierName    !== undefined) $set.carrierName    = r.carrierName    || null;
    if (r.commodity      !== undefined) $set.commodity      = r.commodity      || null;
    if (r.vgm            !== undefined) $set.vgm            = parseNum(r.vgm);
    if (r.containerStatus !== undefined) $set.containerStatus = normContainerStatus(r.containerStatus);
    return { updateOne: { filter: { _id: r._existingId, status: { $in: ['Pending', 'Confirmed'] } }, update: { $set } } };
  });

  // One transaction: a failed write rolls the whole file back (FL-04). Nothing is half-imported.
  const result = await inTransaction(async (s) => {
    const createdDocs = docs.length ? await Booking.insertMany(docs, { session: s }) : [];
    if (ops.length) await Booking.bulkWrite(ops, { session: s });

    const created = createdDocs.map((b) => b.containerNumber);
    const updated = toUpdate.map((r) => r.containerNumber);
    const manifestIds = [...createdDocs.map((b) => b._id), ...toUpdate.map((r) => r._existingId), ...unchanged.map((r) => r._existingId)];
    const markedFinalLoading = [];
    const cancelled = [];

    if (importType === 'finalLoading') {
      // F-07: refuse, before cancelling, if a booking missing from the file is billed on a live invoice.
      const live = await Booking.find({ voyageId: { $in: roundVoyageIds }, agentId, status: { $ne: 'Cancelled' } }).session(s).lean();
      const doomed = sweepTargets(live, saveable.map((r) => r.containerNumber));
      if (doomed.length) {
        const Invoice = require('../invoices/invoice.model');
        const billed = await Invoice.find({
          status: { $ne: 'Cancelled' },
          lineItems: { $elemMatch: { bookingId: { $in: doomed.map((b) => b._id) }, orphaned: { $ne: true } } },
        }).select('invoiceNumber lineItems.bookingId').session(s).lean();
        if (billed.length) {
          const containers = doomed.filter((b) => billed.some((i) => i.lineItems.some((li) => String(li.bookingId) === String(b._id)))).map((b) => b.containerNumber);
          const err = new AppError(409,
            `Cannot import: ${containers.length} booking(s) missing from this Final Loading file are on live invoices (${billed.map((i) => i.invoiceNumber).join(', ')}). Raise a credit note or cancel the invoice first. Containers: ${containers.slice(0, 10).join(', ')}${containers.length > 10 ? '…' : ''}`,
            'BOOKING_INVOICED');
          err.invoices = billed.map((i) => i.invoiceNumber); err.containers = containers;
          throw err;
        }
      }

      await Booking.updateMany({ _id: { $in: manifestIds }, status: { $ne: 'Cancelled' } }, { $set: { status: 'Final Loading', updatedBy: createdBy } }, { session: s });
      saveable.forEach((r) => markedFinalLoading.push(r.containerNumber));

      if (doomed.length) {
        const doomedIds = doomed.map((b) => b._id);
        await Booking.updateMany({ _id: { $in: doomedIds } }, { $set: { status: 'Cancelled', updatedBy: createdBy } }, { session: s });
        doomed.forEach((b) => cancelled.push(b.containerNumber));
        // Sprint 033 Edge Case 1: flag any (already refused above unless orphaned) invoice line of a cancelled booking.
        const Invoice = require('../invoices/invoice.model');
        await Invoice.updateMany(
          { 'lineItems.bookingId': { $in: doomedIds }, status: { $ne: 'Cancelled' } },
          { $set: { 'lineItems.$[li].orphaned': true, 'lineItems.$[li].orphanedAt': new Date(), 'lineItems.$[li].orphanedReason': 'Booking cancelled by Final Loading import reconciliation (Sprint 031)' } },
          { arrayFilters: [{ 'li.bookingId': { $in: doomedIds }, 'li.orphaned': false }], session: s }
        );
      }
    }
    return { created, updated, unchanged: unchanged.map((r) => r.containerNumber), markedFinalLoading, cancelled };
  });

  invalidateRoundCache(roundId);
  require('../billing/bookingItem.service').scheduleSync({ roundId }); // Final Loading changes the invoiceable items
  return { ...result, failed, total: saveable.length };
};

// ═══════════════════════════════════════════════════════════════════════════
// Discharge import (Sprint 045, reworked 2026-11-10). The scope is no longer one voyage: it is
// (Round + Agent + POD [+ POL] [+ Voyage]) — the Final Loading bookings that end at the port where the
// discharge happened. A container booked to a LATER port is neither Discharged nor Remaining here.
// Matched rows -> Discharged; the other bookings of the scope -> Remaining. `status` is never touched.
// Save re-analyses the raw rows (never trusts the preview echo).
// ═══════════════════════════════════════════════════════════════════════════

const norm = (s) => String(s || '').trim().toUpperCase();

const analyseDischarge = async ({ rows, agentId, roundId, polId, podId, voyageId }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows provided' };
  if (!agentId)      throw { status: 400, message: 'Agent is required' };
  if (!roundId)      throw { status: 400, message: 'Round is required' };
  if (!podId)        throw { status: 400, message: 'POD (the port where the discharge happened) is required' };

  const voyages = await Voyage.find({ roundId }).select('voyageNumber').lean();
  if (!voyages.length) throw { status: 404, message: 'No voyages found in this Round' };
  const voyagesById = {};
  voyages.forEach((v) => { voyagesById[String(v._id)] = v; });
  const roundVoyageIds = voyages.map((v) => v._id);
  if (voyageId && !voyagesById[String(voyageId)]) throw { status: 400, message: 'The voyage does not belong to this Round' };

  // Wider than the scope on purpose: lets each row say precisely why it does not match.
  const candidates = await Booking.find({ agentId, voyageId: { $in: roundVoyageIds } })
    .populate('polId', 'name code').populate('podId', 'name code').lean();
  const byContainer = {};
  candidates.forEach((b) => { if (b.containerNumber && (!byContainer[b.containerNumber] || byContainer[b.containerNumber].status === 'Cancelled')) byContainer[b.containerNumber] = b; });

  const inScope = (b) => b.status === 'Final Loading'
    && String(b.podId?._id || b.podId) === String(podId)
    && (!polId || String(b.polId?._id || b.polId) === String(polId))
    && (!voyageId || String(b.voyageId) === String(voyageId));

  const out = rows.map((row, idx) => {
    const errors = [];
    const cntr = normCntr(row.containerNumber);
    if (!cntr) errors.push('Container Number is required');
    const existing = cntr ? byContainer[cntr] : null;
    let matchStatus = 'not-found';

    if (cntr && !existing) {
      errors.push('No booking found for this container in this Round/Agent');
    } else if (existing && existing.status !== 'Final Loading') {
      errors.push(`Booking exists but is not Final Loading (current status: ${existing.status}) — cannot record a discharge outcome for it`);
      matchStatus = 'wrong-status';
    } else if (existing && voyageId && String(existing.voyageId) !== String(voyageId)) {
      errors.push(`Container belongs to voyage ${voyagesById[String(existing.voyageId)]?.voyageNumber || 'another voyage'}, not the selected voyage`);
      matchStatus = 'wrong-voyage';
    } else if (existing && !inScope(existing)) {
      errors.push(`Container is booked ${existing.polId?.name || '?'} → ${existing.podId?.name || '?'}, outside the selected port scope`);
      matchStatus = 'port-mismatch';
    } else if (existing) {
      matchStatus = 'match';
    }

    // The row's own POL/POD text must agree with the booking's own ports (never auto-corrected).
    if (matchStatus === 'match' && (row.pol || row.pod)) {
      const polOk = !row.pol || norm(row.pol) === norm(existing.polId?.name) || norm(row.pol) === norm(existing.polId?.code);
      const podOk = !row.pod || norm(row.pod) === norm(existing.podId?.name) || norm(row.pod) === norm(existing.podId?.code);
      if (!polOk || !podOk) {
        errors.push(`Row POL/POD ("${row.pol || '—'}" → "${row.pod || '—'}") does not match the booking's ports (${existing.polId?.name || '?'} → ${existing.podId?.name || '?'})`);
        matchStatus = 'port-mismatch';
      }
    }

    return {
      _rowIndex:       idx,
      containerNumber: cntr,
      pol:             row.pol || '',
      pod:             row.pod || '',
      bookingNumber:   existing?.bookingNumber || '',
      _existingId:     existing?._id || null,
      _matchStatus:    matchStatus,
      _errors:         errors,
      _rowStatus:      errors.length > 0 ? 'invalid' : 'match',
    };
  });
  return { rows: out, candidates: candidates.filter(inScope) };
};

const previewDischargeImport = async (args) => (await analyseDischarge(args)).rows;

const saveDischargeImport = async ({ rows, agentId, roundId, polId, podId, voyageId, createdBy }) => {
  await lock.assertRoundOpen(roundId);
  if (!rows?.length) throw { status: 400, message: 'No rows to save' };
  const { rows: analysed, candidates } = await analyseDischarge({ rows, agentId, roundId, polId, podId, voyageId });

  const matched = analysed.filter((r) => r._rowStatus === 'match' && r._existingId);
  if (!matched.length) throw { status: 400, message: 'No valid rows to save' };
  const matchedIds = matched.map((r) => r._existingId);
  const matchedSet = new Set(matchedIds.map(String));
  const remainingIds = candidates.filter((b) => !matchedSet.has(String(b._id))).map((b) => b._id);

  await inTransaction(async (s) => {
    // Idempotent: re-confirming an already-Discharged booking just refreshes dischargedAt.
    await Booking.updateMany({ _id: { $in: matchedIds } }, { $set: { dischargeStatus: 'Discharged', dischargedAt: new Date(), updatedBy: createdBy } }, { session: s });
    // Every OTHER Final Loading booking of the scope not in the file -> Remaining. Always reflects the latest upload.
    if (remainingIds.length) {
      await Booking.updateMany({ _id: { $in: remainingIds } }, { $set: { dischargeStatus: 'Remaining', updatedBy: createdBy } }, { session: s });
    }
  });

  invalidateRoundCache(roundId);
  return {
    discharged:     matched.map((r) => r.containerNumber),
    remainingCount: remainingIds.length,
    failed:         analysed.filter((r) => r._rowStatus !== 'match')
                            .map((r) => ({ containerNumber: r.containerNumber, reason: (r._errors || [])[0] || 'Unresolved' })),
    total: matched.length,
  };
};

module.exports = {
  previewImport, saveImport, getTemplateColumns, buildImportTemplate,
  previewDischargeImport, saveDischargeImport,
};
