'use strict';

const importService = require('./bookingImport.service');
const { success, created, error } = require('../../utils/responseHelper');

// POST /bookings/import/preview
const preview = async (req, res, next) => {
  try {
    const { rows, agentId, roundId, importType } = req.body;
    const result = await importService.previewImport({ rows, agentId, roundId, importType });
    return success(res, result, 'Preview generated');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

// POST /bookings/import/save
const save = async (req, res, next) => {
  try {
    const { rows, agentId, roundId, importType } = req.body;
    const result = await importService.saveImport({
      rows, agentId, roundId, importType, createdBy: req.user._id,
    });
    return created(res, result,
      `Import complete — ${result.created.length} created, ${result.updated.length} updated`
    );
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

// GET /bookings/import/template-columns
const templateColumns = async (req, res, next) => {
  try {
    const columns = importService.getTemplateColumns();
    return success(res, columns, 'Template columns');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

// GET /bookings/import/template
const downloadTemplate = async (req, res, next) => {
  try {
    const buffer = await importService.buildImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="booking-import-template.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

module.exports = { preview, save, templateColumns, downloadTemplate };
