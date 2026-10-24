'use strict';

const mongoose = require('mongoose');
const { MODULES } = require('../../config/constants');

const actionSchema = new mongoose.Schema(
  {
    create: { type: Boolean, default: false },
    read:   { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    import: { type: Boolean, default: false }, // Sprint019: booking bulk import
    export: { type: Boolean, default: false }, // Sprint019: per-module export
    view:   { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    override: { type: Boolean, default: false }, // Sprint046: invoice-only, full manual override
    issue:    { type: Boolean, default: false }, // Sprint051 V2: issue invoices / credit+debit notes
    cancel:   { type: Boolean, default: false }, // Sprint051 V2: cancel an issued invoice
    record:   { type: Boolean, default: false }, // Sprint051 V2: record / void settlements
    close:        { type: Boolean, default: false }, // Sprint053: round.close
    closeOverride:{ type: Boolean, default: false }, // Sprint053: round.close.override (close with open PDAs + reason)
    reopen:       { type: Boolean, default: false }, // Sprint053: round.reopen
    carryForward: { type: Boolean, default: false }, // Sprint053: round.carry_forward
    useReserve:   { type: Boolean, default: false }, // Sprint053: reserve.use
    commission: { type: Boolean, default: false }, // Sprint053 fix H7: cancel / adjust agent commission (commission.manage)
    approve:  { type: Boolean, default: false }, // Sprint052 V2: approve/post an FDA expense (expense.approve_fda)
    offset:   { type: Boolean, default: false }, // Sprint052 V2: netting, pay agent, advances, settlement statements (agent.offset)
    manage:   { type: Boolean, default: false }, // Sprint050 V2: partners/ledger/settings administration
  },
  { _id: false }
);

const permissionSchema = new mongoose.Schema(
  {
    roleId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    module:  { type: String, required: true, enum: MODULES },
    actions: { type: actionSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

permissionSchema.index({ roleId: 1, module: 1 }, { unique: true });

module.exports = mongoose.model('Permission', permissionSchema);
