'use strict';

const ExcelJS  = require('exceljs');
const archiver = require('archiver');

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 040 — human-readable export names, used only for the metadata sheet
// (Section 4, "Export Metadata") and nowhere else — the request/response
// workflow (module key, filters, selectedIds) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
const MODULE_LABELS = {
  vessels:        'Vessels',
  agents:         'Agents',
  containerTypes: 'Container Types',
  expenseTypes:   'Expense Types',
  services:       'Services',
  rounds:         'Rounds',
  voyages:        'Voyages',
  bookings:       'Bookings (Layer 2 — Operational)',
  manualBookings: 'Bookings (Layer 1 — Manual)',
  expenses:       'Expenses',
  invoices:       'Invoices',
  tracking:       'Tracking History',
  auditLogs:      'Audit Logs',
};

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions — every exported module
// Sprint 040 — reviewed and updated column-by-column against each module's
// CURRENT schema (see sprints/040-sprint.txt Section 3 for the full audit).
// Column order chosen for business readability: identity/reference columns
// first, then the fields a business user actually reads to make a decision,
// then administrative/audit columns (status, notes, created date) last.
// ─────────────────────────────────────────────────────────────────────────────
const COLUMNS = {
  vessels: [
    { header: 'Vessel Code',           key: 'vesselCode',           width: 15 },
    { header: 'Vessel Name',           key: 'vesselName',           width: 25 },
    { header: 'IMO Number',            key: 'imoNumber',            width: 15 },
    { header: 'Flag',                  key: 'flag',                 width: 12 },
    { header: 'Call Sign',             key: 'callSign',             width: 12 },
    { header: 'Ownership Type',        key: 'ownershipType',        width: 16 },
    { header: 'Owner Name',            key: 'ownerName',            width: 20 },
    { header: 'Ownership Description', key: 'ownershipDescription', width: 35 },
    { header: 'Manager',               key: 'manager',              width: 20 },
    { header: 'Charter Start',         key: 'charterStartDate',     width: 14 },
    { header: 'Charter End',           key: 'charterEndDate',       width: 14 },
    { header: 'Capacity (TEU)',        key: 'capacity',             width: 14 },
    { header: 'DWT',                   key: 'dwt',                  width: 12 },
    { header: 'LOA (m)',               key: 'loa',                  width: 12 },
    { header: 'Beam (m)',              key: 'beam',                 width: 12 },
    { header: 'Summer Draft (m)',      key: 'summerDraft',          width: 15 },
    { header: 'Gross Tonnage',         key: 'grossTonnage',         width: 15 },
    { header: 'Net Tonnage',           key: 'netTonnage',           width: 14 },
    { header: 'Suez GT',               key: 'suezGT',               width: 12 },
    { header: 'Suez NT',               key: 'suezNT',               width: 12 },
    { header: 'Total Bunker Capacity (MT)', key: 'totalBunkerCapacity', width: 20 },
    { header: 'VLSFO Capacity (MT)',   key: 'vlsfoCapacity',        width: 18 },
    { header: 'MDO Capacity (MT)',     key: 'mdoCapacity',          width: 16 },
    { header: 'Fresh Water Capacity (MT)', key: 'fwCapacity',       width: 20 },
    { header: 'Built Year',            key: 'builtYear',            width: 12 },
    { header: 'Status',                key: 'status',               width: 14 },
    { header: 'Notes',                 key: 'notes',                width: 30 },
    { header: 'Created At',            key: 'createdAt',            width: 20 },
  ],
  agents: [
    { header: 'Agent Code',              key: 'agentCode',         width: 15 },
    { header: 'Agent Name',              key: 'agentName',         width: 25 },
    { header: 'Country',                 key: 'country',           width: 15 },
    { header: 'City',                    key: 'city',              width: 15 },
    { header: 'Port',                    key: 'port',              width: 15 },
    { header: 'Address',                 key: 'address',           width: 25 },
    { header: 'Primary Contact Person',  key: 'primaryContact',    width: 22 },
    { header: 'Primary Mobile',          key: 'primaryMobile',     width: 18 },
    { header: 'Primary Email',           key: 'primaryEmail',      width: 25 },
    { header: 'Primary Description',     key: 'primaryDesc',       width: 25 },
    { header: 'Status',                  key: 'status',            width: 12 },
    { header: 'Created At',              key: 'createdAt',         width: 20 },
  ],
  containerTypes: [
    { header: 'Code',        key: 'code',        width: 15 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Size',        key: 'size',        width: 10 },
    { header: 'Type',        key: 'type',        width: 15 },
    { header: 'Created At',  key: 'createdAt',   width: 20 },
  ],
  expenseTypes: [
    { header: 'Name',                key: 'name',               width: 30 },
    { header: 'Category',            key: 'category',           width: 20 },
    { header: 'Cost Classification', key: 'costClassification', width: 20 },
    { header: 'Created At',          key: 'createdAt',          width: 20 },
  ],
  services: [
    { header: 'Service Code',    key: 'serviceCode',     width: 16 },
    { header: 'Service Name',    key: 'serviceName',     width: 30 },
    { header: 'Default Vessel',  key: 'defaultVessel',   width: 25 },
    { header: 'Status',          key: 'status',          width: 12 },
    { header: 'Description',     key: 'description',     width: 35 },
    { header: 'Created At',      key: 'createdAt',       width: 20 },
  ],
  rounds: [
    { header: 'Round Number',  key: 'roundNumber',  width: 16 },
    { header: 'Round Name',    key: 'roundName',    width: 22 },
    { header: 'Service Code',  key: 'serviceCode',  width: 15 },
    { header: 'Service Name',  key: 'serviceName',  width: 28 },
    { header: 'Vessel Code',   key: 'vesselCode',   width: 14 },
    { header: 'Vessel Name',   key: 'vesselName',   width: 22 },
    { header: 'Start Date',    key: 'startDate',    width: 14 },
    { header: 'End Date',      key: 'endDate',      width: 14 },
    { header: 'Status',        key: 'status',       width: 12 },
    { header: 'Notes',         key: 'notes',        width: 30 },
    { header: 'Created At',    key: 'createdAt',    width: 20 },
  ],
  voyages: [
    { header: 'Voyage Number', key: 'voyageNumber', width: 22 },
    { header: 'Voyage Name',   key: 'voyageName',   width: 22 },
    { header: 'Round Number',  key: 'roundNumber',  width: 16 },
    { header: 'Round Name',    key: 'roundName',    width: 22 },
    { header: 'Service Code',  key: 'serviceCode',  width: 15 },
    { header: 'POL',           key: 'polName',      width: 20 },
    { header: 'POD',           key: 'podName',      width: 20 },
    { header: 'ETD',           key: 'etd',          width: 18 },
    { header: 'ETA',           key: 'eta',          width: 18 },
    { header: 'ETP',           key: 'etp',          width: 18 },
    { header: 'ATD',           key: 'atd',          width: 18 },
    { header: 'ATA',           key: 'ata',          width: 18 },
    { header: 'Manual Voyage', key: 'isManual',     width: 14 },
    { header: 'Status',        key: 'status',       width: 14 },
    { header: 'Sequence',      key: 'sequence',     width: 10 },
  ],
  // Layer 2 — Operational Bookings (one booking = one container, Sprint 025/026)
  bookings: [
    { header: 'Booking Number',    key: 'bookingNumber',    width: 18 },
    { header: 'Container Number',  key: 'containerNumber',  width: 20 },
    { header: 'Voyage Number',     key: 'voyageNumber',     width: 22 },
    { header: 'Voyage Name',       key: 'voyageName',       width: 22 },
    { header: 'Agent Code',        key: 'agentCode',        width: 14 },
    { header: 'Agent Name',        key: 'agentName',        width: 22 },
    { header: 'Carrier Name',      key: 'carrierName',      width: 22 },
    { header: 'Shipper',           key: 'shipper',          width: 25 },
    { header: 'Consignee',         key: 'consignee',        width: 25 },
    { header: 'POL',               key: 'polName',          width: 18 },
    { header: 'POD',               key: 'podName',          width: 18 },
    { header: 'Container Type',    key: 'containerType',    width: 16 },
    { header: 'Container Status',  key: 'containerStatus',  width: 15 },
    { header: 'Commodity',         key: 'commodity',        width: 20 },
    { header: 'Hazardous',         key: 'dg',               width: 12 },
    { header: 'IMDG Code',         key: 'imdgCode',         width: 14 },
    { header: 'VGM (kg)',          key: 'vgm',              width: 12 },
    { header: 'Freight Rate',      key: 'freightRate',      width: 14 },
    { header: 'Total Freight',     key: 'totalFreight',     width: 15 },
    { header: 'Remarks',           key: 'remarks',          width: 25 },
    { header: 'Status',            key: 'status',           width: 14 },
    { header: 'Created At',        key: 'createdAt',        width: 20 },
  ],
  // Layer 1 — Manual (commercial reservation) Bookings, Sprint 023.
  // Exported as its own independent module — NOT merged with Layer 2
  // ('bookings' above) — the two collections have different shapes and
  // different business purposes (reservation vs. operational container).
  manualBookings: [
    { header: 'Booking Number',  key: 'bookingNumber', width: 18 },
    { header: 'Voyage Number',   key: 'voyageNumber',  width: 22 },
    { header: 'Voyage Name',     key: 'voyageName',    width: 22 },
    { header: 'Agent Code',      key: 'agentCode',     width: 14 },
    { header: 'Agent Name',      key: 'agentName',     width: 22 },
    { header: 'POL',             key: 'polName',       width: 18 },
    { header: 'POD',             key: 'podName',       width: 18 },
    { header: 'Total Units',     key: 'totalUnits',    width: 12 },
    { header: 'Total TEU',       key: 'totalTEU',      width: 12 },
    { header: 'Total Freight',   key: 'totalFreight',  width: 15 },
    { header: 'Remarks',         key: 'remarks',       width: 25 },
    { header: 'Status',          key: 'status',        width: 14 },
    { header: 'Created At',      key: 'createdAt',     width: 20 },
  ],
  expenses: [
    { header: 'Expense Date',    key: 'expenseDate',     width: 14 },
    { header: 'Expense Type',    key: 'expenseTypeName', width: 22 },
    { header: 'Category',        key: 'category',        width: 20 },
    { header: 'Scope',           key: 'scope',           width: 12 },
    { header: 'Round Number',    key: 'roundNumber',     width: 16 },
    { header: 'Round Name',      key: 'roundName',       width: 22 },
    { header: 'Voyage Number',   key: 'voyageNumber',    width: 22 },
    { header: 'Voyage Name',     key: 'voyageName',      width: 22 },
    { header: 'Port',            key: 'portName',        width: 18 },
    { header: 'Agent',           key: 'agentName',       width: 20 },
    { header: 'Amount',          key: 'amount',          width: 14 },
    { header: 'Currency',        key: 'currency',        width: 10 },
    { header: 'Description',     key: 'description',     width: 30 },
    { header: 'Created At',      key: 'createdAt',       width: 20 },
  ],
  invoices: [
    { header: 'Invoice Number',      key: 'invoiceNumber',   width: 18 },
    { header: 'Invoice Type',        key: 'invoiceType',     width: 12 },
    { header: 'Bookings',            key: 'bookingNumbers',  width: 30 },
    { header: 'Orphaned Line Items', key: 'orphanedCount',   width: 16 },
    { header: 'Agent Code',          key: 'agentCode',       width: 14 },
    { header: 'Agent Name',          key: 'agentName',       width: 22 },
    { header: 'Invoice Date',        key: 'invoiceDate',     width: 14 },
    { header: 'Due Date',            key: 'dueDate',         width: 14 },
    { header: 'Total Amount',        key: 'totalAmount',     width: 14 },
    { header: 'Paid Amount',         key: 'paidAmount',      width: 14 },
    { header: 'Balance',             key: 'balanceAmount',   width: 14 },
    { header: 'Currency',            key: 'currency',        width: 10 },
    { header: 'Status',              key: 'status',          width: 14 },
    { header: 'Notes',               key: 'notes',           width: 28 },
    { header: 'Created At',          key: 'createdAt',       width: 20 },
  ],
  tracking: [
    { header: 'Last Update',    key: 'lastUpdate',   width: 20 },
    { header: 'Voyage Number',  key: 'voyageNumber', width: 22 },
    { header: 'Voyage Name',    key: 'voyageName',   width: 22 },
    { header: 'Round Number',   key: 'roundNumber',  width: 16 },
    { header: 'Round Name',     key: 'roundName',    width: 22 },
    { header: 'Vessel Code',    key: 'vesselCode',   width: 14 },
    { header: 'Vessel Name',    key: 'vesselName',   width: 22 },
    { header: 'Service Code',   key: 'serviceCode',  width: 15 },
    { header: 'Port',           key: 'portName',     width: 20 },
    { header: 'Terminal',       key: 'terminalName', width: 20 },
    { header: 'Status',         key: 'status',       width: 14 },
    { header: 'Remarks',        key: 'remarks',       width: 30 },
    { header: 'Recorded By',    key: 'createdBy',    width: 20 },
  ],
  auditLogs: [
    { header: 'Timestamp',     key: 'timestamp',    width: 22 },
    { header: 'User Email',    key: 'userEmail',    width: 28 },
    { header: 'Action',        key: 'action',       width: 12 },
    { header: 'Module',        key: 'module',       width: 18 },
    { header: 'Record Number', key: 'recordNumber', width: 18 },
    { header: 'IP Address',    key: 'ipAddress',    width: 18 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Excel builder
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (v) => {
  if (!v) return '';
  try { return new Date(v).toLocaleDateString('en-GB'); } catch { return String(v); }
};

const flattenDoc = (doc, columns) => {
  const row = {};
  columns.forEach(({ key }) => {
    let val = doc[key];
    if (val instanceof Date || (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val))) {
      val = fmtDate(val);
    }
    if (val === null || val === undefined) val = '';
    row[key] = val;
  });
  return row;
};

// Sprint 040 — Export Metadata (Section 4). Added as its own worksheet
// ("Export Info"), placed BEFORE the data worksheet in the same workbook —
// this does not change the existing export workflow (same request/response
// shape, same filename, same single-file download) — it only adds one
// extra sheet inside the same .xlsx file.
const addMetadataSheet = (workbook, { moduleLabel, generatedAt, generatedBy, filters, count }) => {
  const sheet = workbook.addWorksheet('Export Info');
  sheet.columns = [
    { header: 'Field', key: 'field', width: 22 },
    { header: 'Value', key: 'value', width: 50 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4057' } };
  headerRow.alignment = { vertical: 'middle' };

  const appliedFilters = Object.entries(filters || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' | ') || 'None';

  [
    { field: 'Export Name',     value: moduleLabel },
    { field: 'Generated At',    value: generatedAt },
    { field: 'Generated By',    value: generatedBy || 'Unknown' },
    { field: 'Applied Filters', value: appliedFilters },
    { field: 'Record Count',    value: count },
  ].forEach(r => sheet.addRow(r));

  sheet.getColumn('field').font = { bold: true };
};

const buildExcelBuffer = async (moduleName, rows, customColumns, meta = {}) => {
  const columns = customColumns || COLUMNS[moduleName];
  if (!columns) throw { status: 400, message: `No column definition for module: ${moduleName}` };

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'Logistics SaaS';
  workbook.created = new Date();

  // Sprint 040 — metadata sheet added first (Export Name/Generated At/
  // Generated By/Applied Filters/Record Count), the data sheet unchanged.
  addMetadataSheet(workbook, {
    moduleLabel: MODULE_LABELS[moduleName] || moduleName,
    generatedAt: new Date().toLocaleString('en-GB'),
    generatedBy: meta.generatedBy,
    filters:     meta.filters,
    count:       rows.length,
  });

  const sheetName = moduleName.length > 31 ? moduleName.slice(0, 31) : moduleName;
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columns;

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4057' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height    = 22;

  // Add data rows with alternating stripe
  rows.forEach((doc, idx) => {
    const row = worksheet.addRow(flattenDoc(doc, columns));
    row.eachCell(cell => {
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8F9FA' },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE4E7EC' } },
      };
    });
  });

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
};

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers — one per module, returns flat rows ready for Excel
// ─────────────────────────────────────────────────────────────────────────────
const fetchData = async (moduleName, filters = {}, selectedIds = []) => {
  const idFilter = selectedIds && selectedIds.length > 0 ? { _id: { $in: selectedIds } } : {};
  const fmtD = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';
  const dateRange = (from, to) => {
    const q = {};
    if (from) q.$gte = new Date(from);
    if (to)   q.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    return Object.keys(q).length ? q : null;
  };

  switch (moduleName) {
    case 'vessels': {
      const Vessel = require('../vessels/vessel.model');
      const q = { ...idFilter };
      if (filters.status) q.status = filters.status;
      const rows = await Vessel.find(q).sort({ createdAt: -1 }).lean();
      return rows.map(r => ({
        ...r,
        charterStartDate: fmtD(r.charterStartDate),
        charterEndDate:   fmtD(r.charterEndDate),
        createdAt:        fmtD(r.createdAt),
      }));
    }

    case 'agents': {
      const Agent = require('../agents/agent.model');
      const q = { ...idFilter };
      if (filters.status) q.status = filters.status;
      const rows = await Agent.find(q).sort({ createdAt: -1 }).lean();
      return rows.map(r => ({
        agentCode:      r.agentCode    || '',
        agentName:      r.agentName,
        country:        r.country      || '',
        city:           r.city         || '',
        port:           r.port         || '',
        address:        r.address      || '',
        primaryContact: r.contacts?.[0]?.contactPerson || '',
        primaryMobile:  r.contacts?.[0]?.mobile        || '',
        primaryEmail:   r.contacts?.[0]?.email         || '',
        primaryDesc:    r.contacts?.[0]?.description   || '',
        status:         r.status,
        createdAt:      fmtD(r.createdAt),
      }));
    }

    case 'containerTypes': {
      const CT = require('../containerTypes/containerType.model');
      const q = { ...idFilter };
      const rows = await CT.find(q).sort({ createdAt: -1 }).lean();
      return rows.map(r => ({ ...r, createdAt: fmtD(r.createdAt) }));
    }

    case 'expenseTypes': {
      const ET = require('../expenseTypes/expenseType.model');
      const expenseTypeService = require('../expenseTypes/expenseType.service');
      const q = { ...idFilter };
      const [rows, classificationMap] = await Promise.all([
        ET.find(q).sort({ createdAt: -1 }).lean(),
        expenseTypeService.getCostClassificationMap(),
      ]);
      return rows.map(r => ({
        ...r,
        costClassification: classificationMap[(r.category || '').trim().toUpperCase()] || 'Other Voyage Cost',
        createdAt: fmtD(r.createdAt),
      }));
    }

    case 'services': {
      const Service = require('../services/service.model');
      const q = { ...idFilter };
      if (filters.status) q.status = filters.status;
      const rows = await Service.find(q)
        .populate('defaultVesselId', 'vesselCode vesselName')
        .sort({ createdAt: -1 }).lean();
      return rows.map(r => ({
        serviceCode:    r.serviceCode,
        serviceName:    r.serviceName,
        defaultVessel:  r.defaultVesselId
          ? `${r.defaultVesselId.vesselCode} ${r.defaultVesselId.vesselName}`
          : '',
        status:         r.status,
        description:    r.description || '',
        createdAt:      fmtD(r.createdAt),
      }));
    }

    case 'rounds': {
      const Round = require('../rounds/round.model');
      const q = { ...idFilter };
      if (filters.status) q.status = filters.status;
      const dr = dateRange(filters.dateFrom, filters.dateTo);
      if (dr) q.startDate = dr;
      const rows = await Round.find(q)
        .populate('serviceId', 'serviceCode serviceName')
        .populate('vesselId',  'vesselCode vesselName')
        .sort({ createdAt: -1 }).lean();
      return rows.map(r => ({
        roundNumber:  r.roundNumber,
        roundName:    r.roundName || '',
        serviceCode:  r.serviceId?.serviceCode || '',
        serviceName:  r.serviceId?.serviceName || '',
        vesselCode:   r.vesselId?.vesselCode   || '',
        vesselName:   r.vesselId?.vesselName   || '',
        startDate:    fmtD(r.startDate),
        endDate:      fmtD(r.endDate),
        status:       r.status,
        notes:        r.notes || '',
        createdAt:    fmtD(r.createdAt),
      }));
    }

    case 'voyages': {
      const Voyage = require('../voyages/voyage.model');
      const q = { ...idFilter };
      if (filters.status)    q.status    = filters.status;
      if (filters.serviceId) q.serviceId = filters.serviceId;
      const rows = await Voyage.find(q)
        .populate('roundId',   'roundNumber roundName')
        .populate('serviceId', 'serviceCode')
        .populate('polId',     'name code')
        .populate('podId',     'name code')
        .sort({ etd: 1 }).lean();
      return rows.map(r => ({
        voyageNumber: r.voyageNumber,
        voyageName:   r.voyageName || '',
        roundNumber:  r.roundId?.roundNumber  || '',
        roundName:    r.roundId?.roundName    || '',
        serviceCode:  r.serviceId?.serviceCode || '',
        polName:      r.polId?.name || '',
        podName:      r.podId?.name || '',
        etd:          fmtD(r.etd),
        eta:          fmtD(r.eta),
        etp:          fmtD(r.etp),
        atd:          fmtD(r.atd),
        ata:          fmtD(r.ata),
        isManual:     r.isManual ? 'Yes' : 'No',
        status:       r.status,
        sequence:     r.sequence,
      }));
    }

    // Layer 2 — Operational Bookings (Booking model)
    case 'bookings': {
      const Booking = require('../bookings/booking.model');
      const q = { ...idFilter };
      if (filters.status)   q.status   = filters.status;
      if (filters.voyageId) q.voyageId = filters.voyageId;
      if (filters.agentId)  q.agentId  = filters.agentId;
      const rows = await Booking.find(q)
        .populate('voyageId',        'voyageNumber voyageName')
        .populate('agentId',         'agentCode agentName')
        .populate('polId',           'name')
        .populate('podId',           'name')
        .populate('containerTypeId', 'code size type')
        .sort({ createdAt: -1 }).lean();
      return rows.map(r => ({
        bookingNumber:    r.bookingNumber,
        containerNumber:  r.containerNumber           || '',
        voyageNumber:     r.voyageId?.voyageNumber    || '',
        voyageName:       r.voyageId?.voyageName      || '',
        agentCode:        r.agentId?.agentCode        || '',
        agentName:        r.agentId?.agentName        || '',
        carrierName:      r.carrierName               || '',
        shipper:          r.shipper                   || '',
        consignee:        r.consignee                 || '',
        polName:          r.polId?.name               || '',
        podName:          r.podId?.name               || '',
        containerType:    r.containerTypeId ? `${r.containerTypeId.code} ${r.containerTypeId.size}` : '',
        containerStatus:  r.containerStatus            || '',
        commodity:        r.commodity                  || '',
        dg:               r.dg ? 'Yes' : 'No',
        imdgCode:         r.imdgCode                    || '',
        vgm:              r.vgm ?? '',
        freightRate:      r.freightRate,
        totalFreight:     r.totalFreight,
        remarks:          r.remarks                     || '',
        status:           r.status,
        createdAt:        fmtD(r.createdAt),
      }));
    }

    // Layer 1 — Manual (commercial reservation) Bookings, exported
    // independently of Layer 2 (Sprint 040 refinement — never merged).
    case 'manualBookings': {
      const ManualBooking = require('../bookings/manualBooking.model');
      const q = { ...idFilter };
      if (filters.status)   q.status   = filters.status;
      if (filters.voyageId) q.voyageId = filters.voyageId;
      if (filters.agentId)  q.agentId  = filters.agentId;
      const rows = await ManualBooking.find(q)
        .populate('voyageId', 'voyageNumber voyageName')
        .populate('agentId',  'agentCode agentName')
        .populate('polId',    'name')
        .populate('podId',    'name')
        .sort({ createdAt: -1 }).lean();
      return rows.map(r => ({
        bookingNumber: r.bookingNumber,
        voyageNumber:  r.voyageId?.voyageNumber || '',
        voyageName:    r.voyageId?.voyageName   || '',
        agentCode:     r.agentId?.agentCode     || '',
        agentName:     r.agentId?.agentName     || '',
        polName:       r.polId?.name            || '',
        podName:       r.podId?.name            || '',
        totalUnits:    r.totalUnits,
        totalTEU:      r.totalTEU,
        totalFreight:  r.totalFreight,
        remarks:       r.remarks                 || '',
        status:        r.status,
        createdAt:     fmtD(r.createdAt),
      }));
    }

    case 'expenses': {
      const Expense = require('../expenses/expense.model');
      const { deriveScope } = require('../expenses/expense.service');
      const q = { ...idFilter };
      if (filters.currency)      q.currency      = filters.currency.toUpperCase();
      if (filters.expenseTypeId) q.expenseTypeId = filters.expenseTypeId;
      const dr = dateRange(filters.dateFrom, filters.dateTo);
      if (dr) q.expenseDate = dr;
      const rows = await Expense.find(q)
        .populate('expenseTypeId', 'name category')
        .populate('roundId',       'roundNumber roundName')
        .populate('voyageId',      'voyageNumber voyageName')
        .populate('agentId',       'agentCode agentName')
        .populate('portId',        'name code')
        .sort({ expenseDate: -1 }).lean();
      return rows.map(r => ({
        expenseDate:     fmtD(r.expenseDate),
        expenseTypeName: r.expenseTypeId?.name     || '',
        category:        r.expenseTypeId?.category || '',
        scope:           deriveScope(r),
        roundNumber:     r.roundId?.roundNumber    || '',
        roundName:       r.roundId?.roundName      || '',
        voyageNumber:    r.voyageId?.voyageNumber  || '',
        voyageName:      r.voyageId?.voyageName    || '',
        portName:        r.portId?.name || r.port  || '',
        agentName:       r.agentId?.agentName      || '',
        amount:          r.amount,
        currency:        r.currency,
        description:     r.description || '',
        createdAt:       fmtD(r.createdAt),
      }));
    }

    case 'invoices': {
      // Sprint 033: Invoice is now header + lineItems (Booking/Voyage/Round),
      // with paidAmount/balanceAmount instead of a single flat `amount`.
      const Invoice = require('../invoices/invoice.model');
      const q = { ...idFilter };
      if (filters.status)  q.status  = filters.status;
      if (filters.agentId) q.agentId = filters.agentId;
      const dr = dateRange(filters.dateFrom, filters.dateTo);
      if (dr) q.invoiceDate = dr;
      const rows = await Invoice.find(q)
        .populate('agentId', 'agentCode agentName')
        .sort({ invoiceDate: -1 }).lean({ virtuals: true });
      return rows.map(r => ({
        invoiceNumber:  r.invoiceNumber,
        invoiceType:    r.invoiceType,
        bookingNumbers: (r.lineItems || []).map(li => li.bookingNumber).filter(Boolean).join(', '),
        orphanedCount:  (r.lineItems || []).filter(li => li.orphaned).length,
        agentCode:      r.agentId?.agentCode       || '',
        agentName:      r.agentId?.agentName       || '',
        invoiceDate:    fmtD(r.invoiceDate),
        dueDate:        fmtD(r.dueDate),
        totalAmount:    r.totalAmount,
        paidAmount:     r.paidAmount,
        balanceAmount:  r.balanceAmount,
        currency:       r.currency,
        status:         r.status,
        notes:          r.notes || '',
        createdAt:      fmtD(r.createdAt),
      }));
    }

    case 'tracking': {
      const TH = require('../tracking/trackingHistory.model');
      const q = { ...idFilter };
      if (filters.voyageId) q.voyageId = filters.voyageId;
      const rows = await TH.find(q)
        .populate('voyageId',   'voyageNumber voyageName')
        .populate('roundId',    'roundNumber roundName')
        .populate('vesselId',   'vesselCode vesselName')
        .populate('serviceId',  'serviceCode')
        .populate('portId',     'name')
        .populate('terminalId', 'name')
        .populate('createdBy',  'name')
        .sort({ lastUpdate: -1 }).lean();
      return rows.map(r => ({
        lastUpdate:   fmtD(r.lastUpdate),
        voyageNumber: r.voyageId?.voyageNumber   || '',
        voyageName:   r.voyageId?.voyageName     || '',
        roundNumber:  r.roundId?.roundNumber     || '',
        roundName:    r.roundId?.roundName       || '',
        vesselCode:   r.vesselId?.vesselCode     || '',
        vesselName:   r.vesselId?.vesselName     || '',
        serviceCode:  r.serviceId?.serviceCode   || '',
        portName:     r.portId?.name             || '',
        terminalName: r.terminalId?.name         || '',
        status:       r.status,
        remarks:      r.remarks || '',
        createdBy:    r.createdBy?.name          || '',
      }));
    }

    case 'auditLogs': {
      const AuditLog = require('../auditLogs/auditLog.model');
      const q = { ...idFilter };
      if (filters.module) q.module = filters.module;
      if (filters.action) q.action = filters.action;
      const dr = dateRange(filters.dateFrom, filters.dateTo);
      if (dr) q.timestamp = dr;
      const rows = await AuditLog.find(q)
        .sort({ timestamp: -1 })
        .limit(10000) // cap audit log exports
        .lean();
      return rows.map(r => ({
        timestamp:    r.timestamp ? new Date(r.timestamp).toLocaleString('en-GB') : '',
        userEmail:    r.userEmail    || '',
        action:       r.action,
        module:       r.module,
        recordNumber: r.recordNumber || '',
        ipAddress:    r.ipAddress    || '',
      }));
    }

    default:
      throw { status: 400, message: `Export not supported for module: ${moduleName}` };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// Sprint 040 — exportSingle/buildZipStream now accept an optional
// `generatedBy` (the requesting user's display name/email) so it can be
// recorded on the new Export Info metadata sheet. Every other part of the
// existing request/response workflow (module, filters, selectedIds,
// filename convention, response headers) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
const exportSingle = async (moduleName, filters = {}, selectedIds = [], generatedBy = null) => {
  const rows   = await fetchData(moduleName, filters, selectedIds);
  const buffer = await buildExcelBuffer(moduleName, rows, null, { generatedBy, filters });
  const date   = new Date().toISOString().split('T')[0];
  return { buffer, filename: `${moduleName}-export-${date}.xlsx`, count: rows.length };
};

// ─────────────────────────────────────────────────────────────────────────────
// ZIP builder — streams directly to Express response
// Renamed parameter from 'exports' → 'exportList' to avoid shadowing
// Node.js CommonJS 'exports' object (which caused a silent 400 in strict mode)
// ─────────────────────────────────────────────────────────────────────────────
const buildZipStream = (exportList, res, generatedBy = null) => {
  return new Promise(async (resolve, reject) => {
    try {
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);
      archive.pipe(res);
      for (const item of exportList) {
        const { buffer, filename } = await exportSingle(
          item.module, item.filters || {}, item.selectedIds || [], generatedBy
        );
        archive.append(Buffer.from(buffer), { name: filename });
      }
      archive.finalize();
      archive.on('finish', resolve);
    } catch (err) { reject(err); }
  });
};

// Export COLUMNS so controller can check validity
const ALLOWED_MODULES = Object.keys(COLUMNS);

module.exports = { exportSingle, buildZipStream, COLUMNS, ALLOWED_MODULES, MODULE_LABELS };
