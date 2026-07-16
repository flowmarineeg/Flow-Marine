'use strict';

const ExpenseType     = require('./expenseType.model');
const ExpenseCategory = require('./expenseCategory.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Auto-upsert category into the categories collection ─────────────────────
const syncCategory = async (name, userId) => {
  const trimmed = name.trim();
  if (!trimmed) return;
  await ExpenseCategory.findOneAndUpdate(
    { name: { $regex: `^${trimmed}$`, $options: 'i' } },
    { $setOnInsert: { name: trimmed, createdBy: userId } },
    { upsert: true, new: true }
  );
};

// ─── List expense types ───────────────────────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', category = '' } = {}) => {
  const query = { isDeleted: false };
  if (category) query.category = { $regex: `^${category}$`, $options: 'i' };
  if (search) query.name = { $regex: search, $options: 'i' };
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    ExpenseType.find(query).sort({ category: 1, name: 1 }).skip(skip).limit(Number(limit)).lean(),
    ExpenseType.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const et = await ExpenseType.findOne({ _id: id, isDeleted: false }).lean();
  if (!et) throw { status: 404, message: 'Expense type not found' };
  return et;
};

// ─── Get all distinct categories (from dedicated collection + expense types) ──
const getCategories = async () => {
  // Primary source: dedicated category collection
  const cats = await ExpenseCategory.find({}).sort({ name: 1 }).lean();
  return cats.map(c => ({ _id: c._id, name: c.name }));
};

// ─── Create a standalone category ────────────────────────────────────────────
const createCategory = async (name, userId) => {
  const trimmed = name?.trim();
  if (!trimmed) throw { status: 400, message: 'Category name is required' };
  if (trimmed.length > 50) throw { status: 400, message: 'Category name must be 50 characters or less' };

  const exists = await ExpenseCategory.findOne({ name: { $regex: `^${trimmed}$`, $options: 'i' } });
  if (exists) throw { status: 400, message: `Category "${trimmed}" already exists` };

  const cat = await ExpenseCategory.create({ name: trimmed, createdBy: userId });
  return cat.toObject();
};

// ─── Delete a standalone category ────────────────────────────────────────────
const deleteCategory = async (id) => {
  const cat = await ExpenseCategory.findById(id);
  if (!cat) throw { status: 404, message: 'Category not found' };

  // Block if any expense type uses this category
  const inUse = await ExpenseType.findOne({ category: { $regex: `^${cat.name}$`, $options: 'i' }, isDeleted: false });
  if (inUse) throw { status: 400, message: `Cannot delete — category is used by expense type "${inUse.name}"` };

  await ExpenseCategory.findByIdAndDelete(id);
};

// ─── Create expense type ──────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const exists = await ExpenseType.findOne({ name: { $regex: `^${data.name}$`, $options: 'i' } });
  if (exists) throw { status: 400, message: `Expense type "${data.name}" already exists` };

  const trimmedCategory = data.category.trim();

  // Auto-sync category to category collection
  await syncCategory(trimmedCategory, createdBy);

  const et = await ExpenseType.create({ ...data, category: trimmedCategory, createdBy });
  return et.toObject();
};

// ─── Update expense type ──────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const et = await ExpenseType.findOne({ _id: id, isDeleted: false });
  if (!et) throw { status: 404, message: 'Expense type not found' };

  if (data.name && data.name.toLowerCase() !== et.name.toLowerCase()) {
    const exists = await ExpenseType.findOne({ name: { $regex: `^${data.name}$`, $options: 'i' }, _id: { $ne: id } });
    if (exists) throw { status: 400, message: `Expense type "${data.name}" already exists` };
  }

  if (data.category) {
    data.category = data.category.trim();
    await syncCategory(data.category, updatedBy);
  }

  Object.assign(et, { ...data, updatedBy });
  await et.save();
  return et.toObject();
};

// ─── Soft delete expense type ─────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const et = await ExpenseType.findOne({ _id: id, isDeleted: false });
  if (!et) throw { status: 404, message: 'Expense type not found' };

  const Expense = require('../expenses/expense.model');
  const inUse = await Expense.findOne({ expenseTypeId: id });
  if (inUse) throw { status: 400, message: 'Cannot delete — expense type is used in existing expenses' };

  et.isDeleted = true;
  et.deletedAt = new Date();
  et.updatedBy = deletedBy;
  await et.save();
};

// ─── Get all for export ───────────────────────────────────────────────────────
const getAll = async (filters = {}, selectedIds = []) => {
  const query = { isDeleted: false };
  if (filters.category) query.category = { $regex: `^${filters.category}$`, $options: 'i' };
  if (filters.search) query.name = { $regex: filters.search, $options: 'i' };
  if (selectedIds?.length > 0) query._id = { $in: selectedIds };
  return ExpenseType.find(query).sort({ category: 1, name: 1 }).lean();
};

module.exports = {
  list, getById,
  getCategories, createCategory, deleteCategory,
  create, update, softDelete, getAll,
};
