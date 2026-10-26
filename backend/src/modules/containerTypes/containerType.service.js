'use strict';

const pickFields = require('../../utils/pickFields');
const ContainerType = require('./containerType.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const { teuFactorForSize } = require('../../utils/masterValidators');

const clean = (data) => {
  const d = pickFields(ContainerType, data, ['teuFactor']); // teuFactor is server-derived
  if ('isoCode' in d) d.isoCode = d.isoCode ? String(d.isoCode).toUpperCase().replace(/\s+/g, '') : undefined;
  return d;
};

const assertIsoFree = async (isoCode, exceptId = null) => {
  if (!isoCode) return;
  const q = { isoCode };
  if (exceptId) q._id = { $ne: exceptId };
  if (await ContainerType.exists(q)) throw { status: 400, message: `ISO code "${isoCode}" is already used by another container type` };
};
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', size = '', type = '' } = {}) => {
  const query = {};
  if (size) query.size = size;
  if (type) query.type = type;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { code:        { $regex: rx, $options: 'i' } },
      { description: { $regex: rx, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    ContainerType.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    ContainerType.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const ct = await ContainerType.findOne({ _id: id }).lean();
  if (!ct) throw { status: 404, message: 'Container type not found' };
  return ct;
};

const create = async (data, createdBy) => {
  const exists = await ContainerType.findOne({ code: data.code.toUpperCase() });
  if (exists) throw { status: 400, message: `Container type code "${data.code}" already exists` };
  const fields = clean(data);
  await assertIsoFree(fields.isoCode);
  const ct = await ContainerType.create({ ...fields, code: data.code.toUpperCase(), teuFactor: teuFactorForSize(fields.size), createdBy });
  return ct.toObject();
};

const update = async (id, data, updatedBy) => {
  const ct = await ContainerType.findOne({ _id: id });
  if (!ct) throw { status: 404, message: 'Container type not found' };
  if (data.code && data.code.toUpperCase() !== ct.code) {
    const exists = await ContainerType.findOne({ code: data.code.toUpperCase(), _id: { $ne: id } });
    if (exists) throw { status: 400, message: `Container type code "${data.code}" already exists` };
  }
  const fields = clean(data);
  await assertIsoFree(fields.isoCode, id);
  Object.assign(ct, { ...fields, code: (data.code || ct.code).toUpperCase(), updatedBy });
  ct.teuFactor = teuFactorForSize(ct.size);
  if ('isoCode' in fields && !fields.isoCode) ct.isoCode = undefined;
  await ct.save();
  return ct.toObject();
};

const hardDelete = async (id) => {
  const ct = await ContainerType.findOne({ _id: id });
  if (!ct) throw { status: 404, message: 'Container type not found' };

  const Booking = require('../bookings/booking.model');
  const inUse = await Booking.findOne({ containerTypeId: id });
  if (inUse) throw { status: 400, message: 'Cannot delete — container type is used in existing bookings' };

  await ContainerType.findByIdAndDelete(id);
};

const getAll = async (filters = {}, selectedIds = []) => {
  const query = {};
  if (filters.size) query.size = filters.size;
  if (filters.type) query.type = filters.type;
  if (filters.search) { const rx = escapeRegex(filters.search); query.$or = [{ code: { $regex: rx, $options: 'i' } }, { description: { $regex: rx, $options: 'i' } }]; }
  if (selectedIds?.length > 0) query._id = { $in: selectedIds };
  return ContainerType.find(query).sort({ createdAt: -1 }).lean();
};

module.exports = { list, getById, create, update, hardDelete, getAll };
