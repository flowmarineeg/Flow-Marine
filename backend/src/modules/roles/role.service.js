'use strict';

const Role = require('./role.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ search = '' } = {}) => {
  const query = { isDeleted: false };
  if (search) query.name = { $regex: search, $options: 'i' };
  return Role.find(query).sort({ createdAt: -1 }).lean();
};

const getById = async (id) => {
  const role = await Role.findOne({ _id: id, isDeleted: false }).lean();
  if (!role) throw { status: 404, message: 'Role not found' };
  return role;
};

const create = async (data, createdBy) => {
  const exists = await Role.findOne({ name: data.name, isDeleted: false });
  if (exists) throw { status: 400, message: 'Role name already exists' };
  return Role.create({ name: data.name, description: data.description || '', createdBy });
};

const update = async (id, data, updatedBy) => {
  const role = await Role.findOne({ _id: id, isDeleted: false });
  if (!role) throw { status: 404, message: 'Role not found' };
  if (role.isSystem) throw { status: 400, message: 'System roles cannot be modified' };

  if (data.name && data.name !== role.name) {
    const exists = await Role.findOne({ name: data.name, _id: { $ne: id }, isDeleted: false });
    if (exists) throw { status: 400, message: 'Role name already exists' };
    role.name = data.name;
  }
  if (data.description !== undefined) role.description = data.description;
  role.updatedBy = updatedBy;
  await role.save();
  return role;
};

const remove = async (id) => {
  const role = await Role.findOne({ _id: id, isDeleted: false });
  if (!role) throw { status: 404, message: 'Role not found' };
  if (role.isSystem) throw { status: 400, message: 'System roles cannot be deleted' };

  const User = require('../users/user.model');
  const inUse = await User.countDocuments({ roleId: id, isDeleted: false });
  if (inUse > 0) throw { status: 400, message: `Cannot delete — ${inUse} user(s) are assigned to this role` };

  role.isDeleted = true;
  await role.save();
};

module.exports = { list, getById, create, update, remove };
