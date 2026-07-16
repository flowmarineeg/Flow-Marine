'use strict';

const fs      = require('fs');
const path    = require('path');
const Expense = require('./expense.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/expenses');

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
   .populate('roundId',       'roundNumber')
   .populate('voyageId',      'voyageNumber');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  roundId = '', voyageId = '', expenseTypeId = '',
  currency = '', dateFrom = '', dateTo = '',
} = {}) => {
  const query = {};
  if (roundId)       query.roundId       = roundId;
  if (voyageId)      query.voyageId      = voyageId;
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
  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const expense = await pop(Expense.findById(id)).lean();
  if (!expense) throw { status: 404, message: 'Expense not found' };
  return expense;
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

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, file, createdBy) => {
  const hasRound  = !!data.roundId  && data.roundId  !== '';
  const hasVoyage = !!data.voyageId && data.voyageId !== '';

  if (!hasRound && !hasVoyage) throw { status: 400, message: 'Expense must be linked to a Round or a Voyage' };
  if (hasRound && hasVoyage)   throw { status: 400, message: 'Expense cannot be linked to both a Round and a Voyage' };

  const payload = {
    expenseTypeId: data.expenseTypeId,
    agentId:       data.agentId   || null,
    roundId:       hasRound  ? data.roundId  : null,
    voyageId:      hasVoyage ? data.voyageId : null,
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

  const hasRound  = data.roundId  !== undefined ? (!!data.roundId  && data.roundId  !== '') : !!expense.roundId;
  const hasVoyage = data.voyageId !== undefined ? (!!data.voyageId && data.voyageId !== '') : !!expense.voyageId;
  if (!hasRound && !hasVoyage) throw { status: 400, message: 'Expense must be linked to a Round or a Voyage' };
  if (hasRound  && hasVoyage)  throw { status: 400, message: 'Expense cannot be linked to both a Round and a Voyage' };

  if (file) {
    deleteFile(expense.attachmentUrl);
    expense.attachmentUrl          = `/uploads/expenses/${file.filename}`;
    expense.attachmentOriginalName = file.originalname;
  }

  const allowed = ['expenseTypeId', 'agentId', 'roundId', 'voyageId', 'port', 'amount', 'currency', 'expenseDate', 'description'];
  allowed.forEach(field => {
    if (data[field] !== undefined) {
      expense[field] = field === 'currency' ? String(data[field]).toUpperCase() : data[field] || null;
    }
  });
  if (data.amount   !== undefined) expense.amount   = Number(data.amount);
  if (data.roundId  === '')        expense.roundId  = null;
  if (data.voyageId === '')        expense.voyageId = null;
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

module.exports = { list, getById, getAttachmentPath, create, update, hardDelete };
