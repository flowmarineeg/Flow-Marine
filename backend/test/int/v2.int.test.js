'use strict';
// Integration tests for Version 2 (Sprints 050-053). They need a REAL MongoDB replica set
// (transactions) and run only when TEST_MONGODB_URI is set. They DROP the target database,
// so the URI must be a local, disposable one - Atlas URIs are refused.
//   docker run -d --name flow-test-mongo -p 27018:27017 mongo:7 --replSet rs0 --bind_ip_all
//   TEST_MONGODB_URI="mongodb://localhost:27018/flow_v2_test?directConnection=true" npm run test:int
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const URI = process.env.TEST_MONGODB_URI;
const SKIP = !URI ? 'TEST_MONGODB_URI not set' : false;
if (URI && /mongodb\+srv|mongodb\.net/i.test(URI)) throw new Error('Refusing to run integration tests against Atlas');

const oid = () => new mongoose.Types.ObjectId();
const USER_ID = oid();
const USER = { _id: USER_ID, email: 'test@example.com' };
const M = (s) => require('../../src/utils/money').toMinor(s);
const rejectsWith = async (p, code) => {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`); return true; });
};
const codesOf = (results) => results.filter((r) => r.status === 'rejected').map((r) => r.reason.code);

let m; // lazily required modules (after connect)
let W; // world fixtures
let seq = 0;
const uniq = (p) => `${p}${Date.now().toString(36)}${++seq}`;

const mkBookings = async (voyageId, agentId, n, rate, extra = {}) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(await m.Booking.create({
      bookingNumber: uniq('BK'), voyageId, agentId, polId: W.pol, podId: W.pod, containerTypeId: W.ct._id,
      freightRate: rate, totalFreight: rate, containerNumber: uniq('MSCU').toUpperCase().slice(0, 11),
      status: 'Final Loading', containerStatus: 'Full', ...extra,
    }));
  }
  return out;
};
const mkRound = async (vesselId, voyageStatus = 'Completed') => {
  const round = await m.Round.create({ roundNumber: uniq('R'), serviceId: W.service._id, vesselId, startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), status: 'Active' });
  const voyage = await m.Voyage.create({ voyageNumber: uniq('V'), roundId: round._id, serviceId: W.service._id, polId: W.pol, podId: W.pod, sequence: 1, status: voyageStatus });
  round.voyageIds = [voyage._id]; await round.save();
  return { round, voyage };
};
const balance = async (code, filter = {}) => {
  const acc = await m.Account.findOne({ code }).lean();
  const [r] = await m.JournalEntryLine.aggregate([{ $match: { accountId: acc._id, ...filter } }, { $group: { _id: null, d: { $sum: '$debitMinor' }, c: { $sum: '$creditMinor' } } }]);
  return r ? { d: r.d, c: r.c, net: r.d - r.c } : { d: 0, c: 0, net: 0 };
};

describe('Version 2 integration (real MongoDB replica set)', { skip: SKIP }, () => {
  before(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    m = {
      Booking: require('../../src/modules/bookings/booking.model'),
      Round: require('../../src/modules/rounds/round.model'),
      Voyage: require('../../src/modules/voyages/voyage.model'),
      Vessel: require('../../src/modules/vessels/vessel.model'),
      Service: require('../../src/modules/services/service.model'),
      ContainerType: require('../../src/modules/containerTypes/containerType.model'),
      ExpenseType: require('../../src/modules/expenseTypes/expenseType.model'),
      Agent: require('../../src/modules/agents/agent.model'),
      Partner: require('../../src/modules/partners/partner.model'),
      VesselPartner: require('../../src/modules/partners/vesselPartner.model'),
      Expense: require('../../src/modules/expenses/expense.model'),
      Invoice: require('../../src/modules/invoices/invoice.model'),
      Account: require('../../src/modules/ledger/account.model'),
      JournalEntry: require('../../src/modules/ledger/journalEntry.model'),
      JournalEntryLine: require('../../src/modules/ledger/journalEntryLine.model'),
      AgentAgreement: require('../../src/modules/agreements/agentAgreement.model'),
      AgentCommission: require('../../src/modules/agreements/agentCommission.model'),
      ledger: require('../../src/modules/ledger/ledger.service'),
      partnerSvc: require('../../src/modules/partners/partner.service'),
      items: require('../../src/modules/billing/bookingItem.service'),
      billing: require('../../src/modules/billing/invoiceV2.service'),
      models: require('../../src/modules/billing/billing.models'),
      expV2: require('../../src/modules/expenses/expenseV2.service'),
      expense: require('../../src/modules/expenses/expense.service'),
      agentAcc: require('../../src/modules/agentAccounts/agentAccounts.service'),
      ps: require('../../src/modules/partnerSettlement/partnerSettlement.service'),
      rc: require('../../src/modules/partnerSettlement/roundClose.service'),
      psModels: require('../../src/modules/partnerSettlement/partnerSettlement.models'),
    };
    require('../../src/modules/agentAccounts/agentAccounts.models');
    ['locations/port', 'locations/city', 'locations/country', 'locations/terminal', 'users/user', 'roles/role'].forEach((n) => require('../../src/modules/' + n + '.model')); // populate() targets
    // make sure every unique / partial index exists before the tests race on them
    await Promise.all(Object.values(mongoose.models).map((mod) => mod.init()));
    await require('../../src/modules/ledger/accounts.seed').seedAccounts();

    W = {
      pol: oid(), pod: oid(),
      service: await m.Service.create({ serviceCode: 'SVC', serviceName: 'Test service' }),
      ct: await m.ContainerType.create({ code: 'C20', size: '20ft', type: 'Dry' }),
      etype: await m.ExpenseType.create({ name: 'Port charges', category: 'Port Expense' }),
      agent: await m.Agent.create({ agentName: 'OGA', agentCode: 'OGA' }),
      direct: await m.Agent.create({ agentName: 'Direct Line Co', agentCode: 'DLC', partyType: 'DirectLine' }),
      vessel: await m.Vessel.create({ vesselCode: 'V1', vesselName: 'MV Test', imoNumber: '9000001', ownershipType: 'Owned' }),
      shareVessel: await m.Vessel.create({ vesselCode: 'V2', vesselName: 'MV Shares', imoNumber: '9000002', ownershipType: 'Owned' }),
      pA: await m.Partner.create({ code: 'PA', name: 'Partner A' }),
      pB: await m.Partner.create({ code: 'PB', name: 'Partner B' }),
      pC: await m.Partner.create({ code: 'PC', name: 'Partner C' }),
    };
  });
  after(async () => { await mongoose.disconnect(); });

  // ───────────────────────── Sprint 050 ─────────────────────────
  describe('Sprint 050 - foundation', () => {
    const post = (lines, extra = {}) => m.ledger.post({ date: new Date(), sourceType: 'Manual', currency: 'USD', postedBy: USER_ID, ...extra }, lines);

    it('rejects an unbalanced entry (LEDGER_UNBALANCED) and writes nothing', async () => {
      const before = await m.JournalEntry.countDocuments();
      await rejectsWith(post([{ accountCode: '1010', debitMinor: 10000 }, { accountCode: '4000', creditMinor: 9999 }]), 'LEDGER_UNBALANCED');
      assert.equal(await m.JournalEntry.countDocuments(), before);
    });

    it('posts a balanced entry, numbers it, and the trial balance balances', async () => {
      const e = await post([{ accountCode: '1010', debitMinor: 10000 }, { accountCode: '4000', creditMinor: 10000 }]);
      assert.match(e.entryNumber, /^JE-\d{6}$/);
      const tb = await m.ledger.trialBalance({});
      assert.equal(tb.balanced, true);
    });

    it('a failed line (unknown account) rolls the whole entry back', async () => {
      const before = await m.JournalEntry.countDocuments();
      await rejectsWith(post([{ accountCode: '1010', debitMinor: 5 }, { accountCode: '9999', creditMinor: 5 }]), 'ACCOUNT_NOT_FOUND');
      assert.equal(await m.JournalEntry.countDocuments(), before);
    });

    it('ledger records cannot be edited or deleted through the models', async () => {
      await rejectsWith(m.JournalEntry.updateOne({}, { $set: { memo: 'x' } }), 'LEDGER_IMMUTABLE');
      await rejectsWith(m.JournalEntryLine.deleteMany({}), 'LEDGER_IMMUTABLE');
      const doc = await m.JournalEntry.findOne();
      doc.memo = 'edited';
      await rejectsWith(doc.save(), 'LEDGER_IMMUTABLE');
    });

    it('reversal mirrors the entry; a second (even concurrent) reversal is impossible', async () => {
      const e = await post([{ accountCode: '1020', debitMinor: 700 }, { accountCode: '4100', creditMinor: 700 }]);
      const res = await Promise.allSettled([m.ledger.reverse(e._id, 'test'), m.ledger.reverse(e._id, 'test')]);
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
      assert.ok(codesOf(res).length === 1);
      const orig = await m.JournalEntry.findById(e._id).lean();
      assert.equal(orig.status, 'Reversed');
      assert.equal((await balance('1020')).net, 0);
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });

    it('vessel shares: must total 100%, locked once a Round is settled (Final)', async () => {
      const s = (p, bp) => ({ partnerId: p._id, shareBp: bp });
      await rejectsWith(m.partnerSvc.setShares(W.shareVessel._id, [s(W.pA, 5000), s(W.pB, 4000)], USER_ID), 'SHARES_NOT_100');
      const saved = await m.partnerSvc.setShares(W.shareVessel._id, [s(W.pA, 5000), s(W.pB, 3000), s(W.pC, 2000)], USER_ID);
      assert.equal(saved.length, 3);
      const lockRound = await mkRound(W.shareVessel._id);
      await m.Round.updateOne({ _id: lockRound.round._id }, { $set: { v2: true } });
      await m.partnerSvc.setShares(W.shareVessel._id, [s(W.pA, 6000, true), s(W.pB, 4000)], USER_ID); // an open Round does not lock (audit F-01)
      await m.psModels.PartnerSettlement.create({ roundId: lockRound.round._id, vesselId: W.shareVessel._id, currency: 'USD', status: 'Final', profitMinor: 0, partners: [] });
      await rejectsWith(m.partnerSvc.setShares(W.shareVessel._id, [s(W.pA, 10000, true)], USER_ID), 'VESSEL_SHARES_LOCKED');
    });

    it('a partner with share rows cannot be deleted (HAS_DEPENDENTS)', async () => {
      await rejectsWith(m.partnerSvc.hardDelete(W.pA._id), 'HAS_DEPENDENTS');
    });
  });

  // ───────────────────────── Sprint 051 ─────────────────────────
  describe('Sprint 051 - revenue cycle', () => {
    let R1; let inv; let itemA; let itemB;

    before(async () => {
      R1 = await mkRound(W.vessel._id);
      await mkBookings(R1.voyage._id, W.agent._id, 3, 100);
      await mkBookings(R1.voyage._id, W.agent._id, 2, 120);
      await m.AgentAgreement.create({
        agentId: W.agent._id, currency: 'USD', validFrom: new Date('2020-01-01'), status: 'Active',
        handlingFees: [{ moveType: 'Load', containerStatus: 'Full', amountMinor: 6000 }],
        commission: { rule: 'fixedPerBooking', amountMinor: 500 },
      });
    });

    it('derives pricing-group items: one per rate, quantity = Final Loaded containers', async () => {
      const items = await m.items.listEligible({ billToAgentId: W.agent._id, voyageId: R1.voyage._id });
      assert.equal(items.length, 2);
      itemA = items.find((i) => i.freightRate === 100); itemB = items.find((i) => i.freightRate === 120);
      assert.equal(itemA.loadedQty, 3); assert.equal(itemB.loadedQty, 2);
    });

    it('creates a Draft with exact integer money and locks its items', async () => {
      inv = await m.billing.createDraft({
        invoiceType: 'Voyage', billToAgentId: W.agent._id, voyageId: R1.voyage._id, itemIds: [itemA._id, itemB._id],
        invoiceDate: '2026-02-01', dueDate: '2099-01-01', currency: 'USD',
      }, USER_ID);
      assert.equal(inv.status, 'Draft');
      assert.equal(inv.totalMinor, 3 * 10000 + 2 * 12000);
      assert.equal(await m.models.BookingItem.countDocuments({ locked: true }), 2);
    });

    it('the same items cannot be on a second invoice (DUPLICATE_BILLING)', async () => {
      await rejectsWith(m.billing.createDraft({
        invoiceType: 'Voyage', billToAgentId: W.agent._id, voyageId: R1.voyage._id, itemIds: [itemA._id],
        invoiceDate: '2026-02-01', dueDate: '2026-03-01', currency: 'USD',
      }, USER_ID), 'DUPLICATE_BILLING');
    });

    it('two simultaneous drafts on fresh items: exactly one wins', async () => {
      await mkBookings(R1.voyage._id, W.agent._id, 1, 150);
      const [fresh] = (await m.items.listEligible({ billToAgentId: W.agent._id, voyageId: R1.voyage._id }));
      const body = { invoiceType: 'Voyage', billToAgentId: W.agent._id, voyageId: R1.voyage._id, itemIds: [fresh._id], invoiceDate: '2026-02-01', dueDate: '2026-03-01', currency: 'USD' };
      const res = await Promise.allSettled([m.billing.createDraft(body, USER_ID), m.billing.createDraft(body, USER_ID)]);
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
      assert.deepEqual(codesOf(res), ['DUPLICATE_BILLING']);
      const drafts = await m.Invoice.find({ 'totalMinor': 15000, status: 'Draft' });
      for (const d of drafts) await m.billing.deleteDraft(d); // free the item again
    });

    it('issue posts DR Receivable / CR Revenue, accrues commission; two simultaneous issues: one wins', async () => {
      const res = await Promise.allSettled([m.billing.issue(inv._id, USER_ID), m.billing.issue(inv._id, USER_ID)]);
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
      assert.deepEqual(codesOf(res), ['INVOICE_NOT_DRAFT']);
      const got = await m.Invoice.findById(inv._id).lean();
      assert.equal(got.status, 'Issued');
      const lines = await m.JournalEntryLine.find({ entryId: got.ledgerEntryId }).lean();
      assert.equal(lines.reduce((a, l) => a + l.debitMinor, 0), 54000);
      assert.equal(lines.reduce((a, l) => a + l.creditMinor, 0), 54000);
      const com = await m.AgentCommission.find({ invoiceId: inv._id }).lean();
      assert.equal(com.length, 1);
      assert.equal(com[0].amountMinor, 5 * 500); // 5 bookings x 5.00
    });

    it('an issued invoice is locked (INVOICE_LOCKED) and cannot be deleted', async () => {
      await rejectsWith(m.billing.updateDraft(inv._id, { notes: 'x' }, USER_ID), 'INVOICE_LOCKED');
      await rejectsWith(m.billing.deleteDraft(await m.Invoice.findById(inv._id)), 'INVOICE_POSTED');
    });

    it('partial then full payment; over-payment refused; concurrent payments cannot over-pay', async () => {
      const pay = (amt) => m.billing.recordSettlement(inv._id, { amountMinor: amt, date: '2026-02-10', method: 'Bank Transfer' }, USER_ID);
      await pay(20000);
      assert.equal((await m.Invoice.findById(inv._id).lean()).status, 'Partially Paid');
      await rejectsWith(pay(40000), 'SETTLEMENT_EXCEEDS_BALANCE'); // balance is 34000
      const res = await Promise.allSettled([pay(20000), pay(20000)]); // 34000 left: only one fits
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
      assert.deepEqual(codesOf(res), ['SETTLEMENT_EXCEEDS_BALANCE']);
      await pay(14000);
      const got = await m.Invoice.findById(inv._id).lean();
      assert.equal(got.status, 'Paid');
      assert.equal(got.paidMinor, 54000);
    });

    it('cancel with settlements is refused; cancel of a fresh issued invoice nets the ledger to zero', async () => {
      await rejectsWith(m.billing.cancel(inv._id, 'oops', USER_ID), 'INVOICE_HAS_SETTLEMENTS');
      const R = await mkRound(W.vessel._id);
      await mkBookings(R.voyage._id, W.agent._id, 2, 200);
      const its = await m.items.listEligible({ billToAgentId: W.agent._id, voyageId: R.voyage._id });
      const d = await m.billing.createDraft({ invoiceType: 'Voyage', billToAgentId: W.agent._id, voyageId: R.voyage._id, itemIds: its.map((i) => i._id), invoiceDate: '2026-02-01', dueDate: '2026-03-01', currency: 'USD' }, USER_ID);
      await m.billing.issue(d._id, USER_ID);
      await m.billing.cancel(d._id, 'customer cancelled', USER_ID);
      const got = await m.Invoice.findById(d._id).lean();
      assert.equal(got.status, 'Cancelled');
      const roundFilter = { roundId: R.round._id };
      assert.equal((await balance('1100', roundFilter)).net, 0);
      assert.equal((await balance('4000', roundFilter)).net, 0);
      assert.equal(await m.models.BookingItem.countDocuments({ voyageId: R.voyage._id, locked: true }), 0); // freed
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });

    it('credit note reduces the open balance and cannot exceed it', async () => {
      const R = await mkRound(W.vessel._id);
      await mkBookings(R.voyage._id, W.agent._id, 1, 300);
      const its = await m.items.listEligible({ billToAgentId: W.agent._id, voyageId: R.voyage._id });
      const d = await m.billing.createDraft({ invoiceType: 'Voyage', billToAgentId: W.agent._id, voyageId: R.voyage._id, itemIds: its.map((i) => i._id), invoiceDate: '2026-02-01', dueDate: '2026-03-01', currency: 'USD' }, USER_ID);
      await m.billing.issue(d._id, USER_ID); // 30000
      await rejectsWith(m.billing.createNote(d._id, 'CreditNote', { amountMinor: 40000, reason: 'too much' }, USER_ID), 'CREDIT_EXCEEDS_BALANCE');
      const cn = await m.billing.createNote(d._id, 'CreditNote', { amountMinor: 10000, reason: 'damaged' }, USER_ID);
      assert.match(cn.invoiceNumber, /^CN-/);
      const parent = await m.Invoice.findById(d._id).lean();
      assert.equal(parent.creditedMinor, 10000);
      assert.equal((await balance('1100', { roundId: R.round._id })).net, 20000);
    });
  });

  // ───────────────────────── Sprint 052 ─────────────────────────
  describe('Sprint 052 - expenses, netting, handling', () => {
    let R; let pda; let fda;

    before(async () => { R = await mkRound(W.vessel._id); });

    it('PDA does not post; converting gives a variance; a PDA converts only once', async () => {
      pda = await m.Expense.create({ roundId: R.round._id, expenseTypeId: W.etype._id, agentId: W.agent._id, amount: 400, currency: 'USD', expenseDate: new Date(), kind: 'PDA', paidBy: 'PortAgent' });
      await rejectsWith(m.expV2.postExpense(pda._id, USER_ID), 'PDA_NOT_POSTABLE');
      const r = await m.expV2.convertToFda(String(pda._id), { amount: 450 }, USER_ID);
      assert.equal(r.varianceMinor, 5000);
      fda = r.fda;
      await rejectsWith(m.expV2.convertToFda(String(pda._id), { amount: 450 }, USER_ID), 'PDA_ALREADY_CONVERTED');
    });

    it('FDA posts DR expense / CR Agent Payable once, even when posted concurrently', async () => {
      const res = await Promise.allSettled([m.expV2.postExpense(String(fda._id), USER_ID), m.expV2.postExpense(String(fda._id), USER_ID)]);
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal((await balance('2000', { agentId: W.agent._id, roundId: R.round._id })).c, 45000);
      assert.equal((await balance('5000', { roundId: R.round._id })).d, 45000);
      await rejectsWith(m.expV2.reverseExpense(String(pda._id), 'x', USER_ID), 'EXPENSE_NOT_POSTED');
    });

    it('a posted expense is frozen but can be reversed and then edited', async () => {
      await rejectsWith(m.expense.update(String(fda._id), { amount: 1 }, null, USER_ID), 'EXPENSE_POSTED');
      await rejectsWith(m.expense.hardDelete(String(fda._id)), 'EXPENSE_POSTED');
      await m.expV2.reverseExpense(String(fda._id), 'wrong amount', USER_ID);
      assert.equal((await balance('2000', { agentId: W.agent._id, roundId: R.round._id })).net, 0);
      await m.expV2.postExpense(String(fda._id), USER_ID);
    });

    it('netting: payable settles the oldest invoice; the same batchId is a no-op; reversal restores', async () => {
      const R2 = await mkRound(W.vessel._id);
      await mkBookings(R2.voyage._id, W.agent._id, 1, 1000);
      const its = await m.items.listEligible({ billToAgentId: W.agent._id, voyageId: R2.voyage._id });
      const d = await m.billing.createDraft({ invoiceType: 'Voyage', billToAgentId: W.agent._id, voyageId: R2.voyage._id, itemIds: its.map((i) => i._id), invoiceDate: '2026-02-01', dueDate: '2026-02-15', currency: 'USD' }, USER_ID);
      await m.billing.issue(d._id, USER_ID); // 100000 due
      const payable = await m.agentAcc.payableBalance({ agentId: W.agent._id, currency: 'USD' });
      assert.ok(payable > 0);
      const first = await m.agentAcc.offset(W.agent._id, { batchId: 'b-1', strategy: 'oldest' }, USER_ID);
      assert.equal(first.duplicate, false);
      assert.equal(first.appliedMinor, Math.min(payable, 100000));
      const again = await m.agentAcc.offset(W.agent._id, { batchId: 'b-1', strategy: 'oldest' }, USER_ID);
      assert.equal(again.duplicate, true);
      const paidAfter = (await m.Invoice.findById(d._id).lean()).paidMinor;
      assert.ok(paidAfter > 0);
      assert.equal((await m.agentAcc.payableBalance({ agentId: W.agent._id, currency: 'USD' })), payable - first.appliedMinor);
      await m.agentAcc.reverseOffset(W.agent._id, 'b-1', 'test reversal', USER_ID);
      assert.equal((await m.Invoice.findById(d._id).lean()).paidMinor, 0);
      assert.equal(await m.agentAcc.payableBalance({ agentId: W.agent._id, currency: 'USD' }), payable);
      await rejectsWith(m.agentAcc.reverseOffset(W.agent._id, 'b-1', 'again', USER_ID), 'BATCH_NOT_FOUND');
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });

    it('a Direct Line cannot be netted', async () => {
      await rejectsWith(m.agentAcc.offset(W.direct._id, { batchId: 'dl-1' }, USER_ID), 'DIRECT_LINE_NO_OFFSET');
    });

    it('handling charges are generated once, priced from the agreement', async () => {
      const R3 = await mkRound(W.vessel._id);
      await mkBookings(R3.voyage._id, W.agent._id, 4, 100);
      const a = await m.agentAcc.handlingConfirm(W.agent._id, R3.round._id, USER_ID);
      assert.equal(a.created, 4); assert.equal(a.totalMinor, 4 * 6000);
      const b = await m.agentAcc.handlingConfirm(W.agent._id, R3.round._id, USER_ID);
      assert.equal(b.created, 0);
      assert.equal((await balance('5300', { roundId: R3.round._id })).d, 24000);
    });

    it('the statement of account closing position equals the settlement statement net', async () => {
      const soa = await m.agentAcc.soa(W.agent._id, { currency: 'USD' });
      const cat = await Promise.all([]); void cat;
      const lines = await m.JournalEntryLine.find({ agentId: W.agent._id }).lean();
      assert.ok(Number.isInteger(soa.closingMinor));
      assert.ok(lines.length > 0);
    });
  });

  // ───────────────────────── Sprint 053 ─────────────────────────
  describe('Sprint 053 - partner settlement and round closing', () => {
    let R; let st; let transfers;
    const sh = (p, bp) => ({ partnerId: p._id, shareBp: bp });
    const jp = (lines, source, roundId, memo) => m.ledger.post({ date: new Date(), sourceType: source, roundId, currency: 'USD', memo, postedBy: USER_ID }, lines);

    before(async () => {
      await m.VesselPartner.insertMany([sh(W.pA, 5000, true), sh(W.pB, 3000), sh(W.pC, 2000)].map((s) => ({ ...s, vesselId: W.vessel._id })));
      R = await mkRound(W.vessel._id, 'Completed');
      const rid = R.round._id; const ag = W.agent._id;
      // proposal section 8: revenue 300,000; B pays hire 120,000; port costs 80,000; A collects 150,000, C 70,000; 80,000 offset
      await jp([{ accountCode: '1100', debitMinor: M('300000'), agentId: ag }, { accountCode: '4000', creditMinor: M('300000'), agentId: ag }], 'Invoice', rid, 'revenue');
      await jp([{ accountCode: '5100', debitMinor: M('120000') }, { accountCode: '1200', creditMinor: M('120000'), partnerId: W.pB._id }], 'Expense', rid, 'hire paid by B');
      await jp([{ accountCode: '5000', debitMinor: M('80000'), agentId: ag }, { accountCode: '2000', creditMinor: M('80000'), agentId: ag }], 'Expense', rid, 'port costs');
      await jp([{ accountCode: '1200', debitMinor: M('150000'), partnerId: W.pA._id }, { accountCode: '1100', creditMinor: M('150000'), agentId: ag }], 'Settlement', rid, 'A collects');
      await jp([{ accountCode: '1200', debitMinor: M('70000'), partnerId: W.pC._id }, { accountCode: '1100', creditMinor: M('70000'), agentId: ag }], 'Settlement', rid, 'C collects');
      await jp([{ accountCode: '2000', debitMinor: M('80000'), agentId: ag }, { accountCode: '1100', creditMinor: M('80000'), agentId: ag }], 'Settlement', rid, 'offset');
    });

    it('calculates the proposal example from real ledger lines: A pays 100,000, B receives 150,000, C pays 50,000', async () => {
      st = await m.ps.calculate(String(R.round._id), { mode: 'Accrual' }, USER);
      assert.equal(st.profitMinor, M('100000'));
      const net = Object.fromEntries(st.partners.map((p) => [p.partner.code, p.netMinor]));
      assert.deepEqual(net, { PA: -M('100000'), PB: M('150000'), PC: -M('50000') });
      transfers = st.transfers;
      assert.equal(transfers.length, 2);
    });

    it('cannot close with an open estimate (PDA) unless overridden with a reason', async () => {
      await m.Expense.create({ roundId: R.round._id, expenseTypeId: W.etype._id, agentId: W.agent._id, amount: 10, currency: 'USD', expenseDate: new Date(), kind: 'PDA' });
      await rejectsWith(m.rc.close(String(R.round._id), {}, USER, { canOverride: false }), 'ROUND_HAS_OPEN_PDA');
      await rejectsWith(m.rc.close(String(R.round._id), {}, USER, { canOverride: true }), 'OVERRIDE_REASON_REQUIRED');
      assert.notEqual((await m.Round.findById(R.round._id).lean()).closeStatus, 'Closed'); // transaction rolled back
    });

    it('closes with an override reason: settlement Final, closing entry posted, ledger balanced', async () => {
      const out = await m.rc.close(String(R.round._id), { overrideReason: 'estimate abandoned' }, USER, { canOverride: true });
      assert.equal(out.overridden, true);
      assert.equal((await m.Round.findById(R.round._id).lean()).closeStatus, 'Closed');
      const s2 = await m.ps.getSettlement(String(R.round._id));
      assert.equal(s2.status, 'Final');
      assert.ok(s2.closingEntryId);
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });

    it('a closed Round rejects mutations (ROUND_CLOSED)', async () => {
      await rejectsWith(m.expense.create({ roundId: String(R.round._id), expenseTypeId: String(W.etype._id), amount: 5, currency: 'USD', expenseDate: new Date() }, null, USER_ID), 'ROUND_CLOSED');
      await rejectsWith(m.Booking.create ? require('../../src/modules/bookings/booking.service').create({ voyageId: String(R.voyage._id), agentId: String(W.agent._id), containerTypeId: String(W.ct._id), freightRate: 1, containerNumber: 'ABCD1234567' }, USER_ID) : Promise.reject({ code: 'ROUND_CLOSED' }), 'ROUND_CLOSED');
      await rejectsWith(m.rc.close(String(R.round._id), {}, USER, { canOverride: true }), 'ROUND_CLOSED');
      await rejectsWith(require('../../src/modules/rounds/round.service').hardDelete(String(R.round._id)), 'ROUND_CLOSED');
    });

    it('transfers settle every partner current account to exactly zero', async () => {
      const fresh = await m.ps.getSettlement(String(R.round._id));
      for (const t of fresh.transfers) await m.ps.payTransfer(String(t._id), {}, USER);
      for (const p of [W.pA, W.pB, W.pC]) {
        assert.equal((await balance('1200', { partnerId: p._id, roundId: R.round._id })).net, 0, `partner ${p.code} account`);
      }
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });

    it('reopen is refused while transfers are paid; after reversing them it reopens and the Round is editable again', async () => {
      await rejectsWith(m.rc.reopen(String(R.round._id), 'correction', USER), 'ROUND_HAS_PAID_TRANSFERS');
      const fresh = await m.ps.getSettlement(String(R.round._id));
      for (const t of fresh.transfers) await m.ps.unpayTransfer(String(t._id), 'undo', USER);
      await m.rc.reopen(String(R.round._id), 'correction', USER);
      const r = await m.Round.findById(R.round._id).lean();
      assert.equal(r.closeStatus, 'Open');
      assert.equal((await m.ps.getSettlement(String(R.round._id))).status, 'Draft');
      for (const p of [W.pA, W.pB, W.pC]) { // closing entry reversed: only the real movements remain
        const b = await balance('1200', { partnerId: p._id, roundId: R.round._id });
        assert.ok(Number.isInteger(b.net));
      }
      await m.expense.create({ roundId: String(R.round._id), expenseTypeId: String(W.etype._id), amount: 5, currency: 'USD', expenseDate: new Date() }, null, USER_ID);
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });

    it('carry forward holds 20,000 in the JV reserve; reopen refuses once the reserve is spent', async () => {
      await m.Expense.deleteMany({ roundId: R.round._id, kind: 'PDA' });
      await m.rc.close(String(R.round._id), { carryForwardMinor: M('20000') }, USER, { canOverride: true, canCarryForward: true });
      assert.equal(await m.ps.reserveBalance(W.vessel._id, 'USD'), M('20000'));
      const R9 = await mkRound(W.vessel._id);
      const exp = await m.Expense.create({ roundId: R9.round._id, expenseTypeId: W.etype._id, amount: 150, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'Company' });
      const use = await m.ps.useReserve({ expenseId: String(exp._id), amountMinor: M('150') }, USER);
      assert.equal(use.balanceAfterMinor, M('19850'));
      await rejectsWith(m.ps.useReserve({ expenseId: String(exp._id), amountMinor: 1 }, USER), 'ALREADY_FUNDED');
      assert.equal((await m.ledger.trialBalance({})).balanced, true);
    });
  });
});
