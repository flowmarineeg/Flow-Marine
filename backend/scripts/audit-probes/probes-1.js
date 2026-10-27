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

  // P-A: concurrent netting with different batch ids double-spends the same payable
  {
    const Ra = await mkRound(); const i1 = await issueInvoice(Ra, 100); const Rb = await mkRound(); const i2 = await issueInvoice(Rb, 100); // two 10,000 invoices
    const Rc = await mkRound();
    const exp = await m.Expense.create({ roundId: Rc.round._id, expenseTypeId: et._id, agentId: agent._id, amount: 100, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'PortAgent' });
    await m.expV2.postExpense(String(exp._id), U); // payable 10,000
    const before = await m.agentAcc.payableBalance({ agentId: agent._id, currency: 'USD' });
    const res = await Promise.allSettled([
      m.agentAcc.offset(agent._id, { batchId: uniq('x'), strategy: 'oldest' }, U),
      m.agentAcc.offset(agent._id, { batchId: uniq('y'), strategy: 'oldest' }, U),
    ]);
    const after = await m.agentAcc.payableBalance({ agentId: agent._id, currency: 'USD' });
    rec('P-A', after < 0 ? 'CONFIRMED: payable over-spent by concurrent offsets' : 'not reproduced', `payable before=${before} after=${after}; outcomes=${res.map((r) => r.status + (r.reason ? ':' + r.reason.code : '')).join(',')}`);
  }

  // P-B: an expense can be MOVED into a closed Round by an update
  {
    const Open = await mkRound(); const Closed = await mkRound();
    await m.Round.updateOne({ _id: Closed.round._id }, { $set: { closeStatus: 'Closed' } });
    const exp = await m.Expense.create({ roundId: Open.round._id, expenseTypeId: et._id, amount: 5, currency: 'USD', expenseDate: new Date() });
    try { await m.expSvc.update(String(exp._id), { roundId: String(Closed.round._id) }, null, U); const now = await m.Expense.findById(exp._id).lean(); rec('P-B', String(now.roundId) === String(Closed.round._id) ? 'CONFIRMED: expense moved into a closed Round' : 'update ran but round unchanged', `roundId now ${now.roundId}`); }
    catch (e) { rec('P-B', 'not reproduced (blocked)', e.code || e.message); }
  }

  // P-C: concurrent item sync / listEligible
  {
    const R = await mkRound(); await mkB(R.voyage._id, 3, 77);
    const rs = await Promise.allSettled([1, 2, 3, 4].map(() => m.items.listEligible({ billToAgentId: agent._id, voyageId: R.voyage._id })));
    const bad = rs.filter((r) => r.status === 'rejected');
    rec('P-C', bad.length ? 'CONFIRMED: concurrent listEligible fails' : 'not reproduced', `${bad.length}/4 rejected ${bad.map((b) => b.reason.code || b.reason.message.slice(0, 60)).join('|')}; items=${await m.BI.BookingItem.countDocuments({ voyageId: R.voyage._id })}`);
  }

  // P-E: lazy Overdue vs status filter
  {
    const R = await mkRound(); const inv = await issueInvoice(R, 55, '2026-01-20');
    const byFilter = (await m.invSvc.list({ status: 'Overdue' })).data.filter((x) => String(x._id) === String(inv._id)).length;
    const got = await m.invSvc.getById(inv._id);
    rec('P-E', byFilter === 0 && got.status === 'Overdue' ? 'CONFIRMED: shown Overdue on read but missing from ?status=Overdue' : 'not reproduced', `detail status=${got.status}, in Overdue filter=${byFilter}, stored=${(await m.Invoice.findById(inv._id).lean()).status}`);
  }

  // P-F: deleteVoyage with a posted expense on the voyage
  {
    const R = await mkRound();
    const exp = await m.Expense.create({ voyageId: R.voyage._id, expenseTypeId: et._id, agentId: agent._id, amount: 20, currency: 'USD', expenseDate: new Date(), kind: 'FDA', paidBy: 'PortAgent' });
    await m.expV2.postExpense(String(exp._id), U);
    try { await m.voyageSvc.deleteVoyage(String(R.voyage._id)); rec('P-F', 'CONFIRMED: voyage with a POSTED expense was deleted', `expense still references voyage ${exp.voyageId}`); }
    catch (e) { rec('P-F', 'not reproduced (blocked)', e.message || e.code); }
  }

  // P-I: Round delete with ledger lines but no bookings / expenses
  {
    const R = await mkRound();
    await m.ledger.post({ date: new Date(), sourceType: 'Settlement', roundId: R.round._id, currency: 'USD' }, [{ accountCode: '1110', debitMinor: 5000, agentId: agent._id }, { accountCode: '1010', creditMinor: 5000 }]);
    try { await m.roundSvc.hardDelete(String(R.round._id)); const lines = await m.JEL.countDocuments({ roundId: R.round._id }); rec('P-I', 'CONFIRMED: Round with posted ledger lines was hard-deleted', `${lines} ledger lines now point at a deleted Round`); }
    catch (e) { rec('P-I', 'not reproduced (blocked)', e.message); }
  }

  // P-H: existing vessel with rounds can never receive partner shares
  {
    const pA = await m.Partner.create({ code: 'PA', name: 'A' });
    try { await m.psvc.setShares(vessel._id, [{ partnerId: pA._id, shareBp: 10000 }], U); rec('P-H', 'not reproduced', 'shares saved'); }
    catch (e) { rec('P-H', e.code === 'VESSEL_SHARES_LOCKED' ? 'CONFIRMED: a vessel that already has Rounds can never get shares via the API' : 'other', e.code); }
  }

  // P-G: double-submit of pay agent / settlement
  {
    const R = await mkRound(); const inv = await issueInvoice(R, 90); // 9,000
    const body = { amountMinor: 2000, date: '2026-02-01' };
    await m.billing.recordSettlement(inv._id, body, U); await m.billing.recordSettlement(inv._id, body, U);
    const paid = (await m.Invoice.findById(inv._id).lean()).paidMinor;
    rec('P-G', paid === 4000 ? 'CONFIRMED: identical settlement submitted twice is accepted twice (no idempotency key)' : 'not reproduced', `paidMinor=${paid}`);
  }

  // P-J: commission accrued on an invoice that is later cancelled stays accrued, and no API exists to cancel it
  {
    const M2 = M('agreements/agentAgreement.model'); await M2.create({ agentId: agent._id, currency: 'USD', validFrom: new Date('2020-01-01'), commission: { rule: 'fixedPerBooking', amountMinor: 700 } });
    const R = await mkRound(); const inv = await issueInvoice(R, 40);
    await m.billing.cancel(inv._id, 'wrong customer', U);
    const c = await M('agreements/agentCommission.model').find({ invoiceId: inv._id }).lean();
    rec('P-J', c.length && c[0].status === 'Accrued' ? 'CONFIRMED: commission of a cancelled invoice stays Accrued/payable' : 'not reproduced', `commission rows=${c.length} status=${c[0]?.status}`);
  }

  // P-K: advance/pay with roundId bypasses the closed-Round lock
  {
    const R = await mkRound(); await m.Round.updateOne({ _id: R.round._id }, { $set: { closeStatus: 'Closed' } });
    await mkB(R.voyage._id, 1, 10); // not used
    try { await m.agentAcc.advance(agent._id, { amountMinor: 1000, roundId: R.round._id }, U); const lines = await m.JEL.countDocuments({ roundId: R.round._id, agentId: agent._id }); rec('P-K', 'CONFIRMED: an advance can be posted into a CLOSED Round', `${lines} new line(s) in closed round`); }
    catch (e) { rec('P-K', 'not reproduced (blocked)', e.code); }
  }

  // P-L: PDF for a credit note / V2 invoice does not crash
  {
    const R = await mkRound(); const inv = await issueInvoice(R, 25);
    const cn = await m.billing.createNote(inv._id, 'CreditNote', { amountMinor: 500, reason: 'x' }, U);
    try { const { generateInvoicePdf } = req('src/utils/invoicePdfGenerator'); const doc = await m.invSvc.getByIdForPdf(cn._id); const buf = await generateInvoicePdf(doc); rec('P-L', 'credit note PDF renders', `${Buffer.isBuffer(buf) ? buf.length : typeof buf} bytes`); }
    catch (e) { rec('P-L', 'FAILS: ' + e.message.slice(0, 80), ''); }
  }

  // P-M: partner referenced by a transfer/settlement can be deleted
  {
    const pA = await m.Partner.findOne({ code: 'PA' });
    const { PartnerSettlement } = M('partnerSettlement/partnerSettlement.models');
    await m.VP.deleteMany({}); // remove blocker to isolate
    await PartnerSettlement.create({ roundId: oid(), vesselId: vessel._id, currency: 'USD', mode: 'Accrual', partners: [{ partnerId: pA._id, shareBp: 10000, shareMinor: 1 }], profitMinor: 1, status: 'Draft' });
    try { await m.psvc.hardDelete(pA._id); rec('P-M', 'CONFIRMED: partner referenced by a PartnerSettlement can be deleted', 'dangling partnerId'); } catch (e) { rec('P-M', 'not reproduced', e.code); }
  }

  // P-N: user-visible error body leaks a raw system error code
  {
    const eh = req('src/middleware/errorHandler'); let body; const res = { status() { return { json: (b) => { body = b; } }; } };
    const err = new Error('boom'); err.code = 'ECONNRESET'; eh(err, { method: 'GET', originalUrl: '/x' }, res, () => {});
    rec('P-N', body && body.code === 'ECONNRESET' ? 'CONFIRMED: raw system error code echoed to the client' : 'not reproduced', JSON.stringify(body));
  }

  require('fs').writeFileSync('C:/Users/fares/AppData/Local/Temp/claude/D--web-desgin-freelance-logistics/c4f6bee8-1f18-40b0-8ffc-7c015c55840a/scratchpad/probe-results.json', JSON.stringify(out, null, 2));
  await mongoose.disconnect(); process.exit(0);
})().catch((e) => { console.error('PROBE ERROR', e); process.exit(1); });
