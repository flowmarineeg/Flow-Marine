'use strict';

const svc = require('./location.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const wrap = (fn) => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    next(e);
  }
};

// Paginated list: { success, message, data: [...], total, page, limit } (+ the usual pagination object).
const listOf = (fn, message) => wrap(async (req, res) => {
  const { items, total, page, limit } = await fn(req.query);
  return res.status(200).json({ success: true, message, data: items, total, page, limit, pagination: paginate(total, page, limit) });
});

// ─── Countries ────────────────────────────────────────────────────────────────
const listCountries  = listOf(svc.listCountries, 'Countries retrieved');
const getCountry     = wrap(async (req, res) => success(res, await svc.getCountryById(req.params.id)));
const createCountry  = wrap(async (req, res) => created(res, await svc.createCountry(req.body, req.user._id), 'Country created'));
const updateCountry  = wrap(async (req, res) => { req.auditOldDoc = await svc.getCountryById(req.params.id); return success(res, await svc.updateCountry(req.params.id, req.body, req.user._id), 'Country updated'); });
const deleteCountry  = wrap(async (req, res) => { await svc.deleteCountry(req.params.id, req.user._id); return success(res, null, 'Country deleted'); });

// ─── Cities ───────────────────────────────────────────────────────────────────
const listCities  = listOf(svc.listCities, 'Cities retrieved');
const getCity      = wrap(async (req, res) => success(res, await svc.getCityById(req.params.id)));
const createCity  = wrap(async (req, res) => created(res, await svc.createCity(req.body, req.user._id), 'City created'));
const updateCity  = wrap(async (req, res) => { req.auditOldDoc = await svc.getCityById(req.params.id); return success(res, await svc.updateCity(req.params.id, req.body, req.user._id), 'City updated'); });
const deleteCity  = wrap(async (req, res) => { await svc.deleteCity(req.params.id, req.user._id); return success(res, null, 'City deleted'); });

// ─── Ports ────────────────────────────────────────────────────────────────────
const listPorts  = listOf(svc.listPorts, 'Ports retrieved');
const getPort     = wrap(async (req, res) => success(res, await svc.getPortById(req.params.id)));
const createPort = wrap(async (req, res) => created(res, await svc.createPort(req.body, req.user._id), 'Port created'));
const updatePort = wrap(async (req, res) => { req.auditOldDoc = await svc.getPortById(req.params.id); return success(res, await svc.updatePort(req.params.id, req.body, req.user._id), 'Port updated'); });
const deletePort = wrap(async (req, res) => { await svc.deletePort(req.params.id, req.user._id); return success(res, null, 'Port deleted'); });

// ─── Terminals ────────────────────────────────────────────────────────────────
const listTerminals  = listOf(svc.listTerminals, 'Terminals retrieved');
const getTerminal     = wrap(async (req, res) => success(res, await svc.getTerminalById(req.params.id)));
const createTerminal = wrap(async (req, res) => created(res, await svc.createTerminal(req.body, req.user._id), 'Terminal created'));
const updateTerminal = wrap(async (req, res) => { req.auditOldDoc = await svc.getTerminalById(req.params.id); return success(res, await svc.updateTerminal(req.params.id, req.body, req.user._id), 'Terminal updated'); });
const deleteTerminal = wrap(async (req, res) => { await svc.deleteTerminal(req.params.id, req.user._id); return success(res, null, 'Terminal deleted'); });

module.exports = {
  listCountries, getCountry, createCountry, updateCountry, deleteCountry,
  listCities, getCity, createCity, updateCity, deleteCity,
  listPorts, getPort, createPort, updatePort, deletePort,
  listTerminals, getTerminal, createTerminal, updateTerminal, deleteTerminal,
};
