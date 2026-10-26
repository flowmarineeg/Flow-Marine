'use strict';

const pickFields = require('../../utils/pickFields');
const ExpenseType     = require('./expenseType.model');
const ExpenseCategory = require('./expenseCategory.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const AppError = require('../../utils/AppError');
const { assertAccountFor } = require('../ledger/accountRules');
const { missingMappings } = require('./expenseType.logic');

/** Required mappings + account-group checks on the merged type record. */
const assertMappings = async (merged, changed) => {
  const missing = missingMappings(merged);
  if (missing.length) throw new AppError(400, `Required expense type fields missing: ${missing.join(', ')}`, 'EXPENSE_TYPE_INCOMPLETE');
  if (changed.expenseAccountId) await assertAccountFor(merged.expenseAccountId, 'expense', 'Expense account');
  if (merged.requiresPda && changed.accrualAccountId) await assertAccountFor(merged.accrualAccountId, 'accrual', 'Accrual account');
};
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Auto-upsert category into the categories collection ─────────────────────
const syncCategory = async (name, userId) => {
  const trimmed = name.trim();
  if (!trimmed) return;
  await ExpenseCategory.findOneAndUpdate(
    { name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
    { $setOnInsert: { name: trimmed, createdBy: userId } },
    { upsert: true, new: true }
  );
};

// ─── List expense types ───────────────────────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', category = '' } = {}) => {
  const query = {};
  if (category) query.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };
  if (search) query.name = { $regex: escapeRegex(search), $options: 'i' };
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    ExpenseType.find(query).sort({ category: 1, name: 1 }).skip(skip).limit(Number(limit)).lean(),
    ExpenseType.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const et = await ExpenseType.findOne({ _id: id }).lean();
  if (!et) throw { status: 404, message: 'Expense type not found' };
  return et;
};

// ─── Get all distinct categories (from dedicated collection + expense types) ──
const getCategories = async () => {
  // Primary source: dedicated category collection
  const cats = await ExpenseCategory.find({}).sort({ name: 1 }).lean();
  return cats.map(c => ({ _id: c._id, name: c.name, costClassification: c.costClassification }));
};

// ─── Sprint 035: category name -> costClassification lookup, for reports ─────
// Case-insensitive on the name, since ExpenseType.category is a free-string
// field matched against this collection's `name` elsewhere in this file too.
// Returns a plain object so callers (e.g. reports.service.js) never touch
// ExpenseCategory directly — the classification is ALWAYS read through this
// helper, never hardcoded against a literal category name.
const getCostClassificationMap = async () => {
  const cats = await ExpenseCategory.find({}).select('name costClassification').lean();
  const map = {};
  cats.forEach(c => { map[c.name.trim().toUpperCase()] = c.costClassification || 'Other Voyage Cost'; });
  return map;
};

// ─── Create a standalone category ────────────────────────────────────────────
const createCategory = async (name, costClassification, userId) => {
  const trimmed = name?.trim();
  if (!trimmed) throw { status: 400, message: 'Category name is required' };
  if (trimmed.length > 50) throw { status: 400, message: 'Category name must be 50 characters or less' };

  const exists = await ExpenseCategory.findOne({ name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } });
  if (exists) throw { status: 400, message: `Category "${trimmed}" already exists` };

  const cat = await ExpenseCategory.create({
    name: trimmed,
    costClassification: costClassification || 'Other Voyage Cost',
    createdBy: userId,
  });
  return cat.toObject();
};

// ─── Sprint 035: update a category's cost classification (name is NOT
// renameable — same deliberate limitation as before this sprint) ────────────
const updateCategoryClassification = async (id, costClassification) => {
  const { EXPENSE_COST_CLASSIFICATIONS } = require('../../config/constants');
  if (!EXPENSE_COST_CLASSIFICATIONS.includes(costClassification)) {
    throw { status: 400, message: `costClassification must be one of: ${EXPENSE_COST_CLASSIFICATIONS.join(', ')}` };
  }
  const cat = await ExpenseCategory.findById(id);
  if (!cat) throw { status: 404, message: 'Category not found' };
  cat.costClassification = costClassification;
  await cat.save();
  return cat.toObject();
};

// ─── Delete a standalone category ────────────────────────────────────────────
const deleteCategory = async (id) => {
  const cat = await ExpenseCategory.findById(id);
  if (!cat) throw { status: 404, message: 'Category not found' };

  // Block if any expense type uses this category
  const inUse = await ExpenseType.findOne({ category: { $regex: `^${escapeRegex(cat.name)}$`, $options: 'i' } });
  if (inUse) throw { status: 400, message: `Cannot delete — category is used by expense type "${inUse.name}"` };

  await ExpenseCategory.findByIdAndDelete(id);
};

// ─── Create expense type ──────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const exists = await ExpenseType.findOne({ name: { $regex: `^${escapeRegex(data.name)}$`, $options: 'i' } });
  if (exists) throw { status: 400, message: `Expense type "${data.name}" already exists` };

  const trimmedCategory = data.category.trim();

  // Auto-sync category to category collection
  await syncCategory(trimmedCategory, createdBy);

  const fields = { ...pickFields(ExpenseType, data), category: trimmedCategory };
  if (!fields.requiresPda) fields.accrualAccountId = null; // an accrual account only means something with the PDA workflow
  await assertMappings({ operationalLevel: 'VOYAGE_LEVEL', ...fields }, { expenseAccountId: true, accrualAccountId: true });
  const et = await ExpenseType.create({ ...fields, createdBy });
  return et.toObject();
};

// ─── Update expense type ──────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const et = await ExpenseType.findOne({ _id: id });
  if (!et) throw { status: 404, message: 'Expense type not found' };

  if (data.name && data.name.toLowerCase() !== et.name.toLowerCase()) {
    const exists = await ExpenseType.findOne({ name: { $regex: `^${escapeRegex(data.name)}$`, $options: 'i' }, _id: { $ne: id } });
    if (exists) throw { status: 400, message: `Expense type "${data.name}" already exists` };
  }

  if (data.category) {
    data.category = data.category.trim();
    await syncCategory(data.category, updatedBy);
  }

  const fields = pickFields(ExpenseType, data);
  const merged = { ...et.toObject(), ...fields };
  if (!merged.requiresPda) { merged.accrualAccountId = null; fields.accrualAccountId = null; }
  await assertMappings(merged, { expenseAccountId: 'expenseAccountId' in fields, accrualAccountId: 'accrualAccountId' in fields && !!fields.accrualAccountId });
  Object.assign(et, { ...fields, updatedBy });
  await et.save();
  return et.toObject();
};

// ─── Hard delete expense type ──────────────────────────────────────────────────
const hardDelete = async (id) => {
  const et = await ExpenseType.findOne({ _id: id });
  if (!et) throw { status: 404, message: 'Expense type not found' };

  const Expense = require('../expenses/expense.model');
  const inUse = await Expense.findOne({ expenseTypeId: id });
  if (inUse) throw { status: 400, message: 'Cannot delete — expense type is used in existing expenses' };

  await ExpenseType.findByIdAndDelete(id);
};

// ─── Get all for export ───────────────────────────────────────────────────────
const getAll = async (filters = {}, selectedIds = []) => {
  const query = {};
  if (filters.category) query.category = { $regex: `^${escapeRegex(filters.category)}$`, $options: 'i' };
  if (filters.search) query.name = { $regex: escapeRegex(filters.search), $options: 'i' };
  if (selectedIds?.length > 0) query._id = { $in: selectedIds };
  return ExpenseType.find(query).sort({ category: 1, name: 1 }).lean();
};

module.exports = {
  list, getById,
  getCategories, createCategory, updateCategoryClassification, deleteCategory,
  getCostClassificationMap,
  create, update, hardDelete, getAll,
};
