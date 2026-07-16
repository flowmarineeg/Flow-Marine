'use strict';

const roleService = require('./role.service');
const { success, created, error } = require('../../utils/responseHelper');

const list    = async (req, res, next) => { try { return success(res, await roleService.list({ search: req.query.search })); } catch (e) { next(e); } };
const getById = async (req, res, next) => { try { return success(res, await roleService.getById(req.params.id)); } catch (e) { if (e.status) return error(res, e.message, e.status); next(e); } };
const create  = async (req, res, next) => { try { return created(res, await roleService.create(req.body, req.user._id), 'Role created'); } catch (e) { if (e.status) return error(res, e.message, e.status); next(e); } };
const update  = async (req, res, next) => { try { return success(res, await roleService.update(req.params.id, req.body, req.user._id), 'Role updated'); } catch (e) { if (e.status) return error(res, e.message, e.status); next(e); } };
const remove  = async (req, res, next) => { try { await roleService.remove(req.params.id); return success(res, null, 'Role deleted'); } catch (e) { if (e.status) return error(res, e.message, e.status); next(e); } };

module.exports = { list, getById, create, update, remove };
