'use strict';

const invoiceService = require('./invoice.service');
const { generateInvoicePdf } = require('../../utils/invoicePdfGenerator');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, bookingId = '', agentId = '', status = '', dateFrom = '', dateTo = '' } = req.query;
    const { data, total } = await invoiceService.list({ page, limit, bookingId, agentId, status, dateFrom, dateTo });
    return success(res, data, 'Invoices retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await invoiceService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await invoiceService.create(req.body, req.user._id), 'Invoice created');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await invoiceService.getById(req.params.id);
    return success(res, await invoiceService.update(req.params.id, req.body, req.user._id), 'Invoice updated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await invoiceService.softDelete(req.params.id, req.user._id);
    return success(res, null, 'Invoice deleted');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// Sprint020: PDF export — streams the invoice as a downloadable PDF
const downloadPdf = async (req, res, next) => {
  try {
    const invoice = await invoiceService.getByIdForPdf(req.params.id);
    const pdfBuffer = await generateInvoicePdf(invoice);
    const filename  = `invoice-${invoice.invoiceNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, create, update, remove, downloadPdf };
