'use strict';

const fs      = require('fs');
const path    = require('path');
const Expense = require('./expense.model');
const Voyage  = require('../voyages/voyage.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/expenses');

// Sprint 036 — scope is ALWAYS inferred from roundId/voyageId/portId,
// never stored (see expense.model.js comment). This is the single place
// that inference happens; reused by every response and by reports.
const deriveScope = ({ roundId, voyageId, portId }) => {
  if (portId)  return 'Port';
  if (voyageId) return 'Voyage';
  if (roundId)  return 'Round';
  return null;
};
const withScope = (expense) => expense ? { ...expense, scope: deriveScope(expense) } : expense;

const deleteFile = (url) => {
  if (!url) return;
  const filename = path.basename(url);
  const filepath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filepath)) {
    try { fs.unlinkSync(filepath); } catch (_) { /* best-effort */ }
  }
};

// ─── Populate helper ──────────────────────────────────────────────────────────
const pop = (q) =>
  q.populate('expenseTypeId', 'name category')
   .populate('agentId',       'agentCode agentName')
   .populate('roundId',       'roundNumber roundName')
   // roundId included here (Sprint 036) so ExpenseForm.jsx can preselect
   // the Round → Voyage cascade on edit, same pattern as BookingForm.jsx.
   .populate('voyageId',      'voyageNumber voyageName roundId')
   .populate('portId',        'name code');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  roundId = '', voyageId = '', portId = '', expenseTypeId = '',
  currency = '', dateFrom = '', dateTo = '',
} = {}) => {
  const query = {};
  if (roundId)       query.roundId       = roundId;
  if (voyageId)      query.voyageId      = voyageId;
  if (portId)        query.portId        = portId;
  if (expenseTypeId) query.expenseTypeId = expenseTypeId;
  if (currency)      query.currency      = currency.toUpperCase();
  if (dateFrom || dateTo) {
    query.expenseDate = {};
    if (dateFrom) query.expenseDate.$gte = new Date(dateFrom);
    if (dateTo)   query.expenseDate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    pop(Expense.find(query)).sort({ expenseDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    Expense.countDocuments(query),
  ]);
  return { data: data.map(withScope), total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const expense = await pop(Expense.findById(id)).lean();
  if (!expense) throw { status: 404, message: 'Expense not found' };
  return withScope(expense);
};

// ─── Sprint020: Get attachment path (authenticated download) ──────────────────
/**
 * Returns the absolute filesystem path to the expense attachment.
 * Throws 404 if expense has no attachment or file is missing from disk.
 */
const getAttachmentPath = async (id) => {
  const expense = await Expense.findById(id).lean();
  if (!expense)                throw { status: 404, message: 'Expense not found' };
  if (!expense.attachmentUrl)  throw { status: 404, message: 'This expense has no attachment' };

  const filename = path.basename(expense.attachmentUrl);
  const absPath  = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(absPath)) {
    throw { status: 404, message: 'Attachment file not found on server' };
  }

  return {
    absPath,
    originalName: expense.attachmentOriginalName || filename,
    mimetype:     filename.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
                : filename.match(/\.png$/i)        ? 'image/png'
                : 'application/pdf',
  };
};

// Sprint 036 — three-way scope resolution, driven entirely by which of
// roundId/voyageId/portId are present (never a client-sent scope value —
// ADR-2). Validates the exclusivity rule and, for Port scope, that the
// port actually belongs to the given voyage (current schema limitation:
// a voyage's only valid ports are its own polId/podId — see
// sprints/036-sprint.txt Business Validation section 6).
const resolveScopeIds = async ({ roundId, voyageId, portId }) => {
  const hasRound  = !!roundId  && roundId  !== '';
  const hasVoyage = !!voyageId && voyageId !== '';
  const hasPort   = !!portId   && portId   !== '';

  if (hasPort && !hasVoyage) throw { status: 400, message: 'A Port expense must also specify its Voyage' };
  if (hasRound && (hasVoyage || hasPort)) throw { status: 400, message: 'Expense cannot be linked to both a Round and a Voyage/Port' };
  if (!hasRound && !hasVoyage) throw { status: 400, message: 'Expense must be linked to a Round, a Voyage, or a Port' };

  if (hasPort) {
    const voyage = await Voyage.findById(voyageId).lean();
    if (!voyage) throw { status: 404, message: 'Voyage not found' };
    const validPortIds = [String(voyage.polId), String(voyage.podId)];
    if (!validPortIds.includes(String(portId))) {
      throw { status: 400, message: "portId must be this voyage's POL or POD" };
    }
  }

  return {
    roundId:  hasRound  ? roundId  : null,
    voyageId: hasVoyage ? voyageId : null,
    portId:   hasPort   ? portId   : null,
  };
};

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, file, createdBy) => {
  const scopeIds = await resolveScopeIds(data);

  const payload = {
    expenseTypeId: data.expenseTypeId,
    agentId:       data.agentId   || null,
    ...scopeIds,
    port:          data.port        || null,
    amount:        Number(data.amount),
    currency:      String(data.currency).toUpperCase(),
    expenseDate:   new Date(data.expenseDate),
    description:   data.description || null,
    createdBy,
    updatedBy: createdBy,
  };

  if (file) {
    payload.attachmentUrl          = `/uploads/expenses/${file.filename}`;
    payload.attachmentOriginalName = file.originalname;
  }

  const expense = await Expense.create(payload);
  return getById(expense._id);
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, file, updatedBy) => {
  const expense = await Expense.findById(id);
  if (!expense) throw { status: 404, message: 'Expense not found' };

  const scopeIds = await resolveScopeIds({
    roundId:  data.roundId  !== undefined ? data.roundId  : expense.roundId,
    voyageId: data.voyageId !== undefined ? data.voyageId : expense.voyageId,
    portId:   data.portId   !== undefined ? data.portId   : expense.portId,
  });

  if (file) {
    deleteFile(expense.attachmentUrl);
    expense.attachmentUrl          = `/uploads/expenses/${file.filename}`;
    expense.attachmentOriginalName = file.originalname;
  }

  const allowed = ['expenseTypeId', 'agentId', 'port', 'amount', 'currency', 'expenseDate', 'description'];
  allowed.forEach(field => {
    if (data[field] !== undefined) {
      expense[field] = field === 'currency' ? String(data[field]).toUpperCase() : data[field] || null;
    }
  });
  if (data.amount !== undefined) expense.amount = Number(data.amount);
  expense.roundId  = scopeIds.roundId;
  expense.voyageId = scopeIds.voyageId;
  expense.portId   = scopeIds.portId;
  expense.updatedBy = updatedBy;
  await expense.save();
  return getById(expense._id);
};

// ─── Hard Delete ──────────────────────────────────────────────────────────────
const hardDelete = async (id) => {
  const expense = await Expense.findById(id);
  if (!expense) throw { status: 404, message: 'Expense not found' };
  deleteFile(expense.attachmentUrl);
  await Expense.findByIdAndDelete(id);
};

// Sprint 038 — exported so reports.service.js#getExpenseReport can reuse
// the exact same scope inference `expense.service.js` itself uses,
// instead of re-deriving the same rule a second time.
module.exports = { list, getById, getAttachmentPath, create, update, hardDelete, deriveScope };
