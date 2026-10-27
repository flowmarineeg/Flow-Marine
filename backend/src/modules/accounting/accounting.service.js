'use strict';

const Account = require('../ledger/account.model');
const AppError = require('../../utils/AppError');
const pickFields = require('../../utils/pickFields');
const { escapeRegex } = require('../../utils/escapeRegex');

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

/** New posting accounts only: 6-digit code under an existing header; the type is inherited from the header. */
const create = async (data) => {
  const code = String(data.code || '').trim();
  if (!/^\d{6}$/.test(code)) throw new AppError(400, 'Account code must be 6 digits', 'ACCOUNT_CODE_INVALID');
  if (await Account.exists({ code })) throw new AppError(400, `Account ${code} already exists`, 'DUPLICATE_CODE');
  const parent = await Account.findById(data.parentId).lean();
  if (!parent || !parent.isGroup) throw new AppError(400, 'Parent must be an existing header (group) account', 'PARENT_NOT_GROUP');
  if (!code.startsWith(String(parent.code).replace(/0+$/, ''))) throw new AppError(400, `Code must start with the parent prefix ${String(parent.code).replace(/0+$/, '')}`, 'CODE_PARENT_MISMATCH');
  const doc = await Account.create({
    ...pickFields(Account, data, ['code', 'type', 'isSystem', 'isGroup', 'isPosting', 'isSystemLocked', 'parentId', 'level']),
    code, type: parent.type, parentId: parent._id, level: (parent.level || 3) + 1, isGroup: false, isPosting: true, isSystem: false, isSystemLocked: false,
    normalBalance: data.normalBalance || parent.normalBalance || null,
  });
  return doc.toObject();
};

const update = async (id, data) => {
  const acc = await Account.findById(id);
  if (!acc) throw new AppError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
  if (acc.isSystemLocked || acc.isSystem) throw new AppError(409, 'This account is system-locked and cannot be edited', 'ACCOUNT_LOCKED');
  if (acc.isGroup) throw new AppError(409, 'Header accounts cannot be edited', 'ACCOUNT_LOCKED');
  Object.assign(acc, pickFields(Account, Object.fromEntries(Object.entries(data).filter(([k]) => FIELDS.includes(k)))));
  await acc.save();
  return acc.toObject();
};

module.exports = { list, create, update };
