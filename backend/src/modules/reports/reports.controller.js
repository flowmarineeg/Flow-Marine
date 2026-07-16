'use strict';

const reportsService = require('./reports.service');
const { success, error } = require('../../utils/responseHelper');

const getRoundPnL = async (req, res, next) => {
  try {
    return success(res, await reportsService.getRoundPnL(req.query), 'Round P&L report generated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getVoyagePerformance = async (req, res, next) => {
  try {
    return success(res, await reportsService.getVoyagePerformance(req.query), 'Voyage performance report generated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getBookingReport = async (req, res, next) => {
  try {
    return success(res, await reportsService.getBookingReport(req.query), 'Booking report generated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getRevenueReport = async (req, res, next) => {
  try {
    return success(res, await reportsService.getRevenueReport(req.query), 'Revenue report generated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getExpenseReport = async (req, res, next) => {
  try {
    return success(res, await reportsService.getExpenseReport(req.query), 'Expense report generated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { getRoundPnL, getVoyagePerformance, getBookingReport, getRevenueReport, getExpenseReport };
