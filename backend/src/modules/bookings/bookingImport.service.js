'use strict';

const Booking       = require('./booking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const Port          = require('../locations/port.model');
const { nextNumberBatch } = require('../../utils/autoNumber');
const { invalidateRoundCache } = require('../capacity/capacity.service');

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseDg = (val) =>
  val === true || val === 'true' || val === 'yes' || val === '1' || val === 1;

const parseNum = (val) =>
  val !== undefined && val !== '' && val !== null && !isNaN(Number(val))
    ? Number(val)
    : null;

const normCntr = (val) =>
  val ? String(val).trim().toUpperCase() : '';

// ── Validate a single row ─────────────────────────────────────────────────────
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
  else if (!['Full', 'Empty'].includes(row.containerStatus))
    errors.push('Container Status must be Full or Empty');
  if (parseDg(row.dg) && (!row.imdgCode || !String(row.imdgCode).trim()))
    errors.push('IMDG Code is required when Hazardous is Yes');
  return errors;
};

// ── Preview ───────────────────────────────────────────────────────────────────
const previewImport = async ({ rows, agentId, voyageId, importType }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows provided' };
  if (!agentId)      throw { status: 400, message: 'Agent is required' };
  if (!voyageId)     throw { status: 400, message: 'Voyage is required' };

  const voyage = await Voyage.findById(voyageId)
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

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

  // Match by containerNumber within this (Voyage + Agent) scope only — Sprint 026
  const incomingCntrs = rows.map(r => normCntr(r.containerNumber)).filter(Boolean);
  const existingBookings = await Booking.find({
    containerNumber: { $in: incomingCntrs },
    voyageId,
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
    if (row.pol && !polPort) validationErrors.push(`POL "${row.pol}" not found in system`);

    const podPort = portMap[(row.pod || '').trim().toUpperCase()] || null;
    if (row.pod && !podPort) validationErrors.push(`POD "${row.pod}" not found in system`);

    if (polPort && podPort && String(polPort._id) === String(podPort._id))
      validationErrors.push('POL and POD cannot be the same port');

    const existingDoc  = cntr ? existingMap[cntr] : null;
    const hasError     = validationErrors.length > 0;
    // Sprint 026: both modes treat existing container as 'update' (not 'duplicate')
    // Booking Import: Create or Update — never skip an existing container
    // Final Loading Import: Create or Update — then reconcile
    const isUpdate     = !!existingDoc;

    let rowStatus;
    if (hasError)                           rowStatus = 'invalid';
    else if (isUpdate)                      rowStatus = 'update';
    else if (importType === 'finalLoading') rowStatus = 'new';
    else                                    rowStatus = 'valid';

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
      _resolvedCt:  ct      ? { _id: String(ct._id), code: ct.code, size: ct.size, type: ct.type } : null,
      _resolvedPol: polPort ? { _id: String(polPort._id), name: polPort.name, code: polPort.code } : null,
      _resolvedPod: podPort ? { _id: String(podPort._id), name: podPort.name, code: podPort.code } : null,
      _errors:     validationErrors,
      _rowStatus:  rowStatus,
      _existingId: existingDoc?._id || null,
      // expose existing booking number so it can be reused on update
      _existingBookingNumber: existingDoc?.bookingNumber || null,
    };
  });
};

// ── Save ──────────────────────────────────────────────────────────────────────
const saveImport = async ({ rows, agentId, voyageId, importType, createdBy }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows to save' };
  if (!voyageId)     throw { status: 400, message: 'Voyage is required' };

  // BUG-001: resolve roundId upfront — cache invalidation is a required
  // post-mutation step, not fire-and-forget cleanup. The voyage's existence
  // is already validated in previewImport() at preview time, so this lookup
  // should not fail; if it does, it bubbles up as a 500 (correct — the
  // import should not proceed on a voyage we cannot resolve).
  const affectedVoyage = await Voyage.findById(voyageId).select('roundId').lean();
  const roundId = affectedVoyage?.roundId ?? null;

  const saveable = rows.filter(r =>
    r._rowStatus === 'valid' || r._rowStatus === 'new' || r._rowStatus === 'update'
  );
  if (!saveable.length) throw { status: 400, message: 'No valid rows to save' };

  const toInsert = saveable.filter(r => r._rowStatus === 'valid' || r._rowStatus === 'new');
  const toUpdate = saveable.filter(r => r._rowStatus === 'update');

  const failed  = [];
  const created = [];
  const updated = [];

  // ── BATCH INSERT via insertMany ───────────────────────────────────────────
  if (toInsert.length > 0) {
    const validInserts = toInsert.filter(r => {
      if (!r._resolvedCt || !r._resolvedPol || !r._resolvedPod || !r.containerNumber) {
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
          voyageId,
          agentId,
          shipper:         r.shipper      || null,
          consignee:       r.consignee    || null,
          carrierName:     r.carrierName  || null,
          polId:           r._resolvedPol._id,
          podId:           r._resolvedPod._id,
          containerTypeId: r._resolvedCt._id,
          freightRate,
          totalFreight:    freightRate, // flat rate per container
          commodity:       r.commodity       || null,
          containerNumber: r.containerNumber,           // always set — required field
          vgm:             parseNum(r.vgm),
          dg:              dgFlag,
          imdgCode:        dgFlag ? (r.imdgCode?.trim() || null) : null, // Sprint 026
          containerStatus: ['Full', 'Empty'].includes(r.containerStatus) ? r.containerStatus : null,
          remarks:         `Imported (${importType})`,
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
      if (!r._resolvedCt || !r._resolvedPol || !r._resolvedPod || !r._existingId) {
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
          voyageId, agentId,
          containerTypeId: r._resolvedCt._id,
          polId:           r._resolvedPol._id,
          podId:           r._resolvedPod._id,
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
          $set.containerStatus = ['Full', 'Empty'].includes(r.containerStatus) ? r.containerStatus : null;
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

  // ── Final Loading reconciliation — by containerNumber ────────────────────
  const markedFinalLoading = [];
  const cancelled          = [];
  // savedContainerNumbers = the set imported in this run
  const savedContainerNumbers = new Set([...created, ...updated]);

  if (importType === 'finalLoading') {
    if (savedContainerNumbers.size > 0) {
      // Mark all imported containers on this voyage as Final Loading
      await Booking.updateMany(
        { containerNumber: { $in: [...savedContainerNumbers] }, voyageId, isDeleted: false },
        { $set: { status: 'Final Loading', updatedBy: createdBy } }
      );
      savedContainerNumbers.forEach(n => markedFinalLoading.push(n));
    }

    // Cancel every booking in the (Voyage + Agent) scope whose containerNumber is NOT in the manifest
    // Sprint 026: agentId filter ensures other agents' bookings are never affected
    const cancelResult = await Booking.updateMany(
      {
        voyageId,
        agentId,
        isDeleted: false,
        status:    { $nin: ['Cancelled'] },
        containerNumber: { $nin: [...savedContainerNumbers] },
      },
      { $set: { status: 'Cancelled', updatedBy: createdBy } }
    );
    if (cancelResult.modifiedCount > 0) {
      const cancelledDocs = await Booking.find(
        { voyageId, isDeleted: false, status: 'Cancelled' },
        { containerNumber: 1 }
      ).lean();
      cancelledDocs.forEach(b => {
        if (b.containerNumber && !savedContainerNumbers.has(b.containerNumber))
          cancelled.push(b.containerNumber);
      });
    }
  }

  // Invalidate capacity cache — bookings for this voyage's round changed
  if (roundId) {
    invalidateRoundCache(roundId);
  }

  return { created, updated, failed, markedFinalLoading, cancelled, total: saveable.length };
};

module.exports = { previewImport, saveImport };
