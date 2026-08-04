'use strict';

const mongoose  = require('mongoose');
const Booking   = require('./booking.model');
const Voyage    = require('../voyages/voyage.model');
const Port      = require('../locations/port.model');
const { nextNumber } = require('../../utils/autoNumber');
const { escapeRegex } = require('../../utils/escapeRegex');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');
const { invalidateRoundCache, computeVoyagePreview } = require('../capacity/capacity.service');
const { capacityEnforcement } = require('../../config/env');

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
  q.populate('voyageId', 'voyageNumber voyageName roundId polId podId etd eta status')
   .populate({ path: 'voyageId', populate: [{ path: 'polId', select: 'name code' }, { path: 'podId', select: 'name code' }] })
   .populate('agentId',         'agentCode agentName')
   .populate('polId',           'name code')
   .populate('podId',           'name code')
   .populate('containerTypeId', 'code size type');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  search = '', voyageId = '', agentId = '',
  status = '', dateFrom = '', dateTo = '',
  dischargeStatus = '', // Sprint 045 — additive: 'Discharged' | 'Remaining'
} = {}) => {
  const query = {};
  if (voyageId) query.voyageId = voyageId;
  if (agentId)  query.agentId  = agentId;
  if (dischargeStatus) query.dischargeStatus = dischargeStatus;
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
const getById = async (id) => {
  const booking = await populate(Booking.findOne({ _id: id })).lean();
  if (!booking) throw { status: 404, message: 'Booking not found' };
  return booking;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const voyage = await Voyage.findById(data.voyageId).lean();
  if (!voyage) throw { status: 400, message: 'Voyage not found' };
  if (['Cancelled', 'Completed'].includes(voyage.status)) {
    throw { status: 400, message: `Cannot book on a voyage with status "${voyage.status}"` };
  }

  const bookingNumber = await nextNumber('booking');
  // Sprint 024: each L2 booking = ONE container; totalFreight = freightRate (flat per container)
  const totalFreight  = Number(data.freightRate);
  // Sprint 030: POL/POD are no longer client-submitted — they are always the
  // selected voyage's own polId/podId. Strip any client-sent values.
  const { totalFreight: _ig, polId: _ig2, podId: _ig3, ...safeData } = data;

  // Sprint 022 — pre-flight capacity check (feature-flagged)
  const enforcementMode = capacityEnforcement();
  let capacityWarning = null;
  if (enforcementMode && data.containerTypeId && voyage.roundId) {
    try {
      // Sprint 025: quantity removed from L2; one booking = one container
      const preview = await computeVoyagePreview(
        voyage.roundId,
        String(data.voyageId),
        String(data.containerTypeId),
        voyage.podId ? String(voyage.podId) : null,
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
    // Sprint 030: POL/POD always derived from the selected voyage's own ports
    polId:     voyage.polId,
    podId:     voyage.podId,
    bookingNumber,
    totalFreight,
    status:    data.status === 'Cancelled' ? 'Pending' : (data.status || 'Pending'),
    createdBy,
    updatedBy: createdBy,
  });

  // Invalidate per-leg capacity cache for this round
  invalidateRoundCache(voyage.roundId);

  const saved = await getById(booking._id);
  // Attach capacity warning if in warn mode (non-blocking overbooking)
  if (capacityWarning) saved._capacityWarning = capacityWarning;
  return saved;
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const booking = await Booking.findOne({ _id: id });
  if (!booking) throw { status: 404, message: 'Booking not found' };

  if (['Cancelled', 'Final Loading'].includes(booking.status)) {
    throw { status: 400, message: `${booking.status} bookings cannot be edited` };
  }

  if (data.status && data.status !== booking.status) {
    validateTransition(booking.status, data.status);
  }

  const freightRate  = data.freightRate !== undefined ? Number(data.freightRate) : booking.freightRate;
  // Sprint 024: each L2 booking = ONE container; totalFreight = freightRate (flat per container)
  const totalFreight = freightRate;

  // Sprint 030: POL/POD are derived from the voyage and are not independently
  // editable — voyageId itself is already immutable post-creation, so POL/POD
  // (which follow the voyage) must stay immutable with it.
  const { totalFreight: _ig1, bookingNumber: _ig2, voyageId: _ig3, polId: _ig4, podId: _ig5, ...safeData } = data;
  Object.assign(booking, { ...safeData, totalFreight, updatedBy });
  await booking.save();

  // Invalidate capacity cache — pol, pod, status or rate may have changed
  const updatedVoyage = await Voyage.findById(booking.voyageId).select('roundId').lean();
  if (updatedVoyage) invalidateRoundCache(updatedVoyage.roundId);

  return getById(booking._id);
};

// ─── Hard Delete ──────────────────────────────────────────────────────────────
const hardDelete = async (id) => {
  const booking = await Booking.findOne({ _id: id });
  if (!booking) throw { status: 404, message: 'Booking not found' };

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
};

// ─── Get voyage ports (for booking form dropdown) ─────────────────────────────
const getVoyagePorts = async (voyageId) => {
  const portIds = await getVoyagePortIds(voyageId);
  if (portIds.length === 0) return [];
  return Port.find({ _id: { $in: portIds } }).select('name code').lean();
};

// ─── Sprint 027: Export Discharge List ───────────────────────────────────────
// Columns ordered operational-first; Rate last.
// Reuses ExcelJS pattern identical to export.service.js buildExcelBuffer.
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
  { header: 'Rate (USD)',         key: 'rate',             width: 12 },
];

const exportDischargeList = async (voyageId, agentId) => {
  const ExcelJS = require('exceljs');
  const Agent   = require('../agents/agent.model');

  // Validate that voyage and agent exist
  const [voyage, agent] = await Promise.all([
    Voyage.findById(voyageId).select('voyageNumber').lean(),
    Agent.findById(agentId).select('agentCode agentName').lean(),
  ]);
  if (!voyage) throw { status: 404, message: 'Voyage not found' };
  if (!agent)  throw { status: 404, message: 'Agent not found' };

  // Fetch ONLY Final Loading bookings in (Voyage + Agent) scope
  // This always represents the CURRENT state — not a snapshot.
  const bookings = await Booking.find({
    voyageId,
    agentId,
    status:    'Final Loading',
  })
    .populate('polId',           'name')
    .populate('podId',           'name')
    .populate('containerTypeId', 'code size')
    .sort({ containerNumber: 1 })
    .lean();

  if (!bookings.length) {
    throw { status: 404, message: 'No Final Loading bookings found for this Voyage and Agent' };
  }

  // Map to flat rows — no ObjectIds, no internal fields
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
  }));

  // Build Excel — same ExcelJS pattern as export.service.js buildExcelBuffer
  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'Logistics SaaS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Discharge List');
  worksheet.columns = DISCHARGE_COLUMNS;

  // Header styling (matches project standard)
  const headerRow = worksheet.getRow(1);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4057' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height    = 22;

  // Data rows with alternating stripe
  rows.forEach((doc, idx) => {
    const dataRow = worksheet.addRow(doc);
    dataRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8F9FA' },
      };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E7EC' } } };
    });
  });

  // Freeze header
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  // Filename: Discharge_List_{VoyageNumber}_{AgentCode}.xlsx
  const sanitize = (s) => String(s || '').replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
  const voyNum   = sanitize(voyage.voyageNumber);
  const agCode   = sanitize(agent.agentCode || (agent.agentName || '').slice(0, 10) || 'AGENT');
  const filename = `Discharge_List_${voyNum}_${agCode}.xlsx`;

  return { buffer, filename, count: rows.length };
};

module.exports = { list, getById, create, update, hardDelete, getVoyagePorts, getVoyagePortIds, exportDischargeList };
