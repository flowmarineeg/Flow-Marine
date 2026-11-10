'use strict';

const lock = require('../rounds/roundLock');
const pickFields = require('../../utils/pickFields');
const mongoose  = require('mongoose');
const Booking   = require('./booking.model');
const Voyage    = require('../voyages/voyage.model');
const Port      = require('../locations/port.model');
const { nextNumber } = require('../../utils/autoNumber');
const { escapeRegex } = require('../../utils/escapeRegex');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');
const { invalidateRoundCache, computeVoyagePreview } = require('../capacity/capacity.service');
const { capacityEnforcement } = require('../../config/env');
const { resolveVoyage } = require('./bookingVoyage.service');
const { assertPartner, assertOwn } = require('./partnerScope');

// ─── Status transition map ────────────────────────────────────────────────────
const STATUS_TRANSITIONS = {
  Pending:         ['Confirmed', 'Final Loading', 'Cancelled'],
  Confirmed:       ['Final Loading', 'Cancelled'],
  'Final Loading': ['Cancelled'],
  Cancelled:       [],
};

const validateTransition = (current, next) => {
  const allowed = STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw {
      status: 400,
      message: `Cannot transition booking from "${current}" to "${next}". Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }
};

// ─── Sprint020 PERF-011: single aggregate replaces 3 sequential queries ───────
const getVoyagePortIds = async (voyageId) => {
  const result = await Voyage.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(String(voyageId)) } },
    {
      $lookup: {
        from:         'routes',
        localField:   'serviceId',
        foreignField: 'serviceId',
        as:           'route',
      },
    },
    { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from:         'routelegs',
        localField:   'route._id',
        foreignField: 'routeId',
        as:           'legs',
      },
    },
    { $project: { portIds: '$legs.portId' } },
  ]);

  if (!result.length) throw { status: 404, message: 'Voyage not found' };
  return (result[0].portIds || []).map(String);
};

// ─── Populate helper ──────────────────────────────────────────────────────────
const populate = (q) =>
  q.populate('voyageId', 'voyageNumber voyageName direction roundId polId podId etd eta status')
   .populate({ path: 'voyageId', populate: [{ path: 'polId', select: 'name code' }, { path: 'podId', select: 'name code' }] })
   .populate('agentId',         'agentCode agentName')
   .populate('polId',           'name code')
   .populate('podId',           'name code')
   .populate('partnerId',       'code name')
   .populate('containerTypeId', 'code size type');

// Fields a client may never write on a booking, whoever the caller is.
const SERVER_FIELDS = [
  'bookingNumber', 'voyageId', 'polId', 'podId', 'polLegKey', 'podLegKey', 'totalFreight', 'partnerId', 'source',
  'dischargeStatus', 'dischargedAt',
];

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  search = '', voyageId = '', agentId = '', roundId = '', partnerId = '',
  status = '', dateFrom = '', dateTo = '',
  dischargeStatus = '', // Sprint 045 — additive: 'Discharged' | 'Remaining'
} = {}, scope = null) => {
  const query = {};
  if (roundId) {
    const ids = await Voyage.find({ roundId }).distinct('_id');
    query.voyageId = { $in: ids };
  }
  if (voyageId) query.voyageId = voyageId;
  if (agentId)  query.agentId  = agentId;
  if (dischargeStatus) query.dischargeStatus = dischargeStatus;
  // A partner user is confined to their own partner; staff may filter by partner.
  if (scope) query.partnerId = scope;
  else if (partnerId) query.partnerId = partnerId;
  if (status) {
    // Support comma-separated statuses e.g. "Confirmed,Pending"
    query.status = status.includes(',')
      ? { $in: status.split(',').map(s => s.trim()) }
      : status;
  }
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { bookingNumber: { $regex: rx, $options: 'i' } },
      { shipper:       { $regex: rx, $options: 'i' } },
      { consignee:     { $regex: rx, $options: 'i' } },
      { containerNumber: { $regex: rx, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    populate(Booking.find(query)).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Booking.countDocuments(query),
  ]);

  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id, scope = null) => {
  const booking = await populate(Booking.findOne({ _id: id })).lean();
  if (!booking) throw { status: 404, message: 'Booking not found' };
  // populated partnerId is a document: compare on its id
  if (scope && String(booking.partnerId?._id || booking.partnerId || '') !== scope) throw { status: 404, message: 'Booking not found' };
  return booking;
};

// ─── Create ───────────────────────────────────────────────────────────────────
// Bookings sprint 2026-11-10: the caller sends roundId + the booking's own POL/POD. The voyage is never
// chosen by the client: the server finds the run of the round that goes POL -> POD (`voyageId` is accepted
// only as the pick among candidates after a 409 VOYAGE_AMBIGUOUS).
const create = async (data, createdBy, scope = null) => {
  await require('../agents/agent.service').assertBookingSource(data.agentId);
  const { voyage, polLegKey, podLegKey } = await resolveVoyage({
    roundId: data.roundId, polId: data.polId, podId: data.podId,
    polLegKey: data.polLegKey, podLegKey: data.podLegKey, voyageId: data.voyageId,
  });
  const [pol, pod] = await Promise.all([Port.exists({ _id: data.polId }), Port.exists({ _id: data.podId })]);
  if (!pol || !pod) throw { status: 400, message: 'POL or POD port not found' };

  const partnerId = scope || await assertPartner(data.partnerId);
  const source = scope ? 'PartnerUser' : 'Staff';
  // A partner user can only ever open a Pending booking; Cancelled is never a creation state.
  const status = scope || !data.status || data.status === 'Cancelled' ? 'Pending' : data.status;

  const bookingNumber = await nextNumber('booking');
  // Sprint 024: each L2 booking = ONE container; totalFreight = freightRate (flat per container)
  const totalFreight  = Number(data.freightRate);
  const safeData = pickFields(Booking, data, [...SERVER_FIELDS, 'status']);

  // Sprint 022 — pre-flight capacity check (feature-flagged)
  const enforcementMode = capacityEnforcement();
  let capacityWarning = null;
  if (enforcementMode && data.containerTypeId && voyage.roundId) {
    try {
      // Sprint 025: quantity removed from L2; one booking = one container
      const preview = await computeVoyagePreview(
        voyage.roundId,
        String(voyage._id),
        String(data.containerTypeId),
        String(data.podId),
        String(data.polId),
      );
      if (!preview.canFit) {
        if (enforcementMode === 'strict') {
          throw { status: 400, message: `Booking would exceed vessel capacity on voyage ${preview.voyage?.voyageNumber}. Added ${preview.addedTEU} TEU; remaining after: ${preview.voyage?.remainingAfter} TEU.`, capacityPreview: preview };
        }
        capacityWarning = preview;
      }
    } catch (capErr) {
      if (capErr.status === 400 && capErr.capacityPreview) throw capErr;
      // Capacity engine errors are non-blocking in all other cases
    }
  }

  const booking = await Booking.create({
    ...safeData,
    voyageId:  voyage._id,
    polId:     data.polId,
    podId:     data.podId,
    polLegKey, podLegKey,
    partnerId, source,
    bookingNumber,
    totalFreight,
    status,
    createdBy,
    updatedBy: createdBy,
  });

  // Invalidate per-leg capacity cache for this round
  invalidateRoundCache(voyage.roundId);
  require('../billing/bookingItem.service').scheduleSync({ voyageIds: [booking.voyageId] }); // Sprint051

  const saved = await getById(booking._id);
  // Attach capacity warning if in warn mode (non-blocking overbooking)
  if (capacityWarning) saved._capacityWarning = capacityWarning;
  return saved;
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy, scope = null) => {
  await lock.assertDocRoundOpen('Booking', id);
  const booking = await Booking.findOne({ _id: id });
  if (!booking) throw { status: 404, message: 'Booking not found' };
  assertOwn(booking, scope);

  if (['Cancelled', 'Final Loading'].includes(booking.status)) {
    throw { status: 400, message: `${booking.status} bookings cannot be edited` };
  }

  // A partner user reports bookings; staff decide their status and partner label.
  if (scope && data.status && data.status !== booking.status) {
    throw { status: 403, message: 'Partner users cannot change the status of a booking' };
  }
  if (data.status && data.status !== booking.status) {
    validateTransition(booking.status, data.status);
  }

  const freightRate  = data.freightRate !== undefined ? Number(data.freightRate) : booking.freightRate;
  // Sprint 024: each L2 booking = ONE container; totalFreight = freightRate (flat per container)
  const totalFreight = freightRate;

  // POL/POD, leg keys and the voyage are fixed at creation (a different route = a new booking).
  const blocked = scope ? [...SERVER_FIELDS, 'status', 'agentId'] : SERVER_FIELDS;
  Object.assign(booking, { ...pickFields(Booking, data, blocked), totalFreight, updatedBy });
  if (!scope && data.partnerId !== undefined) booking.partnerId = await assertPartner(data.partnerId);
  await booking.save();

  // Invalidate capacity cache — pol, pod, status or rate may have changed
  const updatedVoyage = await Voyage.findById(booking.voyageId).select('roundId').lean();
  if (updatedVoyage) invalidateRoundCache(updatedVoyage.roundId);
  require('../billing/bookingItem.service').scheduleSync({ voyageIds: [booking.voyageId] }); // Sprint051

  return getById(booking._id);
};

// ─── Hard Delete ──────────────────────────────────────────────────────────────
const hardDelete = async (id, scope = null) => {
  await lock.assertDocRoundOpen('Booking', id);
  const booking = await Booking.findOne({ _id: id });
  if (!booking) throw { status: 404, message: 'Booking not found' };
  assertOwn(booking, scope);
  if (scope && booking.status !== 'Pending') throw { status: 403, message: 'Partner users can only delete Pending bookings' };

  // Sprint 033: ownership of the booking↔invoice relationship lives entirely
  // in Invoice.lineItems (no field on Booking) — query from the Invoice side.
  const Invoice = require('../invoices/invoice.model');
  const hasInvoice = await Invoice.exists({
    'lineItems.bookingId': id, status: { $ne: 'Cancelled' },
  });
  if (hasInvoice) throw { status: 400, message: 'Cannot delete — a non-cancelled invoice references this booking' };

  const deletedVoyage = await Voyage.findById(booking.voyageId).select('roundId').lean();
  await Booking.findByIdAndDelete(id);

  // Invalidate capacity cache — a booking was removed from the round
  if (deletedVoyage) invalidateRoundCache(deletedVoyage.roundId);
  require('../billing/bookingItem.service').scheduleSync({ voyageIds: [booking.voyageId] }); // Sprint051
};

// ─── Get voyage ports (for booking form dropdown) ─────────────────────────────
const getVoyagePorts = async (voyageId) => {
  const portIds = await getVoyagePortIds(voyageId);
  if (portIds.length === 0) return [];
  return Port.find({ _id: { $in: portIds } }).select('name code').lean();
};

// ─── Discharge list (Sprint 027, reworked 2026-11-10) ─────────────────────────
// Scope = Round + POL + POD (+ Agent, + Voyage): the Final Loading bookings that go from that POL to that POD,
// across every voyage of the round that serves the pair. The same sheet is what the discharge import reads back.
const dischargeFilter = async ({ roundId, agentId, polId, podId, voyageId }) => {
  if (!roundId) throw { status: 400, message: 'Round is required' };
  if (!polId || !podId) throw { status: 400, message: 'POL and POD are required' };
  const roundVoyageIds = await Voyage.find({ roundId }).distinct('_id');
  if (!roundVoyageIds.length) throw { status: 404, message: 'No voyages found in this Round' };
  if (voyageId && !roundVoyageIds.some((id) => String(id) === String(voyageId))) {
    throw { status: 400, message: 'The voyage does not belong to this Round' };
  }
  const f = { voyageId: voyageId || { $in: roundVoyageIds }, status: 'Final Loading', polId, podId };
  if (agentId) f.agentId = agentId;
  return f;
};

const listDischarge = async (params) => {
  const filter = await dischargeFilter(params);
  return populate(Booking.find(filter)).sort({ containerNumber: 1 }).lean();
};

// Columns ordered operational-first; the first block matches the import template so the file can be re-imported.
const DISCHARGE_COLUMNS = [
  { header: 'Container Number',  key: 'containerNumber',  width: 20 },
  { header: 'Container Size',    key: 'containerSize',    width: 14 },
  { header: 'Container Type',    key: 'containerType',    width: 14 },
  { header: 'POL',               key: 'pol',              width: 18 },
  { header: 'POD',               key: 'pod',              width: 18 },
  { header: 'Container Status',  key: 'containerStatus',  width: 16 },
  { header: 'Carrier Name',      key: 'carrierName',      width: 22 },
  { header: 'Shipper',           key: 'shipper',          width: 28 },
  { header: 'Consignee',         key: 'consignee',        width: 28 },
  { header: 'Commodity',         key: 'commodity',        width: 22 },
  { header: 'VGM (kg)',          key: 'vgm',              width: 10 },
  { header: 'Hazardous',         key: 'hazardous',        width: 12 },
  { header: 'IMDG Code',         key: 'imdgCode',         width: 16 },
  { header: 'Rate (USD)',        key: 'rate',             width: 12 },
  { header: 'Booking Number',    key: 'bookingNumber',    width: 16 },
  { header: 'Voyage',            key: 'voyage',           width: 14 },
  { header: 'Agent',             key: 'agent',            width: 22 },
  { header: 'Partner',           key: 'partner',          width: 20 },
  { header: 'Discharge Status',  key: 'dischargeStatus',  width: 16 },
];

const exportDischargeList = async (params) => {
  const ExcelJS = require('exceljs');
  const [round, pol, pod] = await Promise.all([
    require('../rounds/round.model').findById(params.roundId).select('roundNumber').lean(),
    Port.findById(params.polId).select('name code').lean(),
    Port.findById(params.podId).select('name code').lean(),
  ]);
  if (!round) throw { status: 404, message: 'Round not found' };
  if (!pol || !pod) throw { status: 404, message: 'POL or POD not found' };

  // Always the CURRENT state, not a snapshot.
  const bookings = await listDischarge(params);
  if (!bookings.length) throw { status: 404, message: 'No Final Loading bookings found for this Round and POL → POD' };

  const rows = bookings.map(b => ({
    containerNumber: b.containerNumber                     || '',
    containerSize:   b.containerTypeId?.size              || '',
    containerType:   b.containerTypeId?.code              || '',
    pol:             b.polId?.name                        || '',
    pod:             b.podId?.name                        || '',
    containerStatus: b.containerStatus                    || '',
    carrierName:     b.carrierName                        || '',
    shipper:         b.shipper                            || '',
    consignee:       b.consignee                          || '',
    commodity:       b.commodity                          || '',
    vgm:             b.vgm != null ? b.vgm                : '',
    hazardous:       b.dg ? 'Yes' : 'No',
    imdgCode:        b.imdgCode                           || '',
    rate:            b.freightRate != null ? b.freightRate : '',
    bookingNumber:   b.bookingNumber                      || '',
    voyage:          b.voyageId?.voyageNumber             || '',
    agent:           b.agentId?.agentName                 || '',
    partner:         b.partnerId?.name                    || '',
    dischargeStatus: b.dischargeStatus                    || '',
  }));

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'Logistics SaaS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Discharge List');
  worksheet.columns = DISCHARGE_COLUMNS;

  const headerRow = worksheet.getRow(1);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4057' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height    = 22;

  rows.forEach((doc, idx) => {
    const dataRow = worksheet.addRow(doc);
    dataRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8F9FA' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E7EC' } } };
    });
  });
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const sanitize = (v) => String(v || '').replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
  const filename = `Discharge_List_${sanitize(round.roundNumber)}_${sanitize(pol.code || pol.name)}-${sanitize(pod.code || pod.name)}.xlsx`;
  return { buffer, filename, count: rows.length };
};

module.exports = { list, getById, create, update, hardDelete, getVoyagePorts, getVoyagePortIds, listDischarge, exportDischargeList };
