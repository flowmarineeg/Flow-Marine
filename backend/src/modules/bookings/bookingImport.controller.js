'use strict';

const importService = require('./bookingImport.service');
const { scopeOf } = require('./partnerScope');
const { success, created, error } = require('../../utils/responseHelper');

const fail = (res, next, err) => (err && err.status ? error(res, err.message, err.status, err.errors || []) : next(err));

// POST /bookings/import/preview
const preview = async (req, res, next) => {
  try {
    const { rows, agentId, roundId, polId, podId, voyageId, importType } = req.body;
    const scope = scopeOf(req.user);
    // Discharge is its own match-only path, scoped by Round + Agent + POD (+ POL, + Voyage).
    const result = importType === 'discharge'
      ? (scope ? (() => { throw { status: 403, message: 'Partner users can only import bookings' }; })()
               : await importService.previewDischargeImport({ rows, agentId, roundId, polId, podId, voyageId }))
      : await importService.previewImport({ rows, agentId, roundId, importType, scope });
    return success(res, result, 'Preview generated');
  } catch (err) { fail(res, next, err); }
};

// POST /bookings/import/save
const save = async (req, res, next) => {
  try {
    const { rows, agentId, roundId, polId, podId, voyageId, importType, partnerId } = req.body;
    const scope = scopeOf(req.user);
    if (importType === 'discharge') {
      if (scope) throw { status: 403, message: 'Partner users can only import bookings' };
      const result = await importService.saveDischargeImport({
        rows, agentId, roundId, polId, podId, voyageId, createdBy: req.user._id,
      });
      return created(res, result,
        `Discharge recorded — ${result.discharged.length} discharged, ${result.remainingCount} remaining`
      );
    }
    const result = await importService.saveImport({
      rows, agentId, roundId, importType, createdBy: req.user._id, partnerId, scope,
    });
    return created(res, result,
      `Import complete — ${result.created.length} created, ${result.updated.length} updated`
    );
  } catch (err) { fail(res, next, err); }
};

// GET /bookings/import/template-columns
const templateColumns = async (req, res, next) => {
  try {
    return success(res, importService.getTemplateColumns(), 'Template columns');
  } catch (err) { fail(res, next, err); }
};

// GET /bookings/import/template
const downloadTemplate = async (req, res, next) => {
  try {
    const buffer = await importService.buildImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="booking-import-template.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (err) { fail(res, next, err); }
};

module.exports = { preview, save, templateColumns, downloadTemplate };
