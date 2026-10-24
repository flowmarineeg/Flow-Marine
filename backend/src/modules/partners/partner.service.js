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
  const doc = await Partner.create({ ...pickFields(Partner, data), createdBy });
  return doc.toObject();
};

const update = async (id, data, updatedBy) => {
  const p = await Partner.findById(id);
  if (!p) throw new AppError(404, 'Partner not found', 'PARTNER_NOT_FOUND');
  Object.assign(p, { ...pickFields(Partner, data), updatedBy });
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

// Locked once the vessel has had its first Round (proposal §7).
const assertSharesUnlocked = async (vesselId) => {
  // Audit H1: only Rounds created under V2 (v2:true) or a finalised settlement lock the table. The vessel's
  // pre-V2 Rounds must not, or no existing vessel could ever receive shares.
  const Round = require('../rounds/round.model');
  if (await Round.exists({ vesselId, v2: true })) {
    throw new AppError(409, 'Partner shares are locked — this vessel already has a Round opened under Version 2', 'VESSEL_SHARES_LOCKED');
  }
  const { PartnerSettlement } = require('../partnerSettlement/partnerSettlement.models');
  if (await PartnerSettlement.exists({ vesselId, status: 'Final' })) {
    throw new AppError(409, 'Partner shares are locked — a Round of this vessel has been closed and shared', 'VESSEL_SHARES_LOCKED');
  }
};

const setShares = async (vesselId, shares, createdBy) => {
  const Vessel = require('../vessels/vessel.model');
  if (!(await Vessel.exists({ _id: vesselId }))) throw new AppError(404, 'Vessel not found', 'VESSEL_NOT_FOUND');

  const clean = (shares || []).map((s) => ({
    partnerId: s.partnerId, shareBp: s.shareBp, isLead: !!s.isLead,
  }));
  validateShares(clean);
  await assertSharesUnlocked(vesselId);

  const found = await Partner.countDocuments({ _id: { $in: clean.map((s) => s.partnerId) } });
  if (found !== clean.length) throw new AppError(400, 'One or more partners do not exist', 'PARTNER_NOT_FOUND');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await VesselPartner.deleteMany({ vesselId }, { session });
      await VesselPartner.insertMany(clean.map((s) => ({ ...s, vesselId, createdBy })), { session });
    });
  } finally {
    session.endSession();
  }
  return getShares(vesselId);
};

const clearShares = async (vesselId) => {
  await assertSharesUnlocked(vesselId);
  await VesselPartner.deleteMany({ vesselId });
};

module.exports = { list, getById, create, update, hardDelete, getShares, setShares, clearShares };
