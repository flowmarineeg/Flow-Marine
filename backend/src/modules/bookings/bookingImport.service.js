'use strict';

const ExcelJS       = require('exceljs');
const Booking       = require('./booking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const Port          = require('../locations/port.model');
const { nextNumberBatch } = require('../../utils/autoNumber');
const { invalidateRoundCache } = require('../capacity/capacity.service');

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
  { header: 'POL',              field: 'pol',             note: "Port of Loading — used to auto-resolve this row's Voyage", required: true },
  { header: 'POD',              field: 'pod',             note: "Port of Discharge — used to auto-resolve this row's Voyage", required: true },
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

const portPairKey = (polId, podId) => `${polId}_${podId}`;

// ── Validate a single row ─────────────────────────────────────────────────────
// Sprint 031: POL/POD "not found in system" / "same port" checks moved out of
// here — they are now resolved as part of Round-scoped voyage resolution
// (see resolveRowVoyage below), since a POL/POD text mismatch is recoverable
// via manual Voyage selection, not necessarily a hard data error.
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

// ── Sprint 031: Round-scoped per-row Voyage resolution ────────────────────────
// Resolves a row's target Voyage from POL/POD matched against the Round's own
// active voyages — never a global port map, and never a single pre-selected
// voyage. A row may instead carry a manual override (`voyageOverrideId`, set
// by the user only for rows the system could not resolve on its own).
const resolveRowVoyage = ({ polPort, podPort, voyageOverrideId, voyagesByPair, voyagesById }) => {
  if (voyageOverrideId) {
    const chosen = voyagesById[String(voyageOverrideId)];
    if (chosen) return { voyage: chosen, candidates: [], status: 'resolved', manual: true };
    return { voyage: null, candidates: [], status: 'unresolved', manual: true, overrideInvalid: true };
  }

  if (!polPort || !podPort) return { voyage: null, candidates: [], status: 'unresolved', manual: false };

  const candidates = voyagesByPair[portPairKey(polPort._id, podPort._id)] || [];
  if (candidates.length === 1) return { voyage: candidates[0], candidates: [], status: 'resolved', manual: false };
  if (candidates.length === 0) return { voyage: null, candidates: [], status: 'unresolved', manual: false };
  return { voyage: null, candidates, status: 'ambiguous', manual: false };
};

const serializeVoyage = (v) => ({
  _id:          String(v._id),
  voyageNumber: v.voyageNumber,
  voyageName:   v.voyageName || null,
  status:       v.status,
  polId:        v.polId ? { _id: String(v.polId._id), name: v.polId.name, code: v.polId.code } : null,
  podId:        v.podId ? { _id: String(v.podId._id), name: v.podId.name, code: v.podId.code } : null,
});

// ── Preview ───────────────────────────────────────────────────────────────────
const previewImport = async ({ rows, agentId, roundId, importType }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows provided' };
  if (!agentId)      throw { status: 400, message: 'Agent is required' };
  if (!roundId)      throw { status: 400, message: 'Round is required' };

  const roundVoyages = await Voyage.find({ roundId })
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .lean();
  if (!roundVoyages.length) throw { status: 404, message: 'No voyages found in this Round' };

  // Resolution candidates exclude Cancelled voyages — a row should never
  // auto-resolve (or be manually assignable) onto a cancelled leg.
  const activeVoyages = roundVoyages.filter(v => v.status !== 'Cancelled');
  const voyagesById = {};
  activeVoyages.forEach(v => { voyagesById[String(v._id)] = v; });
  const voyagesByPair = {};
  activeVoyages.forEach(v => {
    if (!v.polId || !v.podId) return;
    const key = portPairKey(v.polId._id, v.podId._id);
    (voyagesByPair[key] = voyagesByPair[key] || []).push(v);
  });

  // All voyages in the Round (including Cancelled) — used only to scope the
  // existing-booking lookup, since a stale booking may sit on a voyage that
  // has since been cancelled and should still be found/reconciled.
  const allRoundVoyageIds = roundVoyages.map(v => v._id);

  const [containerTypes, ports] = await Promise.all([
    ContainerType.find({ isDeleted: false }).lean(),
    Port.find({ isDeleted: false }).select('name code').lean(),
  ]);

  const ctMap = {};
  containerTypes.forEach(ct => {
    ctMap[ct.code.toUpperCase()]                 = ct;
    ctMap[ct.size.toUpperCase()]                 = ct;
    ctMap[`${ct.code}:${ct.size}`.toUpperCase()] = ct;
  });

  const portMap = {};
  ports.forEach(p => {
    if (p.name) portMap[p.name.trim().toUpperCase()] = p;
    if (p.code) portMap[p.code.trim().toUpperCase()] = p;
  });

  // Sprint 031: matching scope broadened from (Voyage + Agent) to
  // (Round + Agent) — a container's resolved voyage may legitimately be
  // corrected between import runs within the same Round.
  const incomingCntrs = rows.map(r => normCntr(r.containerNumber)).filter(Boolean);
  const existingBookings = await Booking.find({
    containerNumber: { $in: incomingCntrs },
    voyageId: { $in: allRoundVoyageIds },
    agentId,
    isDeleted: false,
  }).lean();
  const existingMap = {}; // containerNumber -> booking doc
  existingBookings.forEach(b => {
    if (b.containerNumber) existingMap[b.containerNumber] = b;
  });

  return rows.map((row, idx) => {
    const validationErrors = validateRow(row);
    const cntr = normCntr(row.containerNumber);

    const ct =
      ctMap[`${row.containerType}:${row.containerSize}`.toUpperCase()] ||
      ctMap[(row.containerType || '').toUpperCase()]                    ||
      ctMap[(row.containerSize || '').toUpperCase()]                    ||
      null;
    if (!ct && (row.containerType || row.containerSize)) {
      validationErrors.push(`Container type "${((row.containerType || '') + ' ' + (row.containerSize || '')).trim()}" not found in system`);
    }

    const polPort = portMap[(row.pol || '').trim().toUpperCase()] || null;
    const podPort = portMap[(row.pod || '').trim().toUpperCase()] || null;
    if (polPort && podPort && String(polPort._id) === String(podPort._id))
      validationErrors.push('POL and POD cannot be the same port');

    const hasError = validationErrors.length > 0;

    const voyageRes = resolveRowVoyage({
      polPort, podPort,
      voyageOverrideId: row.voyageOverrideId || null,
      voyagesByPair, voyagesById,
    });

    let voyageError = null;
    if (voyageRes.overrideInvalid) {
      voyageError = 'Selected voyage is not an active voyage in this Round';
    } else if (voyageRes.status === 'unresolved') {
      voyageError = (!polPort || !podPort)
        ? 'POL/POD not recognized in this Round — select the voyage manually'
        : 'No voyage in this Round matches this POL → POD — select the voyage manually';
    } else if (voyageRes.status === 'ambiguous') {
      voyageError = 'Multiple voyages in this Round match this POL → POD — select the intended voyage';
    }

    const existingDoc = cntr ? existingMap[cntr] : null;

    let rowStatus;
    if (hasError) {
      rowStatus = 'invalid';
    } else if (voyageRes.status !== 'resolved') {
      rowStatus = voyageRes.status; // 'unresolved' | 'ambiguous'
    } else if (existingDoc) {
      rowStatus = 'update';
    } else if (importType === 'finalLoading') {
      rowStatus = 'new';
    } else {
      rowStatus = 'valid';
    }

    return {
      _rowIndex:       idx,
      bookingNumber:   row.bookingNumber   || '',   // kept for display — auto-generated if blank
      containerNumber: cntr,
      containerType:   row.containerType   || '',
      containerSize:   row.containerSize   || '',
      pol:             row.pol             || '',
      pod:             row.pod             || '',
      rate:            row.rate      != null ? String(row.rate) : '',
      // Sprint 026: currency removed
      shipper:         row.shipper         || '',
      consignee:       row.consignee       || '',
      carrierName:     row.carrierName     || '',
      commodity:       row.commodity       || '',
      vgm:             row.vgm      != null ? String(row.vgm)  : '',
      dg:              row.dg              || '',
      imdgCode:        row.imdgCode        || '',   // Sprint 026: replaces dgPercent
      containerStatus: row.containerStatus || '',
      voyageOverrideId: row.voyageOverrideId || '', // Sprint 031: manual fallback selection, echoed back
      _resolvedCt:  ct      ? { _id: String(ct._id), code: ct.code, size: ct.size, type: ct.type } : null,
      _resolvedPol: polPort ? { _id: String(polPort._id), name: polPort.name, code: polPort.code } : null,
      _resolvedPod: podPort ? { _id: String(podPort._id), name: podPort.name, code: podPort.code } : null,
      // Sprint 031: per-row Voyage resolution — replaces the single file-wide voyageId
      _resolvedVoyage: voyageRes.voyage ? serializeVoyage(voyageRes.voyage) : null,
      _voyageManual:   voyageRes.manual,
      _voyageCandidates: voyageRes.candidates.map(serializeVoyage),
      _errors:     voyageError ? [...validationErrors, voyageError] : validationErrors,
      _rowStatus:  rowStatus,
      _existingId: existingDoc?._id || null,
      // expose existing booking number so it can be reused on update
      _existingBookingNumber: existingDoc?.bookingNumber || null,
    };
  });
};

// ── Save ──────────────────────────────────────────────────────────────────────
const saveImport = async ({ rows, agentId, roundId, importType, createdBy }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows to save' };
  if (!roundId)      throw { status: 400, message: 'Round is required' };

  // All voyages in the Round (including Cancelled) — scopes the existing-
  // booking match and the Final Loading reconciliation sweep. The round's
  // existence/voyages were already validated in previewImport(); if this
  // comes back empty here it bubbles up as a 500 (correct — the import
  // should not proceed against a Round we cannot resolve).
  const roundVoyages = await Voyage.find({ roundId }).select('_id').lean();
  const roundVoyageIds = roundVoyages.map(v => v._id);

  const saveable = rows.filter(r =>
    r._rowStatus === 'valid' || r._rowStatus === 'new' || r._rowStatus === 'update'
  );
  if (!saveable.length) throw { status: 400, message: 'No valid rows to save' };

  const toInsert = saveable.filter(r => r._rowStatus === 'valid' || r._rowStatus === 'new');
  const toUpdate = saveable.filter(r => r._rowStatus === 'update');

  const failed  = [];
  const created = [];
  const updated = [];

  // Sprint 031: Booking Storage Rule (system standard, on par with Sprint 030) —
  // polId/podId are ALWAYS copied from the row's resolved Voyage, never from
  // the row's own free-text-resolved ports. The row's own POL/POD text is
  // used only as matching input during previewImport's voyage resolution.
  const remarksFor = (r) => {
    let remarks = `Imported (${importType})`;
    if (r._voyageManual && r._resolvedPol && r._resolvedPod && r._resolvedVoyage) {
      const samePol = String(r._resolvedPol._id) === String(r._resolvedVoyage.polId?._id);
      const samePod = String(r._resolvedPod._id) === String(r._resolvedVoyage.podId?._id);
      if (!samePol || !samePod) {
        remarks += ` — POL/POD auto-corrected from Excel text "${r.pol} → ${r.pod}" to match selected Voyage ${r._resolvedVoyage.voyageNumber} (${r._resolvedVoyage.polId?.name || '?'} → ${r._resolvedVoyage.podId?.name || '?'})`;
      }
    }
    return remarks;
  };

  // ── BATCH INSERT via insertMany ───────────────────────────────────────────
  if (toInsert.length > 0) {
    const validInserts = toInsert.filter(r => {
      if (!r._resolvedCt || !r._resolvedVoyage || !r.containerNumber) {
        failed.push({ containerNumber: r.containerNumber, reason: 'Unresolved references — re-validate before saving' });
        return false;
      }
      return true;
    });

    if (validInserts.length > 0) {
      // All inserts need a booking number — auto-generate if not supplied
      const needsNumber = validInserts.filter(r => !r.bookingNumber?.trim());
      const autoNumbers = await nextNumberBatch('booking', needsNumber.length);
      let autoIdx = 0;

      const docs = validInserts.map(r => {
        const bookingNumber = r.bookingNumber?.trim() || autoNumbers[autoIdx++];
        // Sprint 025: one row = one container; no quantity field
        const freightRate   = Number(r.rate);
        const dgFlag        = parseDg(r.dg);
        return {
          bookingNumber,
          voyageId:        r._resolvedVoyage._id,
          agentId,
          shipper:         r.shipper      || null,
          consignee:       r.consignee    || null,
          carrierName:     r.carrierName  || null,
          // Sprint 031: polId/podId always copied from the resolved Voyage
          polId:           r._resolvedVoyage.polId._id,
          podId:           r._resolvedVoyage.podId._id,
          containerTypeId: r._resolvedCt._id,
          freightRate,
          totalFreight:    freightRate, // flat rate per container
          commodity:       r.commodity       || null,
          containerNumber: r.containerNumber,           // always set — required field
          vgm:             parseNum(r.vgm),
          dg:              dgFlag,
          imdgCode:        dgFlag ? (r.imdgCode?.trim() || null) : null, // Sprint 026
          containerStatus: normContainerStatus(r.containerStatus),
          remarks:         remarksFor(r),
          status:          'Pending',
          createdBy,
          updatedBy: createdBy,
        };
      });

      try {
        const result = await Booking.insertMany(docs, { ordered: false });
        result.forEach(b => created.push(b.containerNumber));
      } catch (err) {
        if (err.insertedDocs) err.insertedDocs.forEach(b => created.push(b.containerNumber));
        if (err.writeErrors)  err.writeErrors.forEach(e => failed.push({ containerNumber: docs[e.index]?.containerNumber, reason: e.errmsg }));
      }
    }
  }

  // ── BATCH UPDATE via bulkWrite — match by containerNumber (_existingId) ───
  if (toUpdate.length > 0) {
    const validUpdates = toUpdate.filter(r => {
      if (!r._resolvedCt || !r._resolvedVoyage || !r._existingId) {
        failed.push({ containerNumber: r.containerNumber, reason: 'Unresolved references — re-validate before saving' });
        return false;
      }
      return true;
    });

    if (validUpdates.length > 0) {
      const ops = validUpdates.map(r => {
        // Sprint 025: one row = one container; no quantity field
        const freightRate = Number(r.rate);
        const dgFlag      = parseDg(r.dg);
        const $set = {
          // Sprint 031: voyageId may change between import runs within the
          // same Round (container reassigned to a different voyage leg) —
          // polId/podId always follow the resolved Voyage, never the row's
          // own text.
          voyageId:        r._resolvedVoyage._id,
          agentId,
          containerTypeId: r._resolvedCt._id,
          polId:           r._resolvedVoyage.polId._id,
          podId:           r._resolvedVoyage.podId._id,
          freightRate,
          totalFreight:    freightRate, // flat rate per container
          dg:              dgFlag,
          imdgCode:        dgFlag ? (r.imdgCode?.trim() || null) : null, // Sprint 026
          updatedBy:       createdBy,
        };
        if (r.shipper        !== undefined) $set.shipper        = r.shipper        || null;
        if (r.consignee      !== undefined) $set.consignee      = r.consignee      || null;
        if (r.carrierName    !== undefined) $set.carrierName    = r.carrierName    || null;
        if (r.commodity      !== undefined) $set.commodity      = r.commodity      || null;
        // containerNumber stays as-is on update — it IS the key
        if (r.vgm            !== undefined) $set.vgm            = parseNum(r.vgm);
        if (r.containerStatus !== undefined)
          $set.containerStatus = normContainerStatus(r.containerStatus);
        // Sprint 031: only touch remarks when the manual-correction audit note applies —
        // ordinary updates leave remarks untouched, same as before this sprint.
        if (r._voyageManual) {
          const note = remarksFor(r);
          if (note !== `Imported (${importType})`) $set.remarks = note;
        }
        return { updateOne: { filter: { _id: r._existingId }, update: { $set } } };
      });

      try {
        await Booking.bulkWrite(ops, { ordered: false });
        validUpdates.forEach(r => updated.push(r.containerNumber));
      } catch (err) {
        if (err.result?.nModified > 0) validUpdates.slice(0, err.result.nModified).forEach(r => updated.push(r.containerNumber));
        failed.push({ containerNumber: 'batch-update', reason: err.message });
      }
    }
  }

  // ── Final Loading reconciliation — Round + Agent scope (Sprint 031) ───────
  const markedFinalLoading = [];
  const cancelled          = [];
  // savedContainerNumbers = the set imported in this run
  const savedContainerNumbers = new Set([...created, ...updated]);

  if (importType === 'finalLoading') {
    if (savedContainerNumbers.size > 0) {
      // Mark all imported containers as Final Loading, across every voyage in the Round
      await Booking.updateMany(
        { containerNumber: { $in: [...savedContainerNumbers] }, voyageId: { $in: roundVoyageIds }, agentId, isDeleted: false },
        { $set: { status: 'Final Loading', updatedBy: createdBy } }
      );
      savedContainerNumbers.forEach(n => markedFinalLoading.push(n));
    }

    // Sprint 031: Final Loading represents the ENTIRE Round for ONE Agent —
    // cancel every booking for this agent, on ANY voyage in this Round,
    // whose containerNumber is NOT in the manifest. Other agents' bookings
    // are never affected (agentId filter, unchanged principle from Sprint 026).
    const cancelResult = await Booking.updateMany(
      {
        voyageId: { $in: roundVoyageIds },
        agentId,
        isDeleted: false,
        status:    { $nin: ['Cancelled'] },
        containerNumber: { $nin: [...savedContainerNumbers] },
      },
      { $set: { status: 'Cancelled', updatedBy: createdBy } }
    );
    if (cancelResult.modifiedCount > 0) {
      const cancelledDocs = await Booking.find(
        { voyageId: { $in: roundVoyageIds }, agentId, isDeleted: false, status: 'Cancelled' },
        { containerNumber: 1 }
      ).lean();
      cancelledDocs.forEach(b => {
        if (b.containerNumber && !savedContainerNumbers.has(b.containerNumber))
          cancelled.push(b.containerNumber);
      });

      // Sprint 033 Edge Case 1: a booking cancelled here may already be
      // referenced by a non-cancelled Invoice's lineItems (only Final Loading
      // bookings are ever invoiced — Decision 1 — so this reconciliation and
      // the invoiced population fully overlap). Ownership lives on the
      // Invoice side only (no field on Booking), so flag the matching line
      // item directly via arrayFilters — never silently leave the invoice
      // overstating its total.
      const cancelledIds = cancelledDocs.map(b => b._id);
      if (cancelledIds.length) {
        const Invoice = require('../invoices/invoice.model');
        await Invoice.updateMany(
          { 'lineItems.bookingId': { $in: cancelledIds }, isDeleted: false, status: { $ne: 'Cancelled' } },
          {
            $set: {
              'lineItems.$[li].orphaned':       true,
              'lineItems.$[li].orphanedAt':      new Date(),
              'lineItems.$[li].orphanedReason':  'Booking cancelled by Final Loading import reconciliation (Sprint 031)',
            },
          },
          { arrayFilters: [{ 'li.bookingId': { $in: cancelledIds }, 'li.orphaned': false }] }
        );
      }
    }
  }

  // Invalidate capacity cache — every voyage in this Round may have changed
  invalidateRoundCache(roundId);

  return { created, updated, failed, markedFinalLoading, cancelled, total: saveable.length };
};

module.exports = { previewImport, saveImport, getTemplateColumns, buildImportTemplate };
