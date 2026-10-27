'use strict';

const mongoose = require('mongoose');
const Partner = require('./partner.model');
const VesselPartner = require('./vesselPartner.model');
const pickFields = require('../../utils/pickFields');
const AppError = require('../../utils/AppError');
const { escapeRegex } = require('../../utils/escapeRegex');
const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
const { validateShares } = require('./vesselShares');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Partner master ───────────────────────────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = {};
  if (status) query.status = status;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [{ code: { $regex: rx, $options: 'i' } }, { name: { $regex: rx, $options: 'i' } }];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Partner.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
    Partner.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const p = await Partner.findById(id).lean();
  if (!p) throw new AppError(404, 'Partner not found', 'PARTNER_NOT_FOUND');
  return p;
};

const create = async (data, createdBy) => {
  const doc = await Partner.create({ ...pickFields(Partner, data, ['bank']), createdBy });
  return doc.toObject();
};

const update = async (id, data, updatedBy) => {
  const p = await Partner.findById(id);
  if (!p) throw new AppError(404, 'Partner not found', 'PARTNER_NOT_FOUND');
  Object.assign(p, { ...pickFields(Partner, data, ['bank']), updatedBy });
  await p.save();
  return p.toObject();
};

const hardDelete = async (id) => {
  const p = await Partner.findById(id);
  if (!p) throw new AppError(404, 'Partner not found', 'PARTNER_NOT_FOUND');
  await assertNoDependents('partner', id, DEPENDENTS.partner);
  await Partner.findByIdAndDelete(id);
};

// ─── Vessel JV shares ─────────────────────────────────────────────────────────
const getShares = async (vesselId) =>
  VesselPartner.find({ vesselId }).populate('partnerId', 'code name status').sort({ shareBp: -1 }).lean();

// Locked after the vessel's first accounting entry (any ledger line on one of its Rounds) or a Final settlement.
// Open Rounds with no money posted do NOT lock: shares are only read when a Round is settled, and locking earlier made
// a vessel whose first Round was created without shares impossible to close (audit F-01).
const assertSharesUnlocked = async (vesselId, { session = null } = {}) => {
  const Round = require('../rounds/round.model');
  const JournalEntryLine = require('../ledger/journalEntryLine.model');
  const roundIds = await Round.find({ vesselId }).session(session).distinct('_id');
  if (roundIds.length && await JournalEntryLine.exists({ roundId: { $in: roundIds } }).session(session)) {
    throw new AppError(409, 'Partner shares are locked - this vessel already has accounting entries', 'VESSEL_SHARES_LOCKED');
  }
  const { PartnerSettlement } = require('../partnerSettlement/partnerSettlement.models');
  if (await PartnerSettlement.exists({ vesselId, status: 'Final' })) {
    throw new AppError(409, 'Partner shares are locked — a Round of this vessel has been closed and shared', 'VESSEL_SHARES_LOCKED');
  }
};

// Pass { session } to run inside the caller's transaction (vessel create/update with shares).
const setShares = async (vesselId, shares, createdBy, { session: outer = null } = {}) => {
  const Vessel = require('../vessels/vessel.model');
  if (!(await Vessel.exists({ _id: vesselId }).session(outer))) throw new AppError(404, 'Vessel not found', 'VESSEL_NOT_FOUND');

  const clean = (shares || []).map((s) => ({
    partnerId: s.partnerId, shareBp: s.shareBp,
  }));
  validateShares(clean);
  await assertSharesUnlocked(vesselId, { session: outer });

  const found = await Partner.countDocuments({ _id: { $in: clean.map((s) => s.partnerId) } }).session(outer);
  if (found !== clean.length) throw new AppError(400, 'One or more partners do not exist', 'PARTNER_NOT_FOUND');

  const write = async (session) => {
    await VesselPartner.deleteMany({ vesselId }, { session });
    await VesselPartner.insertMany(clean.map((s) => ({ ...s, vesselId, createdBy })), { session });
  };
  if (outer) {
    await write(outer);
  } else {
    const session = await mongoose.startSession();
    try { await session.withTransaction(() => write(session)); } finally { session.endSession(); }
  }
  return outer ? undefined : getShares(vesselId);
};

const clearShares = async (vesselId) => {
  await assertSharesUnlocked(vesselId);
  await VesselPartner.deleteMany({ vesselId });
};

module.exports = { assertSharesUnlocked, list, getById, create, update, hardDelete, getShares, setShares, clearShares };
