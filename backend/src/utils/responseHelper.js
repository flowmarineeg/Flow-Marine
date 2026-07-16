'use strict';

const success = (res, data = null, message = 'Success', statusCode = 200, pagination = null) => {
  const response = { success: true, message, data };
  if (pagination) response.pagination = pagination;
  return res.status(statusCode).json(response);
};

const created = (res, data = null, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

const error = (res, message = 'Something went wrong', statusCode = 500, errors = []) => {
  return res.status(statusCode).json({ success: false, message, errors });
};

const notFound = (res, message = 'Record not found') => {
  return error(res, message, 404);
};

const badRequest = (res, message = 'Bad request', errors = []) => {
  return error(res, message, 400, errors);
};

const unauthorized = (res, message = 'Unauthorized') => {
  return error(res, message, 401);
};

const forbidden = (res, message = 'Forbidden — insufficient permissions') => {
  return error(res, message, 403);
};

const paginate = (total, page, limit) => ({
  total,
  page: Number(page),
  limit: Number(limit),
  totalPages: Math.ceil(total / limit),
});

module.exports = { success, created, error, notFound, badRequest, unauthorized, forbidden, paginate };
