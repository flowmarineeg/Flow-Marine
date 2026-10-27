'use strict';
// Regression tests for the HIGH findings of sprints/v2-code-audit-2026-10-21.md (H1-H7).
// Each test fails on the pre-fix code (the same scenarios are the audit probes). Needs the local
// replica set: TEST_MONGODB_URI=... npm run test:int  (the database is DROPPED; Atlas refused).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const URI = process.env.TEST_MONGODB_URI;
const SKIP = !URI ? 'TEST_MONGODB_URI not set' : false;
if (URI && /mongodb\+srv|mongodb\.net/i.test(URI)) throw new Error('Refusing to run integration tests against Atlas');

const oid = () => new mongoose.Types.ObjectId();
const U = oid(); const USER = { _id: U, email: 'audit@test.io' };
let m; let W; let seq = 0;
const uniq = (p) => `${p}${Date.now().toString(36)}${++seq}`;
const rejectsWith = async (p, code) => assert.rejects(p, (e) => { assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`); return true; });
const MM = (s) => require('../../src/utils/money').toMinor(s);

const mkRound = async (vesselId = W.vessel._id, voyageStatus = 'Completed', extra = {}) => {
  const round = await m.Round.create({ roundNumber: uniq('R'), serviceId: W.service._id, vesselId, startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), status: 'Active', ...extra });
  const voyage = await m.Voyage.create({ voyageNumber: uniq('V'), roundId: round._id, serviceId: W.service._id, polId: W.pol, podId: W.pod, sequence: 1, status: voyageStatus });
  round.voyageIds = [voyage._id]; await round.save();
  return { round, voyage };
};
const mkBookings = async (voyageId, agentId, n, rate) => {
  for (let i = 0; i < n; i++) {
    await m.Booking.create({ bookingNumber: uniq('BK'), voyageId, agentId, polId: W.pol, podId: W.pod, containerTypeId: W.ct._id, freightRate: rate, totalFreight: rate, containerNumber: uniq('MSCU').toUpperCase().slice(0, 11), status: 'Final Loading', containerStatus: 'Full' });
  }
};
const issueInvoice = async (R, rate, agentId = W.agent._id) => {
  await mkBookings(R.voyage._id, agentId, 1, rate);
  const its = await m.items.listEligible({ billToAgentId: agentId, voyageId: R.voyage._id });
  const d = await m.billing.createDraft({ invoiceType: 'Voyage', billToAgentId: agentId, voyageId: R.voyage._id, itemIds: its.map((i) => i._id), invoiceDate: '2026-01-10', dueDate: '2099-01-01', currency: 'USD' }, U);
  return m.billing.issue(d._id, U);
};
const postPayable = async (agentId, amount) => { // FDA expense paid by the port agent -> Agent Payable
  const R = await mkRound();
  const e = await m.Expense.create({ roundId: R.round._id, expenseTypeId: W.etype._id, agentId, amount, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'PortAgent' });
  await m.expV2.postExpense(String(e._id), U);
  return { R, e };
};

describe('V2 audit regression - HIGH findings', { skip: SKIP }, () => {
  before(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    const M = (p) => require('../../src/modules/' + p);
    m = {
      Booking: M('bookings/booking.model'), Round: M('rounds/round.model'), Voyage: M('voyages/voyage.model'), Vessel: M('vessels/vessel.model'),
      Service: M('services/service.model'), ContainerType: M('containerTypes/containerType.model'), ExpenseType: M('expenseTypes/expenseType.model'),
      Agent: M('agents/agent.model'), Partner: M('partners/partner.model'), VesselPartner: M('partners/vesselPartner.model'),
      Expense: M('expenses/expense.model'), Invoice: M('invoices/invoice.model'), Account: M('ledger/account.model'),
      JEL: M('ledger/journalEntryLine.model'), JE: M('ledger/journalEntry.model'), AgentAgreement: M('agreements/agentAgreement.model'),
      AgentCommission: M('agreements/agentCommission.model'),
      ledger: M('ledger/ledger.service'), partnerSvc: M('partners/partner.service'),
      items: M('billing/bookingItem.service'), billing: M('billing/invoiceV2.service'), expV2: M('expenses/expenseV2.service'),
      expense: M('expenses/expense.service'), agentAcc: M('agentAccounts/agentAccounts.service'), ps: M('partnerSettlement/partnerSettlement.service'),
      rc: M('partnerSettlement/roundClose.service'), psm: M('partnerSettlement/partnerSettlement.models'),
      logic: M('partnerSettlement/partnerSettlement.logic'),
      voyageSvc: M('voyages/voyage.service'), roundSvc: M('rounds/round.service'),
    };
    ['locations/port', 'locations/city', 'locations/country', 'users/user', 'roles/role'].forEach((n) => M(n + '.model'));
    M('agentAccounts/agentAccounts.models');
    await Promise.all(Object.values(mongoose.models).map((x) => x.init()));
    await M('ledger/accounts.seed').seedAccounts();
    W = {
      pol: oid(), pod: oid(),
      service: await m.Service.create({ serviceCode: 'S', serviceName: 'S' }),
      ct: await m.ContainerType.create({ code: 'C20', size: '20ft', type: 'Dry' }),
      etype: await m.ExpenseType.create({ name: 'Port charges', category: 'Port Expense' }),
      agent: await m.Agent.create({ agentName: 'A', agentCode: 'A' }),
      vessel: await m.Vessel.create({ vesselCode: 'V1', vesselName: 'V1', imoNumber: '1', ownershipType: 'Owned' }),
      v2Vessel: await m.Vessel.create({ vesselCode: 'V2', vesselName: 'V2', imoNumber: '2', ownershipType: 'Owned' }),
      pA: await m.Partner.create({ code: 'PA', name: 'A' }), pB: await m.Partner.create({ code: 'PB', name: 'B' }),
    };
  });
  after(async () => { await mongoose.disconnect(); });

  it('H1/F-01: a vessel with open Rounds (even v2) can still receive shares; only a Final settlement locks them', async () => {
    await mkRound(W.vessel._id);
    await m.Round.updateOne({ vesselId: W.vessel._id }, { $set: { v2: true } });
    const sh = [{ partnerId: W.pA._id, shareBp: 6000 }, { partnerId: W.pB._id, shareBp: 4000 }];
    const saved = await m.partnerSvc.setShares(W.vessel._id, sh, U);
    assert.equal(saved.length, 2);
    // a finalised settlement locks
    await m.psm.PartnerSettlement.create({ roundId: oid(), vesselId: W.v2Vessel._id, currency: 'USD', status: 'Final', profitMinor: 0, partners: [] });
    await rejectsWith(m.partnerSvc.setShares(W.v2Vessel._id, sh, U), 'VESSEL_SHARES_LOCKED');
    assert.ok(m.Round.schema.path('v2'));
  });

  it('H2: two simultaneous pay-agent calls cannot overdraw the payable; pay vs offset are serialised too', async () => {
    const a = await m.Agent.create({ agentName: 'H2', agentCode: 'H2' });
    await postPayable(a._id, 100); // payable 10,000
    const pay = () => m.agentAcc.payAgent(a._id, { amountMinor: 10000 }, U);
    const res = await Promise.allSettled([pay(), pay()]);
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(res.find((r) => r.status === 'rejected').reason.code, 'PAYMENT_EXCEEDS_PAYABLE');
    assert.equal(await m.agentAcc.payableBalance({ agentId: a._id, currency: 'USD' }), 0);

    // pay vs offset on the same payable (they share no invoice, so only the agent lock can serialise them)
    const b = await m.Agent.create({ agentName: 'H2b', agentCode: 'H2B' });
    await postPayable(b._id, 100);
    const R = await mkRound(); await issueInvoice(R, 100, b._id); // an open 10,000 invoice for b
    const both = await Promise.allSettled([
      m.agentAcc.payAgent(b._id, { amountMinor: 10000 }, U),
      m.agentAcc.offset(b._id, { batchId: uniq('b'), strategy: 'oldest' }, U),
    ]);
    assert.ok(both.every((r) => r.status === 'fulfilled' || r.reason.code === 'PAYMENT_EXCEEDS_PAYABLE'));
    assert.ok((await m.agentAcc.payableBalance({ agentId: b._id, currency: 'USD' })) >= 0, 'payable never negative');
  });

  it('H3: an expense cannot be moved into a closed Round, and a posted expense cannot change scope', async () => {
    const open = await mkRound(); const closed = await mkRound();
    await m.Round.updateOne({ _id: closed.round._id }, { $set: { closeStatus: 'Closed' } });
    const e = await m.Expense.create({ roundId: open.round._id, expenseTypeId: W.etype._id, amount: 5, currency: 'USD', expenseDate: new Date() });
    await rejectsWith(m.expense.update(String(e._id), { roundId: String(closed.round._id) }, null, U), 'ROUND_CLOSED');
    assert.equal(String((await m.Expense.findById(e._id).lean()).roundId), String(open.round._id));
    // posted expense: scope frozen
    const other = await mkRound();
    const p = await m.Expense.create({ roundId: open.round._id, expenseTypeId: W.etype._id, agentId: W.agent._id, amount: 7, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'Company' });
    await m.expV2.postExpense(String(p._id), U);
    await rejectsWith(m.expense.update(String(p._id), { roundId: String(other.round._id) }, null, U), 'EXPENSE_POSTED');
  });

  it('H4: cash movements and every ledger posting are refused in a closed Round', async () => {
    const R = await mkRound(); await m.Round.updateOne({ _id: R.round._id }, { $set: { closeStatus: 'Closed' } });
    await rejectsWith(m.agentAcc.advance(W.agent._id, { amountMinor: 1000, roundId: R.round._id }, U), 'ROUND_CLOSED');
    await rejectsWith(m.ledger.post({ date: new Date(), sourceType: 'Manual', roundId: R.round._id, currency: 'USD' },
      [{ accountCode: '1010', debitMinor: 5 }, { accountCode: '4100', creditMinor: 5 }]), 'ROUND_CLOSED');
    assert.equal(await m.JEL.countDocuments({ roundId: R.round._id }), 0);
  });

  it('H4: a posting racing a Round close can never leave a line the final settlement missed', async () => {
    await m.VesselPartner.deleteMany({ vesselId: W.v2Vessel._id });
    await m.VesselPartner.insertMany([{ vesselId: W.v2Vessel._id, partnerId: W.pA._id, shareBp: 10000 }]);
    for (let trial = 0; trial < 6; trial++) {
      const R = await mkRound(W.v2Vessel._id);
      await m.ledger.post({ date: new Date(), sourceType: 'Invoice', roundId: R.round._id, currency: 'USD' },
        [{ accountCode: '1100', debitMinor: 100000, agentId: W.agent._id }, { accountCode: '4000', creditMinor: 100000, agentId: W.agent._id }]);
      const e = await m.Expense.create({ roundId: R.round._id, expenseTypeId: W.etype._id, agentId: W.agent._id, amount: 400, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'Company' });
      const res = await Promise.allSettled([m.rc.close(String(R.round._id), {}, USER, {}), m.expV2.postExpense(String(e._id), U)]);
      const closed = (await m.Round.findById(R.round._id).lean()).closeStatus === 'Closed';
      assert.ok(closed || res[0].status === 'rejected', `trial ${trial}: close outcome`);
      if (!closed) continue;
      const st = await m.psm.PartnerSettlement.findOne({ roundId: R.round._id }).lean();
      const lines = await m.ps.roundLines(R.round._id, 'USD');
      const ledgerProfit = m.logic.computeProfit(lines, 'Accrual').profitMinor;
      assert.equal(st.profitMinor, ledgerProfit, `trial ${trial}: final settlement must equal the ledger (post: ${res[1].status})`);
    }
  });

  it('H5: ledger lines, posted expenses and finalised records block deleting a Round, a Voyage or a Partner', async () => {
    const R = await mkRound();
    await m.ledger.post({ date: new Date(), sourceType: 'Settlement', roundId: R.round._id, currency: 'USD' },
      [{ accountCode: '1110', debitMinor: 5000, agentId: W.agent._id }, { accountCode: '1010', creditMinor: 5000 }]);
    await rejectsWith(m.roundSvc.hardDelete(String(R.round._id)), 'HAS_DEPENDENTS');
    assert.ok(await m.Round.exists({ _id: R.round._id }));

    const V = await mkRound();
    const e = await m.Expense.create({ voyageId: V.voyage._id, expenseTypeId: W.etype._id, agentId: W.agent._id, amount: 20, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'PortAgent' });
    await m.expV2.postExpense(String(e._id), U);
    await rejectsWith(m.voyageSvc.deleteVoyage(String(V.voyage._id)), 'HAS_DEPENDENTS');
    assert.ok(await m.Voyage.exists({ _id: V.voyage._id }));

    const p = await m.Partner.create({ code: 'PZ', name: 'Z' });
    await m.psm.PartnerSettlement.create({ roundId: oid(), vesselId: W.vessel._id, currency: 'USD', status: 'Draft', profitMinor: 1, partners: [{ partnerId: p._id, shareBp: 10000, shareMinor: 1 }] });
    await rejectsWith(m.partnerSvc.hardDelete(p._id), 'HAS_DEPENDENTS');

    // a clean Round (only a Draft settlement) is still deletable and its draft data goes with it
    const clean = await mkRound();
    await m.psm.PartnerSettlement.create({ roundId: clean.round._id, vesselId: W.vessel._id, currency: 'USD', status: 'Draft', profitMinor: 0, partners: [] });
    await m.roundSvc.hardDelete(String(clean.round._id));
    assert.equal(await m.Round.exists({ _id: clean.round._id }), null);
    assert.equal(await m.psm.PartnerSettlement.countDocuments({ roundId: clean.round._id }), 0);
  });

  it('H7: commission can be listed and cancelled with a reason; an invoice cancel can opt in to cancelling it', async () => {
    const ag = await m.Agent.create({ agentName: 'H7', agentCode: 'H7' });
    await m.AgentAgreement.create({ agentId: ag._id, currency: 'USD', validFrom: new Date('2020-01-01'), commission: { rule: 'fixedPerBooking', amountMinor: 700 } });
    const R1 = await mkRound(); const inv1 = await issueInvoice(R1, 40, ag._id);
    const list = await m.agentAcc.listCommissions(ag._id);
    assert.equal(list.length, 1); assert.equal(list[0].status, 'Accrued'); assert.equal(list[0].amountMinor, 700);
    assert.equal(await m.agentAcc.payableBalance({ agentId: ag._id, currency: 'USD' }), 700);
    // default invoice cancel keeps commission (spec R7)
    await m.billing.cancel(inv1._id, 'wrong customer', U);
    assert.equal((await m.AgentCommission.findOne({ invoiceId: inv1._id }).lean()).status, 'Accrued');
    // explicit cancel with a reason reverses the ledger
    await rejectsWith(m.agentAcc.cancelCommission(list[0]._id, '', USER), 'REASON_REQUIRED');
    await m.agentAcc.cancelCommission(list[0]._id, 'invoice was cancelled', USER);
    assert.equal((await m.AgentCommission.findOne({ invoiceId: inv1._id }).lean()).status, 'Cancelled');
    assert.equal(await m.agentAcc.payableBalance({ agentId: ag._id, currency: 'USD' }), 0);
    await rejectsWith(m.agentAcc.cancelCommission(list[0]._id, 'again', USER), 'COMMISSION_NOT_ACCRUED');
    // opt-in on invoice cancel
    const R2 = await mkRound(); const inv2 = await issueInvoice(R2, 40, ag._id);
    assert.equal(await m.agentAcc.payableBalance({ agentId: ag._id, currency: 'USD' }), 700);
    await m.billing.cancel(inv2._id, 'duplicate', U, { cancelCommission: true });
    assert.equal((await m.AgentCommission.findOne({ invoiceId: inv2._id }).lean()).status, 'Cancelled');
    assert.equal(await m.agentAcc.payableBalance({ agentId: ag._id, currency: 'USD' }), 0);
    assert.equal((await m.ledger.trialBalance({})).balanced, true);
  });
});
