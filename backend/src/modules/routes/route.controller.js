'use strict';

const routeService = require('./route.service');
const { success, error } = require('../../utils/responseHelper');

const getRoute = async (req, res, next) => {
  try {
    return success(res, await routeService.getByServiceId(req.params.id), 'Route retrieved');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const saveRoute = async (req, res, next) => {
  try {
    const { legs } = req.body;
    const result = await routeService.saveLegs(req.params.id, legs, req.user._id);
    return success(res, result, 'Route saved successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { getRoute, saveRoute };
