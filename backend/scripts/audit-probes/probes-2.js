// Audit probes: each one tries to PROVE or DISPROVE a suspected V2 defect against a disposable DB.
const path = require('path');
const B = 'D:/web-desgin/freelance/logistics/backend/';
const req = (p) => require(path.join(B, p));
const mongoose = req('node_modules/mongoose');
const URI = 'mongodb://localhost:27018/flow_audit_probe?directConnection=true';
const oid = () => new mongoose.Types.ObjectId();
const U = oid(); let n = 0; const uniq = (p) => `${p}${Date.now().toString(36)}${++n}`;
const out = [];
const rec = (id, finding, detail) => { out.push({ id, finding, detail }); console.log(`[${id}] ${finding} :: ${detail}`); };

(async () => {
  await mongoose.connect(URI); await mongoose.connection.dropDatabase();
  const M = (p) => req('src/modules/' + p);
  const m = {
    Booking: M('bookings/booking.model'), Round: M('rounds/round.model'), Voyage: M('voyages/voyage.model'), Vessel: M('vessels/vessel.model'),
    Service: M('services/service.model'), CT: M('containerTypes/containerType.model'), ET: M('expenseTypes/expenseType.model'), Agent: M('agents/agent.model'),
    Expense: M('expenses/expense.model'), Invoice: M('invoices/invoice.model'), Partner: M('partners/partner.model'),
    ledger: M('ledger/ledger.service'), JEL: M('ledger/journalEntryLine.model'), Account: M('ledger/account.model'),
    items: M('billing/bookingItem.service'), billing: M('billing/invoiceV2.service'),
    agentAcc: M('agentAccounts/agentAccounts.service'), expSvc: M('expenses/expense.service'), expV2: M('expenses/expenseV2.service'),
    psvc: M('partners/partner.service'), roundSvc: M('rounds/round.service'), voyageSvc: M('voyages/voyage.service'),
    invSvc: M('invoices/invoice.service'), VP: M('partners/vesselPartner.model'), BI: M('billing/billing.models'),
  };
  ['locations/port', 'locations/city', 'locations/country', 'users/user', 'roles/role'].forEach((x) => M(x + '.model'));
  M('agentAccounts/agentAccounts.models'); M('partnerSettlement/partnerSettlement.models');
  await Promise.all(Object.values(mongoose.models).map((x) => x.init()));
  await M('ledger/accounts.seed').seedAccounts();
  const pol = oid(); const pod = oid();
  const service = await m.Service.create({ serviceCode: 'S', serviceName: 'S' });
  const ct = await m.CT.create({ code: 'C20', size: '20ft', type: 'Dry' });
  const et = await m.ET.create({ name: 'Port charges', category: 'Port Expense' });
  const agent = await m.Agent.create({ agentName: 'A', agentCode: 'A' });
  const vessel = await m.Vessel.create({ vesselCode: 'V', vesselName: 'V', imoNumber: '1', ownershipType: 'Owned' });
  const mkRound = async (vs = 'Completed') => {
    const round = await m.Round.create({ roundNumber: uniq('R'), serviceId: service._id, vesselId: vessel._id, startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), status: 'Active' });
    const voyage = await m.Voyage.create({ voyageNumber: uniq('V'), roundId: round._id, serviceId: service._id, polId: pol, podId: pod, sequence: 1, status: vs });
    round.voyageIds = [voyage._id]; await round.save(); return { round, voyage };
  };
  const mkB = async (vid, count, rate) => { for (let i = 0; i < count; i++) await m.Booking.create({ bookingNumber: uniq('BK'), voyageId: vid, agentId: agent._id, polId: pol, podId: pod, containerTypeId: ct._id, freightRate: rate, totalFreight: rate, containerNumber: uniq('MSCU').toUpperCase().slice(0, 11), status: 'Final Loading', containerStatus: 'Full' }); };
  const issueInvoice = async (R, rate, due = '2099-01-01') => {
    await mkB(R.voyage._id, 1, rate);
    const its = await m.items.listEligible({ billToAgentId: agent._id, voyageId: R.voyage._id });
    const d = await m.billing.createDraft({ invoiceType: 'Voyage', billToAgentId: agent._id, voyageId: R.voyage._id, itemIds: its.map((i) => i._id), invoiceDate: '2026-01-10', dueDate: due, currency: 'USD' }, U);
    return m.billing.issue(d._id, U);
  };
  const bal = async (code, f = {}) => { const a = await m.Account.findOne({ code }).lean(); const [r] = await m.JEL.aggregate([{ $match: { accountId: a._id, ...f } }, { $group: { _id: null, d: { $sum: '$debitMinor' }, c: { $sum: '$creditMinor' } } }]); return r ? r.d - r.c : 0; };


  {
    // P-A2: two concurrent pay-agent calls (and pay vs offset) on the same payable
    const Rc = await mkRound();
    const exp = await m.Expense.create({ roundId: Rc.round._id, expenseTypeId: et._id, agentId: agent._id, amount: 100, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'PortAgent' });
    await m.expV2.postExpense(String(exp._id), U); // payable 10,000
    const pay = () => m.agentAcc.payAgent(agent._id, { amountMinor: 10000 }, U);
    const res = await Promise.allSettled([pay(), pay()]);
    const after = await m.agentAcc.payableBalance({ agentId: agent._id, currency: 'USD' });
    rec('P-A2', after < 0 ? 'CONFIRMED: two concurrent pay-agent calls both succeed and overdraw the payable' : 'not reproduced', 'payable after=' + after + '; outcomes=' + res.map((r) => r.status).join(','));
  }
  {
    // P-E2: invoice that BECAME overdue after issue (stored Issued, due date now past)
    const R = await mkRound(); const inv = await issueInvoice(R, 55, '2099-01-01');
    await m.Invoice.updateOne({ _id: inv._id }, { $set: { dueDate: new Date('2026-01-20') } }); // time passes
    const byFilter = (await m.invSvc.list({ status: 'Overdue' })).data.filter((x) => String(x._id) === String(inv._id)).length;
    const got = await m.invSvc.getById(inv._id);
    rec('P-E2', byFilter === 0 && got.status === 'Overdue' ? 'CONFIRMED: shown Overdue on read but missing from ?status=Overdue filter' : 'not reproduced', 'read status=' + got.status + ', in Overdue filter=' + byFilter + ', stored=' + (await m.Invoice.findById(inv._id).lean()).status);
  }
  await mongoose.disconnect(); process.exit(0);
})().catch((e) => { console.error('PROBE ERROR', e); process.exit(1); });
