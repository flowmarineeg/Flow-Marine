'use strict';

const importService = require('./bookingImport.service');
const { success, created, error } = require('../../utils/responseHelper');

// POST /bookings/import/preview
const preview = async (req, res, next) => {
  try {
    const { rows, agentId, voyageId, importType } = req.body;
    const result = await importService.previewImport({ rows, agentId, voyageId, importType });
    return success(res, result, 'Preview generated');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

// POST /bookings/import/save
const save = async (req, res, next) => {
  try {
    const { rows, agentId, voyageId, importType } = req.body;
    const result = await importService.saveImport({
      rows, agentId, voyageId, importType, createdBy: req.user._id,
    });
    return created(res, result,
      `Import complete — ${result.created.length} created, ${result.updated.length} updated`
    );
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

module.exports = { preview, save };
