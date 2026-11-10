'use strict';

const bookingService = require('./booking.service');
const voyageService  = require('./bookingVoyage.service');
const lookups        = require('./bookingLookups.service');
const { scopeOf }    = require('./partnerScope');
const { success, created, error, paginate } = require('../../utils/responseHelper');

// Errors thrown as { status, message, errors? } (e.g. VOYAGE_AMBIGUOUS carries the candidate voyages).
const fail = (res, next, err) => (err && err.status ? error(res, err.message, err.status, err.errors || []) : next(err));

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', voyageId = '', agentId = '', roundId = '', partnerId = '', status = '', dateFrom = '', dateTo = '', dischargeStatus = '' } = req.query;
    const { data, total } = await bookingService.list({ page, limit, search, voyageId, agentId, roundId, partnerId, status, dateFrom, dateTo, dischargeStatus }, scopeOf(req.user));
    return success(res, data, 'Bookings retrieved', 200, paginate(total, page, limit));
  } catch (err) { fail(res, next, err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await bookingService.getById(req.params.id, scopeOf(req.user)));
  } catch (err) { fail(res, next, err); }
};

const getVoyagePorts = async (req, res, next) => {
  try {
    return success(res, await bookingService.getVoyagePorts(req.params.voyageId), 'Voyage ports retrieved');
  } catch (err) { fail(res, next, err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await bookingService.create(req.body, req.user._id, scopeOf(req.user)), 'Booking created');
  } catch (err) { fail(res, next, err); }
};

const update = async (req, res, next) => {
  try {
    const scope = scopeOf(req.user);
    req.auditOldDoc = await bookingService.getById(req.params.id, scope);
    return success(res, await bookingService.update(req.params.id, req.body, req.user._id, scope), 'Booking updated');
  } catch (err) { fail(res, next, err); }
};

const remove = async (req, res, next) => {
  try {
    await bookingService.hardDelete(req.params.id, scopeOf(req.user));
    return success(res, null, 'Booking deleted');
  } catch (err) { fail(res, next, err); }
};

// POST /bookings/resolve-voyage — what voyage would a booking from POL to POD get right now (form hint).
const resolveVoyage = async (req, res, next) => {
  try {
    const { roundId, polId, podId, polLegKey, podLegKey } = req.body;
    return success(res, await voyageService.previewVoyage({ roundId, polId, podId, polLegKey, podLegKey }), 'Voyage resolved');
  } catch (err) { fail(res, next, err); }
};

// GET /bookings/lookups?roundId= — slim pick-lists for the booking forms (also for partner users).
const getLookups = async (req, res, next) => {
  try {
    const partnerScope = scopeOf(req.user); // a partner user without a partner gets 403 here too
    return success(res, await lookups.getLookups({ roundId: req.query.roundId, partnerScope }), 'Lookups retrieved');
  } catch (err) { fail(res, next, err); }
};

const staffOnly = (user) => { if (scopeOf(user)) throw { status: 403, message: 'Not available to partner users' }; };

// GET /bookings/discharge-list?roundId=&polId=&podId=&agentId=&voyageId= — the Final Loading bookings POL -> POD.
const dischargeList = async (req, res, next) => {
  try {
    staffOnly(req.user);
    const { roundId, polId, podId, agentId, voyageId } = req.query;
    return success(res, await bookingService.listDischarge({ roundId, polId, podId, agentId, voyageId }), 'Discharge list retrieved');
  } catch (err) { fail(res, next, err); }
};

// GET /bookings/export/discharge-list — the same list as an Excel sheet.
const exportDischargeList = async (req, res, next) => {
  try {
    staffOnly(req.user);
    const { roundId, polId, podId, agentId, voyageId } = req.query;
    const { buffer, filename, count } = await bookingService.exportDischargeList({ roundId, polId, podId, agentId, voyageId });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Count', String(count));
    res.end(Buffer.from(buffer));
  } catch (err) { fail(res, next, err); }
};

module.exports = { list, getById, getVoyagePorts, create, update, remove, resolveVoyage, getLookups, dischargeList, exportDischargeList };
