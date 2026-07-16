'use strict';

const Booking       = require('./booking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const Port          = require('../locations/port.model');
const { nextNumber, nextNumberBatch } = require('../../utils/autoNumber');

// ─── Validate a single row ────────────────────────────────────────────────────
const validateRow = (row) => {
  const errors = [];
  if (!row.pol)       errors.push('POL is required');
  if (!row.pod)       errors.push('POD is required');
  if (!row.containerType && !row.containerSize) errors.push('Container Type is required');
  if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) < 1)
    errors.push('Quantity must be a positive number');
  if (row.rate === undefined || row.rate === '' || isNaN(Number(row.rate)) || Number(row.rate) < 0)
    errors.push('Rate must be a non-negative number');
  if (!row.currency) errors.push('Currency is required');
  return errors;
};

// ─── Preview ──────────────────────────────────────────────────────────────────
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

  const incomingNumbers = rows.map(r => r.bookingNumber).filter(Boolean);
  const existingBookings = await Booking.find({ bookingNumber: { $in: incomingNumbers }, isDeleted: false }).lean();
  const existingMap = {};
  existingBookings.forEach(b => { existingMap[b.bookingNumber] = b; });

  return rows.map((row, idx) => {
    const validationErrors = validateRow(row);

    const ct =
      ctMap[`${row.containerType}:${row.containerSize}`.toUpperCase()] ||
      ctMap[(row.containerType || '').toUpperCase()]                    ||
      ctMap[(row.containerSize || '').toUpperCase()]                    ||
      null;
    if (!ct && (row.containerType || row.containerSize)) {
      validationErrors.push(`Container type "${(row.containerType || '') + ' ' + (row.containerSize || '')}".trim() not found in system`);
    }

    const polPort = portMap[(row.pol || '').trim().toUpperCase()] || null;
    if (row.pol && !polPort) validationErrors.push(`POL "${row.pol}" not found in system`);

    const podPort = portMap[(row.pod || '').trim().toUpperCase()] || null;
    if (row.pod && !podPort) validationErrors.push(`POD "${row.pod}" not found in system`);

    if (polPort && podPort && String(polPort._id) === String(podPort._id)) {
      validationErrors.push('POL and POD cannot be the same port');
    }

    const hasError    = validationErrors.length > 0;
    const isDuplicate = importType === 'booking'      && !!existingMap[row.bookingNumber];
    const isUpdate    = importType === 'finalLoading' && !!existingMap[row.bookingNumber];

    let rowStatus;
    if (hasError)                           rowStatus = 'invalid';
    else if (isDuplicate)                   rowStatus = 'duplicate';
    else if (isUpdate)                      rowStatus = 'update';
    else if (importType === 'finalLoading') rowStatus = 'new';
    else                                    rowStatus = 'valid';

    return {
      _rowIndex: idx,
      bookingNumber: row.bookingNumber || '',
      containerNumber: row.containerNumber || '',
      containerType: row.containerType || '',
      containerSize: row.containerSize || '',
      pol: row.pol || '', pod: row.pod || '',
      quantity:  row.quantity  != null ? String(row.quantity) : '',
      rate:      row.rate      != null ? String(row.rate)     : '',
      currency:  row.currency  || 'USD',
      shipper:   row.shipper   || '', consignee: row.consignee || '',
      carrierName: row.carrierName || '',
      _resolvedCt:  ct      ? { _id: String(ct._id), code: ct.code, size: ct.size, type: ct.type } : null,
      _resolvedPol: polPort ? { _id: String(polPort._id), name: polPort.name, code: polPort.code } : null,
      _resolvedPod: podPort ? { _id: String(podPort._id), name: podPort.name, code: podPort.code } : null,
      _errors: validationErrors, _rowStatus: rowStatus,
      _existingId: existingMap[row.bookingNumber]?._id || null,
    };
  });
};

// ─── Save — Sprint020 PERF-004: bulkWrite + insertMany ───────────────────────
const saveImport = async ({ rows, agentId, voyageId, importType, createdBy }) => {
  if (!rows?.length) throw { status: 400, message: 'No rows to save' };
  if (!voyageId)     throw { status: 400, message: 'Voyage is required' };

  const saveable = rows.filter(r =>
    r._rowStatus === 'valid' || r._rowStatus === 'new' || r._rowStatus === 'update'
  );
  if (!saveable.length) throw { status: 400, message: 'No valid rows to save' };

  // Separate inserts and updates
  const toInsert = saveable.filter(r => r._rowStatus === 'valid' || r._rowStatus === 'new');
  const toUpdate = saveable.filter(r => r._rowStatus === 'update');

  const failed  = [];
  const created = [];
  const updated = [];

  // ── BATCH INSERT via insertMany ───────────────────────────────────────────
  if (toInsert.length > 0) {
    // Validate all refs present
    const validInserts = toInsert.filter(r => {
      if (!r._resolvedCt || !r._resolvedPol || !r._resolvedPod) {
        failed.push({ bookingNumber: r.bookingNumber, reason: 'Unresolved references — re-validate before saving' });
        return false;
      }
      return true;
    });

    if (validInserts.length > 0) {
      // Rows with explicit booking numbers vs rows that need auto-numbers
      const needsNumber = validInserts.filter(r => !r.bookingNumber?.trim());
      const hasNumber   = validInserts.filter(r =>  r.bookingNumber?.trim());

      // Pre-generate all needed numbers in one round-trip
      const autoNumbers = await nextNumberBatch('booking', needsNumber.length);
      let autoIdx = 0;

      const docs = validInserts.map(r => {
        const bookingNumber = r.bookingNumber?.trim() || autoNumbers[autoIdx++];
        const quantity      = Number(r.quantity);
        const freightRate   = Number(r.rate);
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
          quantity,
          freightRate,
          totalFreight:    quantity * freightRate,
          commodity:       r.containerNumber || null,
          remarks:         `Imported (${importType})`,
          status:          'Pending',
          createdBy,
          updatedBy:       createdBy,
        };
      });

      try {
        // ordered:false — continue on partial failure, collect writeErrors
        const result = await Booking.insertMany(docs, { ordered: false });
        result.forEach(b => created.push(b.bookingNumber));
      } catch (err) {
        // insertMany with ordered:false throws on any error but still inserts valid docs
        if (err.insertedDocs) err.insertedDocs.forEach(b => created.push(b.bookingNumber));
        if (err.writeErrors)  err.writeErrors.forEach(e => failed.push({ bookingNumber: docs[e.index]?.bookingNumber, reason: e.errmsg }));
      }
    }
  }

  // ── BATCH UPDATE via bulkWrite ────────────────────────────────────────────
  if (toUpdate.length > 0) {
    const validUpdates = toUpdate.filter(r => {
      if (!r._resolvedCt || !r._resolvedPol || !r._resolvedPod || !r._existingId) {
        failed.push({ bookingNumber: r.bookingNumber, reason: 'Unresolved references — re-validate before saving' });
        return false;
      }
      return true;
    });

    if (validUpdates.length > 0) {
      const ops = validUpdates.map(r => {
        const quantity    = Number(r.quantity);
        const freightRate = Number(r.rate);
        const $set = {
          voyageId, agentId,
          containerTypeId: r._resolvedCt._id,
          polId:           r._resolvedPol._id,
          podId:           r._resolvedPod._id,
          quantity, freightRate, totalFreight: quantity * freightRate,
          updatedBy: createdBy,
        };
        if (r.shipper)    $set.shipper    = r.shipper;
        if (r.consignee)  $set.consignee  = r.consignee;
        if (r.carrierName !== undefined) $set.carrierName = r.carrierName || null;
        return { updateOne: { filter: { _id: r._existingId }, update: { $set } } };
      });

      try {
        await Booking.bulkWrite(ops, { ordered: false });
        validUpdates.forEach(r => updated.push(r.bookingNumber));
      } catch (err) {
        if (err.result?.nModified > 0) validUpdates.slice(0, err.result.nModified).forEach(r => updated.push(r.bookingNumber));
        failed.push({ bookingNumber: 'batch-update', reason: err.message });
      }
    }
  }

  // ── Final Loading reconciliation (sequential — only 2 queries total) ──────
  const markedFinalLoading = [];
  const cancelled          = [];
  const savedBookingNumbers = new Set([...created, ...updated]);

  if (importType === 'finalLoading') {
    if (savedBookingNumbers.size > 0) {
      await Booking.updateMany(
        { bookingNumber: { $in: [...savedBookingNumbers] }, voyageId, isDeleted: false },
        { $set: { status: 'Final Loading', updatedBy: createdBy } }
      );
      savedBookingNumbers.forEach(n => markedFinalLoading.push(n));
    }

    const cancelResult = await Booking.updateMany(
      { voyageId, isDeleted: false, bookingNumber: { $nin: [...savedBookingNumbers] } },
      { $set: { status: 'Cancelled', updatedBy: createdBy } }
    );
    if (cancelResult.modifiedCount > 0) {
      const cancelledDocs = await Booking.find(
        { voyageId, isDeleted: false, status: 'Cancelled' },
        { bookingNumber: 1 }
      ).lean();
      cancelledDocs.forEach(b => {
        if (!savedBookingNumbers.has(b.bookingNumber)) cancelled.push(b.bookingNumber);
      });
    }
  }

  return { created, updated, failed, markedFinalLoading, cancelled, total: saveable.length };
};

module.exports = { previewImport, saveImport };
