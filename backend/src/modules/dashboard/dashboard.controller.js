'use strict';

const dashboardService = require('./dashboard.service');
const { success } = require('../../utils/responseHelper');

const getStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getDashboardStats();
    return success(res, stats, 'Dashboard stats retrieved');
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats };
