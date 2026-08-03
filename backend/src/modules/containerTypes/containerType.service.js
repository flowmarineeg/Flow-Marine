'use strict';

const ContainerType = require('./containerType.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', size = '', type = '' } = {}) => {
  const query = {};
  if (size) query.size = size;
  if (type) query.type = type;
  if (search) {
    query.$or = [
      { code:        { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
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
  const ct = await ContainerType.create({ ...data, code: data.code.toUpperCase(), createdBy });
  return ct.toObject();
};

const update = async (id, data, updatedBy) => {
  const ct = await ContainerType.findOne({ _id: id });
  if (!ct) throw { status: 404, message: 'Container type not found' };
  if (data.code && data.code.toUpperCase() !== ct.code) {
    const exists = await ContainerType.findOne({ code: data.code.toUpperCase(), _id: { $ne: id } });
    if (exists) throw { status: 400, message: `Container type code "${data.code}" already exists` };
  }
  Object.assign(ct, { ...data, code: (data.code || ct.code).toUpperCase(), updatedBy });
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
  if (filters.search) query.$or = [{ code: { $regex: filters.search, $options: 'i' } }, { description: { $regex: filters.search, $options: 'i' } }];
  if (selectedIds?.length > 0) query._id = { $in: selectedIds };
  return ContainerType.find(query).sort({ createdAt: -1 }).lean();
};

module.exports = { list, getById, create, update, hardDelete, getAll };
