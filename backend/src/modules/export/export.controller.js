'use strict';

const exportService = require('./export.service');
const { ALLOWED_MODULES } = exportService;

// ─── POST /export/excel ───────────────────────────────────────────────────────
const exportExcel = async (req, res, next) => {
  try {
    const { module: moduleName, filters = {}, selectedIds = [] } = req.body;

    if (!moduleName)
      return res.status(400).json({ success: false, message: 'module is required' });

    if (!ALLOWED_MODULES.includes(moduleName))
      return res.status(400).json({
        success: false,
        message: `Export not supported for: ${moduleName}. Allowed: ${ALLOWED_MODULES.join(', ')}`,
      });

    const { buffer, filename, count } = await exportService.exportSingle(
      moduleName, filters, selectedIds
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Count', count);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ─── POST /export/zip ─────────────────────────────────────────────────────────
const exportZip = async (req, res, next) => {
  try {
    const exportList = req.body.exports; // renamed — avoids shadowing Node's `exports`

    // Validate presence
    if (!exportList || !Array.isArray(exportList) || exportList.length === 0)
      return res.status(400).json({ success: false, message: 'exports array is required and must not be empty' });

    // if (exportList.length > 10)
    //   return res.status(400).json({ success: false, message: 'Maximum 10 exports per ZIP' });

    // Validate every module name BEFORE touching the response
    for (const exp of exportList) {
      if (!exp.module) {
        return res.status(400).json({ success: false, message: 'Each export entry must have a module field' });
      }
      if (!ALLOWED_MODULES.includes(exp.module)) {
        return res.status(400).json({
          success: false,
          message: `Export not supported for module: "${exp.module}". Allowed: ${ALLOWED_MODULES.join(', ')}`,
        });
      }
    }

    // All validation passed — now commit headers and stream
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="logistics-export-${date}.zip"`);

    // Stream ZIP directly to response
    await exportService.buildZipStream(exportList, res);

  } catch (err) {
    // Headers not yet sent if validation failed above — safe to send JSON
    // Headers already sent if ZIP streaming started — can only log
    if (!res.headersSent) {
      if (err.status) return res.status(err.status).json({ success: false, message: err.message });
      return res.status(500).json({ success: false, message: 'ZIP export failed — see server logs' });
    }
    console.error('[Export] ZIP streaming error:', err);
  }
};

module.exports = { exportExcel, exportZip };
