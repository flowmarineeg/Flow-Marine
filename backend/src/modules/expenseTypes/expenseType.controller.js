'use strict';

const svc = require('./expenseType.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list           = async (req, res, next) => { try { const { page=1,limit=20,search='',category='' } = req.query; const { data,total } = await svc.list({page,limit,search,category}); return success(res,data,'Expense types retrieved',200,paginate(total,page,limit)); } catch(e){ next(e); } };
const getById        = async (req, res, next) => { try { return success(res, await svc.getById(req.params.id)); } catch(e){ if(e.status) return error(res,e.message,e.status); next(e); } };
const getCategories  = async (req, res, next) => { try { return success(res, await svc.getCategories(), 'Categories retrieved'); } catch(e){ next(e); } };
const createCategory = async (req, res, next) => { try { return created(res, await svc.createCategory(req.body.name, req.user._id), 'Category created'); } catch(e){ if(e.status) return error(res,e.message,e.status); next(e); } };
const deleteCategory = async (req, res, next) => { try { await svc.deleteCategory(req.params.id); return success(res, null, 'Category deleted'); } catch(e){ if(e.status) return error(res,e.message,e.status); next(e); } };
const create         = async (req, res, next) => { try { return created(res, await svc.create(req.body,req.user._id),'Expense type created'); } catch(e){ if(e.status) return error(res,e.message,e.status); next(e); } };
const update         = async (req, res, next) => { try { req.auditOldDoc = await svc.getById(req.params.id); return success(res, await svc.update(req.params.id,req.body,req.user._id),'Expense type updated'); } catch(e){ if(e.status) return error(res,e.message,e.status); next(e); } };
const remove         = async (req, res, next) => { try { await svc.softDelete(req.params.id,req.user._id); return success(res,null,'Expense type deleted'); } catch(e){ if(e.status) return error(res,e.message,e.status); next(e); } };

module.exports = { list, getById, getCategories, createCategory, deleteCategory, create, update, remove };
