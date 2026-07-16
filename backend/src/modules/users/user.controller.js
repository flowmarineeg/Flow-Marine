'use strict';

const userService = require('./user.service');
const { success, created, error, notFound } = require('../../utils/responseHelper');
const { paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const { data, total } = await userService.list({ page, limit, search, status });
    return success(res, data, 'Users retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const user = await userService.getById(req.params.id);
    return success(res, user);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const user = await userService.create(req.body, req.user._id);
    return created(res, user, 'User created successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

const inviteUser = async (req, res, next) => {
  try {
    const user = await userService.inviteUser(req.body, req.user._id);
    return created(res, user, 'Invitation sent successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

const acceptInvite = async (req, res, next) => {
  try {
    const user = await userService.acceptInvite(req.body.token, req.body.password);
    return success(res, user, 'Account activated successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

const resendInvite = async (req, res, next) => {
  try {
    await userService.resendInvite(req.params.id);
    return success(res, null, 'Invitation resent successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const user = await userService.update(req.params.id, req.body, req.user._id);
    return success(res, user, 'User updated successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    await userService.softDelete(req.params.id, req.user._id);
    return success(res, null, 'User deleted successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

module.exports = { list, getById, create, inviteUser, acceptInvite, resendInvite, update, remove };
