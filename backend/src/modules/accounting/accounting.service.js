'use strict';

const Account = require('../ledger/account.model');
const AppError = require('../../utils/AppError');
const pickFields = require('../../utils/pickFields');
const { escapeRegex } = require('../../utils/escapeRegex');
const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');

/** Whole chart (headers included) for the tree view; small (≈200 rows), so no pagination. */
const list = async ({ search = '', type = '', posting = '', active = '' } = {}) => {
  const q = {};
  if (type) q.type = type;
  if (posting === 'true') q.isGroup = { $ne: true };
  if (posting === 'false') q.isGroup = true;
  if (active === 'true') q.isActive = true;
  if (active === 'false') q.isActive = false;
  if (search) {
    const rx = escapeRegex(search);
    q.$or = [{ code: { $regex: rx } }, { name: { $regex: rx, $options: 'i' } }, { nameAr: { $regex: rx } }];
  }
  return Account.find(q).sort({ code: 1 }).lean();
};

const FIELDS = ['name', 'nameAr', 'isActive', 'subledgerType', 'allocationLevel', 'requiredDimensions', 'defaultCurrency', 'normalBalance'];
const HEADER_FIELDS = ['name', 'nameAr', 'isActive', 'normalBalance'];

/** New 6-digit account under an existing header: a posting account (default) or a sub-header (`isGroup: true`). The type is inherited from the parent. */
const create = async (data) => {
  const code = String(data.code || '').trim();
  if (!/^\d{6}$/.test(code)) throw new AppError(400, 'Account code must be 6 digits', 'ACCOUNT_CODE_INVALID');
  if (await Account.exists({ code })) throw new AppError(400, `Account ${code} already exists`, 'DUPLICATE_CODE');
  const parent = await Account.findById(data.parentId).lean();
  if (!parent || !parent.isGroup) throw new AppError(400, 'Parent must be an existing header (group) account', 'PARENT_NOT_GROUP');
  const prefix = String(parent.code).replace(/0+$/, '');
  if (!code.startsWith(prefix)) throw new AppError(400, `Code must start with the parent prefix ${prefix}`, 'CODE_PARENT_MISMATCH');
  const isGroup = data.isGroup === true || data.isGroup === 'true';
  const doc = await Account.create({
    ...pickFields(Account, data, ['code', 'type', 'isSystem', 'isGroup', 'isPosting', 'isSystemLocked', 'parentId', 'level']),
    code, type: parent.type, parentId: parent._id, level: Math.min((parent.level || 3) + 1, 4), isGroup, isPosting: !isGroup, isSystem: false, isSystemLocked: false,
    normalBalance: data.normalBalance || parent.normalBalance || null,
  });
  return doc.toObject();
};

const prefixOf = (code) => String(code).replace(/0+$/, '');

/** All descendant ids of an account (iterative, the chart is ~200 rows). */
const descendantIds = async (id) => {
  const all = await Account.find({}, { parentId: 1 }).lean();
  const kids = new Map();
  for (const a of all) if (a.parentId) { const k = String(a.parentId); (kids.get(k) || kids.set(k, []).get(k)).push(String(a._id)); }
  const out = []; const stack = [String(id)];
  while (stack.length) for (const c of kids.get(stack.pop()) || []) { out.push(c); stack.push(c); }
  return out;
};

/**
 * Edit any master-chart account, headers included. Only the 4-digit ledger accounts (`isSystem`) are frozen: the ledger posts to them.
 * Besides the descriptive fields, the code and the parent header can be changed (move under another header); the type follows the new
 * parent and is applied to every descendant. A posting account's extra fields (sub-ledger, allocation…) are not offered on headers.
 */
const update = async (id, data) => {
  const acc = await Account.findById(id);
  if (!acc) throw new AppError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
  if (acc.isSystem) throw new AppError(409, 'This is a ledger posting account and cannot be edited here', 'ACCOUNT_LOCKED');
  const allowed = acc.isGroup ? HEADER_FIELDS : FIELDS;
  Object.assign(acc, pickFields(Account, Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))));

  const newCode = data.code !== undefined ? String(data.code).trim() : acc.code;
  const newParentId = data.parentId !== undefined ? (data.parentId || null) : (acc.parentId ? String(acc.parentId) : null);
  const codeChanged = newCode !== acc.code;
  const parentChanged = String(newParentId || '') !== String(acc.parentId || '');
  let retype = null;
  if (codeChanged || parentChanged) {
    if (!/^[0-9]{6}$/.test(newCode)) throw new AppError(400, 'Account code must be 6 digits', 'ACCOUNT_CODE_INVALID');
    if (codeChanged && await Account.exists({ code: newCode, _id: { $ne: acc._id } })) throw new AppError(400, `Account ${newCode} already exists`, 'DUPLICATE_CODE');
    if (newParentId) {
      if (String(newParentId) === String(acc._id)) throw new AppError(400, 'An account cannot be its own parent', 'PARENT_CYCLE');
      const parent = await Account.findById(newParentId).lean();
      if (!parent || !parent.isGroup) throw new AppError(400, 'Parent must be an existing header (group) account', 'PARENT_NOT_GROUP');
      if ((await descendantIds(acc._id)).includes(String(parent._id))) throw new AppError(400, 'Cannot move an account under its own descendant', 'PARENT_CYCLE');
      if (!newCode.startsWith(prefixOf(parent.code))) throw new AppError(400, `Code must start with the parent prefix ${prefixOf(parent.code)}`, 'CODE_PARENT_MISMATCH');
      acc.parentId = parent._id;
      acc.level = Math.min((parent.level || 3) + 1, 4);
      if (parent.type !== acc.type) { acc.type = parent.type; retype = parent.type; }
    } else if (!acc.isGroup) {
      throw new AppError(400, 'A posting account needs a parent header', 'PARENT_REQUIRED');
    } else {
      acc.parentId = null; acc.level = 1;
    }
    acc.code = newCode;
  }
  await acc.save();
  if (retype) await Account.updateMany({ _id: { $in: await descendantIds(acc._id) } }, { $set: { type: retype } });
  return acc.toObject();
};

/** Hard delete, refused while anything depends on the account (children, ledger lines, master-data mappings). */
const remove = async (id) => {
  const acc = await Account.findById(id);
  if (!acc) throw new AppError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
  if (acc.isSystem) throw new AppError(409, 'This is a ledger posting account and cannot be deleted', 'ACCOUNT_LOCKED');
  await assertNoDependents('account', acc._id, DEPENDENTS.account);
  await acc.deleteOne();
  return { _id: acc._id };
};

module.exports = { list, create, update, remove };
