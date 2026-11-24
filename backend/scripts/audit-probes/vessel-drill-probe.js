'use strict';

// Vessel-first navigation probe (sprint vessel-first-navigation-2026-11-23).
// Sprint B: GET /voyages/vessel-overview and /voyages/vessel-overview/:vesselId.
// Run against the dev server + the disposable TEST database:  node scripts/audit-probes/vessel-drill-probe.js
// PRINTS its results and writes NO file and NO data (read-only; a file under backend/ would restart nodemon, audit S-16).
// The database is read directly (read-only) only to cross-check which vessels / rounds / voyages should be listed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const PASS = 'Demo@123456';
const OPEN_ROUND = ['Planned', 'Active'];
const OPEN_VOYAGE = ['Scheduled', 'Departed', 'In Transit', 'Arrived'];
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`); };
const note = (m) => console.log(`  info  ${m}`);
const section = (t) => console.log(`\n${t}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

class Client {
  async login(email, password) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.status !== 200) return null;
    this.token = (r.headers.getSetCookie().find((c) => c.startsWith('token=')) || '').split(';')[0].slice(6);
    this.csrf = r.headers.get('x-csrf-token');
    return this;
  }
  async exportCount(module, filters) { // POST /export/excel -> the X-Export-Count header (rows in the file)
    const r = await fetch(`${BASE}/export/excel`, { method: 'POST', headers: { Cookie: `token=${this.token}`, 'X-CSRF-Token': this.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ module, filters, selectedIds: [] }) });
    return { status: r.status, count: Number(r.headers.get('x-export-count')) };
  }
  async get(url) {
    const r = await fetch(`${BASE}${url}`, { headers: { Cookie: `token=${this.token}` } });
    let json = null; try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, body: json, data: json?.data, message: json?.message };
  }
}

(async () => {
  const health = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`Server not reachable at ${BASE} - start it with npm run dev`); process.exit(2); }
  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');
  if (!admin) { console.error('admin login failed'); process.exit(2); }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Vessel drill probe on database "${db.databaseName}" (${BASE})`);

  // ── what the DB says should be listed (independent of the service code) ──
  const rounds = await db.collection('rounds').find({ status: { $in: OPEN_ROUND } }).project({ vesselId: 1, status: 1 }).toArray();
  const voyages = await db.collection('voyages').find({ roundId: { $in: rounds.map((r) => r._id) }, status: { $in: OPEN_VOYAGE } }).project({ roundId: 1, status: 1 }).toArray();
  const roundHasVoyage = new Set(voyages.map((v) => String(v.roundId)));
  const expectVessels = new Set(rounds.filter((r) => roundHasVoyage.has(String(r._id))).map((r) => String(r.vesselId)));
  const allVessels = await db.collection('vessels').find({}).project({ vesselCode: 1, vesselName: 1, capacity: 1 }).toArray();
  note(`${allVessels.length} vessels, ${rounds.length} open rounds, ${voyages.length} open voyages, ${expectVessels.size} vessels expected in the list`);

  // ── 1. level 1 ────────────────────────────────────────────────────────────
  section('1. GET /voyages/vessel-overview (level 1)');
  const l1 = await admin.get('/voyages/vessel-overview?limit=100');
  check('returns 200 (route is not shadowed by /:id)', l1.status === 200, `${l1.status} ${l1.message}`);
  const rows = l1.data || [];
  check('paginated shape {data, pagination.total/page/limit}', Array.isArray(rows) && l1.body?.pagination?.total === rows.length && l1.body.pagination.page === 1, JSON.stringify(l1.body?.pagination));
  check('lists exactly the vessels that have an open round with an open voyage', same([...new Set(rows.map((r) => String(r.vesselId)))].sort(), [...expectVessels].sort()), `got ${rows.length}, expected ${expectVessels.size}`);
  const excluded = allVessels.filter((v) => !expectVessels.has(String(v._id)));
  check('vessels with no open round/voyage are not listed', excluded.every((v) => !rows.some((r) => String(r.vesselId) === String(v._id))));
  check('rows are sorted by vessel name', same(rows.map((r) => r.vesselName), [...rows.map((r) => r.vesselName)].sort((a, b) => a.localeCompare(b))) || rows.length < 2, rows.map((r) => r.vesselName).join(','));
  check('every row has vessel, primary round, next voyage, capacity, booked TEU, peak %', rows.every((r) => r.vesselName && r.vesselCode && r.primaryRound?.roundNumber && r.nextVoyage?.label && 'capacity' in r && typeof r.bookedTEU === 'number' && 'peakUtilisationPct' in r && r.openVoyages >= 1));
  check('"+N more" counts match the lists', rows.every((r) => r.extraRounds === r.rounds.length - 1 && r.extraVoyages === r.openVoyages - 1));
  check('Active round is the primary one when the vessel has one', rows.every((r) => !r.rounds.some((x) => x.status === 'Active') || r.primaryRound.status === 'Active'));
  check('no money fields (revenue / freight) in the payload', !/revenue|freight|invoice/i.test(JSON.stringify(l1.data)));

  // ── 2. level 1 numbers = the capacity engine ─────────────────────────────
  section('2. Level 1 numbers equal GET /capacity/round/:id');
  let numChecked = 0; const bad = [];
  const capCache = new Map();
  const capOf = async (id) => { if (!capCache.has(id)) capCache.set(id, (await admin.get(`/capacity/round/${id}`)).data); return capCache.get(id); };
  for (const r of rows) {
    let booked = 0; const pcts = []; let over = false; let count = 0;
    for (const rd of r.rounds) {
      const cap = await capOf(rd.roundId);
      const openIds = new Set(voyages.filter((v) => String(v.roundId) === String(rd.roundId)).map((v) => String(v._id)));
      for (const row of cap.voyages || []) {
        if (!openIds.has(String(row.voyageId))) continue;
        booked += row.loadedTEU; count += 1;
        if (row.utilisationPct != null) pcts.push(row.utilisationPct);
        if (row.remainingTEU != null && row.remainingTEU < 0) over = true;
      }
    }
    const peak = pcts.length ? Math.max(...pcts) : null;
    const v = allVessels.find((x) => String(x._id) === String(r.vesselId));
    const ok = r.bookedTEU === booked && r.peakUtilisationPct === peak && r.overbooked === over && (r.capacity ?? null) === (v.capacity ?? null);
    numChecked += 1; if (!ok) bad.push(`${r.vesselCode}: got ${r.bookedTEU}/${r.peakUtilisationPct}/${r.overbooked}, engine ${booked}/${peak}/${over} (${count} voyages)`);
  }
  check(`booked TEU, peak % and overbooked equal the engine for all ${numChecked} vessels`, bad.length === 0, bad.join(' | '));
  check('a vessel without capacity shows a null peak %', rows.filter((r) => r.capacity == null).every((r) => r.peakUtilisationPct === null));
  note(`${rows.filter((r) => r.bookedTEU > 0).length} vessels have booked TEU > 0, ${rows.filter((r) => r.capacity == null).length} have no capacity`);

  // ── 3. search + paging ───────────────────────────────────────────────────
  section('3. Search and paging');
  if (rows.length) {
    const code = rows[0].vesselCode;
    const s = await admin.get(`/voyages/vessel-overview?search=${encodeURIComponent(code)}`);
    check('search by vessel code finds it', s.status === 200 && s.data.some((r) => r.vesselCode === code));
    const s2 = await admin.get(`/voyages/vessel-overview?search=${encodeURIComponent('zz(no[such')}`);
    check('a search with regex characters is escaped and returns an empty page (no 500)', s2.status === 200 && s2.data.length === 0 && s2.body.pagination.total === 0, `${s2.status}`);
    const p1 = await admin.get('/voyages/vessel-overview?limit=1&page=1');
    check('limit=1 returns one row and the full total', p1.data.length === 1 && p1.body.pagination.total === rows.length && p1.body.pagination.totalPages === rows.length, JSON.stringify(p1.body.pagination));
    if (rows.length > 1) {
      const p2 = await admin.get('/voyages/vessel-overview?limit=1&page=2');
      check('page 2 is a different vessel (stable sort)', p2.data.length === 1 && String(p2.data[0].vesselId) === String(rows[1].vesselId) && String(p2.data[0].vesselId) !== String(p1.data[0].vesselId));
    }
    const p9 = await admin.get(`/voyages/vessel-overview?limit=1&page=${rows.length + 5}`);
    check('a page past the end is empty, not an error', p9.status === 200 && p9.data.length === 0);
  } else note('no vessels listed: search / paging checks skipped');

  // ── 4. level 2 ────────────────────────────────────────────────────────────
  section('4. GET /voyages/vessel-overview/:vesselId (level 2)');
  let l2Ok = 0;
  for (const r of rows) {
    const d = await admin.get(`/voyages/vessel-overview/${r.vesselId}`);
    const dd = d.data;
    const errs = [];
    if (d.status !== 200) errs.push(`status ${d.status}`);
    else {
      if (String(dd.vessel._id) !== String(r.vesselId)) errs.push('vessel id');
      if (!dd.rounds.every((b) => OPEN_ROUND.includes(b.round.status))) errs.push('a closed round is listed');
      if (!dd.rounds.every((b) => b.voyages.length > 0 && b.voyages.every((v) => OPEN_VOYAGE.includes(v.status)))) errs.push('a closed voyage is listed or a round is empty');
      if (!same(dd.rounds.map((b) => String(b.round._id)), r.rounds.map((x) => String(x.roundId)))) errs.push('rounds differ from level 1');
      if (dd.totals.bookedTEU !== r.bookedTEU || dd.totals.peakUtilisationPct !== r.peakUtilisationPct || dd.totals.openVoyages !== r.openVoyages) errs.push('totals differ from level 1');
      for (const b of dd.rounds) {
        const cap = await capOf(String(b.round._id));
        const byId = new Map((cap.voyages || []).map((x) => [String(x.voyageId), x]));
        if (b.totals.bookedTEU !== b.voyages.reduce((s, v) => s + v.loadedTEU, 0)) errs.push(`round ${b.round.roundNumber} total`);
        for (const v of b.voyages) {
          const e = byId.get(String(v._id));
          if ((e?.loadedTEU || 0) !== v.loadedTEU || (e?.utilisationPct ?? null) !== v.utilisationPct || (e?.remainingTEU ?? null) !== v.remainingTEU) errs.push(`voyage ${v.voyageNumber} numbers`);
          if (!v.polId?.name || !v.podId?.name) errs.push(`voyage ${v.voyageNumber} ports`);
        }
      }
    }
    if (!errs.length) l2Ok += 1; else check(`vessel ${r.vesselCode} level 2`, false, errs.join('; '));
  }
  check(`level 2 of all ${rows.length} listed vessels is consistent with level 1 and the capacity engine`, l2Ok === rows.length, `${l2Ok}/${rows.length}`);
  const unlisted = allVessels.find((v) => !expectVessels.has(String(v._id)));
  if (unlisted) {
    const d = await admin.get(`/voyages/vessel-overview/${unlisted._id}`);
    check('a vessel with no open round returns 200 with no rounds', d.status === 200 && d.data.rounds.length === 0 && d.data.totals.openVoyages === 0, `${d.status}`);
  }
  check('invalid vessel id -> 400', (await admin.get('/voyages/vessel-overview/nope')).status === 400);
  check('unknown vessel id -> 404', (await admin.get('/voyages/vessel-overview/000000000000000000000000')).status === 404);

  // ── 5. permissions ───────────────────────────────────────────────────────
  section('5. Permissions');
  const tracking = await new Client().login('tracking@logistics.com', PASS);
  if (tracking) {
    const t1 = await tracking.get('/voyages/vessel-overview');
    check('a user with voyages:read only (tracking) gets level 1 with numbers (no rounds:read needed)', t1.status === 200 && same((t1.data || []).map((r) => r.bookedTEU), (await admin.get('/voyages/vessel-overview')).data.map((r) => r.bookedTEU)), `${t1.status} ${t1.message}`);
    if (rows.length) check('...and level 2', (await tracking.get(`/voyages/vessel-overview/${rows[0].vesselId}`)).status === 200);
  } else note('tracking@logistics.com not available: skipped');
  const partner = await new Client().login('partner@logistics.com', PASS);
  if (partner) check('a partner user is refused (bookings only)', (await partner.get('/voyages/vessel-overview')).status === 403 && (await partner.get('/voyages/vessel-overview/000000000000000000000000')).status === 403);
  else note('partner@logistics.com not available: skipped');
  const anon = await fetch(`${BASE}/voyages/vessel-overview`);
  check('no cookie -> 401', anon.status === 401, `${anon.status}`);

  // ── 6. Bookings summaries (Sprint C1) ───────────────────────────────────
  section('6. Bookings: vessel-summary / round-summary (C1)');
  const TABS = ['estimated', 'operational', 'discharged', 'remaining'];
  const STAT = { open: ['Planned', 'Active'], all: ['Planned', 'Active', 'Completed'] };
  const closedDefault = (t) => t === 'discharged' || t === 'remaining';
  const allRounds = await db.collection('rounds').find({}).project({ vesselId: 1, status: 1 }).toArray();
  const allVoyages = await db.collection('voyages').find({}).project({ roundId: 1, status: 1 }).toArray();
  const bookingIds = async (tab, extra = {}) => {
    const q = { ...extra };
    if (tab === 'discharged') q.dischargeStatus = 'Discharged';
    if (tab === 'remaining') q.dischargeStatus = 'Remaining';
    return (await db.collection(tab === 'estimated' ? 'manualbookings' : 'bookings').distinct('voyageId', q)).map(String);
  };
  // which vessels the DB says should be listed
  const expectedVessels = async (tab, closed, extra = {}, zero = true) => {
    const rs = allRounds.filter((r) => STAT[closed ? 'all' : 'open'].includes(r.status));
    const withBk = new Set(await bookingIds(tab, extra));
    const out = new Set();
    for (const r of rs) {
      const vs = allVoyages.filter((v) => String(v.roundId) === String(r._id));
      const has = vs.some((v) => withBk.has(String(v._id)));
      const live = vs.some((v) => v.status !== 'Cancelled');
      if (has || (zero && (tab === 'estimated' || tab === 'operational') && live)) out.add(String(r.vesselId));
    }
    return out;
  };
  const vs = (tab, q = '') => admin.get(`/bookings/vessel-summary?tab=${tab}&limit=100${q}`);
  const rs = (tab, q = '') => admin.get(`/bookings/round-summary?tab=${tab}&limit=100${q}`);
  const sumOf = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const cents = (n) => Math.round(n * 100) / 100;

  for (const tab of TABS) {
    const def = await vs(tab);
    check(`${tab}: vessel-summary 200 with the paginated shape`, def.status === 200 && Array.isArray(def.data) && def.body?.pagination?.total === def.data.length, `${def.status} ${def.message}`);
    check(`${tab}: includeClosed defaults to ${closedDefault(tab)} (owner decision D6)`, def.body?.pagination?.includeClosed === closedDefault(tab), JSON.stringify(def.body?.pagination));
    for (const closed of [false, true]) {
      const r = await vs(tab, `&includeClosed=${closed ? 1 : 0}`);
      check(`${tab}: includeClosed=${closed ? 1 : 0} is honoured (explicit value wins)`, r.body?.pagination?.includeClosed === closed);
      const got = [...new Set((r.data || []).map((x) => String(x.vesselId)))].sort();
      const want = [...await expectedVessels(tab, closed)].sort();
      check(`${tab}, ${closed ? 'with' : 'without'} completed rounds: lists exactly the vessels the DB expects (${want.length})`, same(got, want), `got ${got.length}, expected ${want.length}`);
      check(`${tab}: ${closed ? 'with' : 'without'} completed rounds no Cancelled round or vessel-less row`, (r.data || []).every((x) => x.vesselName && x.vesselCode));
      if (tab === 'discharged' || tab === 'remaining') check(`${tab}: only vessels that have such bookings (every row > 0)`, (r.data || []).every((x) => x.bookings > 0));
    }
  }

  // every level adds up to the next one down, and to the existing lists
  for (const tab of TABS) {
    const closed = 1;
    const v = await vs(tab, `&includeClosed=${closed}`);
    const bad = [];
    let roundsChecked = 0;
    for (const row of v.data || []) {
      const r = await rs(tab, `&vesselId=${row.vesselId}&includeClosed=${closed}`);
      if (r.status !== 200) { bad.push(`${row.vesselCode} round-summary ${r.status}`); continue; }
      if (r.data.length !== row.rounds || sumOf(r.data, 'bookings') !== row.bookings || sumOf(r.data, 'totalTEU') !== row.totalTEU || cents(sumOf(r.data, 'totalFreight')) !== row.totalFreight || sumOf(r.data, 'voyages') !== row.voyages) bad.push(`${row.vesselCode} rounds do not add up to the vessel row`);
      for (const rd of r.data) {
        roundsChecked += 1;
        const listPath = tab === 'estimated' ? '/bookings/manual' : '/bookings';
        const dis = tab === 'discharged' ? '&dischargeStatus=Discharged' : tab === 'remaining' ? '&dischargeStatus=Remaining' : '';
        const list = await admin.get(`${listPath}?roundId=${rd.roundId}&limit=1${dis}`);
        if (list.body?.pagination?.total !== rd.bookings) bad.push(`${rd.roundNumber}: list says ${list.body?.pagination?.total}, row says ${rd.bookings}`);
        const vsum = await admin.get(`/bookings/voyage-summary?tab=${tab}&roundId=${rd.roundId}&limit=100`);
        const vrows = vsum.data || [];
        if (sumOf(vrows, 'bookings') !== rd.bookings || sumOf(vrows, 'totalTEU') !== rd.totalTEU || cents(sumOf(vrows, 'totalFreight')) !== rd.totalFreight) bad.push(`${rd.roundNumber}: voyage-summary rows differ`);
        if (rd.vesselId == null || String(rd.vesselId) !== String(row.vesselId) || rd.vesselName !== row.vesselName) bad.push(`${rd.roundNumber}: vessel info`);
      }
    }
    check(`${tab}: vessel row = sum of its round rows = the booking list totals = the voyage-summary rows (${(v.data || []).length} vessels, ${roundsChecked} rounds)`, bad.length === 0, bad.slice(0, 4).join(' | '));
  }

  // zero rows (D7), filters and the one-round deep link
  const op = await vs('operational');
  check('operational: a vessel/round with no bookings is still listed (so booking can start there)', (op.data || []).some((x) => x.bookings === 0));
  const opRounds = (await Promise.all((op.data || []).map((x) => rs('operational', `&vesselId=${x.vesselId}`)))).flatMap((x) => x.data || []);
  check('operational: round rows carry round number, status, vessel and counts', opRounds.length > 0 && opRounds.every((x) => x.roundNumber && x.roundStatus && x.vesselName && typeof x.bookings === 'number' && typeof x.voyages === 'number'));
  check('open rounds only without includeClosed: no Completed round in the list', opRounds.every((x) => ['Planned', 'Active'].includes(x.roundStatus)));
  check('Active round is listed first within its vessel', (op.data || []).every((x) => {
    const mine = opRounds.filter((r) => String(r.vesselId) === String(x.vesselId));
    return mine.length < 2 || mine.findIndex((r) => r.roundStatus === 'Active') <= 0;
  }));
  const hit = opRounds[0];
  if (hit) {
    const one = await rs('operational', `&roundId=${hit.roundId}`);
    check('round-summary with only a roundId returns that one round (deep link)', one.status === 200 && one.data.length === 1 && String(one.data[0].roundId) === String(hit.roundId));
  }
  const ex = await vs('estimated');
  const withBk = (ex.data || []).find((x) => x.bookings > 0);
  const nonsense = await vs('estimated', `&search=${encodeURIComponent('zz(no[such')}`);
  check('a search with regex characters returns an empty page, zero rows dropped (no 500)', nonsense.status === 200 && nonsense.data.length === 0);
  const cancelled = await vs('estimated', '&status=Cancelled');
  check('a booking filter (status) drops the zero rows: every row has bookings', cancelled.status === 200 && cancelled.data.every((x) => x.bookings > 0));
  if (withBk) {
    const anyBooking = await db.collection('manualbookings').findOne({ voyageId: { $in: allVoyages.map((v) => v._id) } });
    if (anyBooking) {
      const byAgent = await vs('estimated', `&agentId=${anyBooking.agentId}`);
      check('agent filter keeps only vessels with that agent\'s bookings and never exceeds the unfiltered total', byAgent.status === 200 && byAgent.data.every((x) => x.bookings > 0) && sumOf(byAgent.data, 'bookings') <= sumOf(ex.data, 'bookings'));
    }
  }
  const p1 = await admin.get('/bookings/vessel-summary?tab=operational&limit=1&page=1');
  check('paging: limit=1 gives one row and the full total', p1.data.length === 1 && p1.body.pagination.total === op.data.length && p1.body.pagination.totalPages === op.data.length, JSON.stringify(p1.body?.pagination));
  check('invalid tab -> 400 (vessel and round)', (await admin.get('/bookings/vessel-summary?tab=nope')).status === 400 && (await admin.get('/bookings/round-summary?tab=nope&vesselId=000000000000000000000000')).status === 400);
  check('missing tab -> 400', (await admin.get('/bookings/vessel-summary')).status === 400);
  check('round-summary without vesselId or roundId -> 400', (await admin.get('/bookings/round-summary?tab=operational')).status === 400);
  check('invalid vessel / round id -> 400', (await admin.get('/bookings/round-summary?tab=operational&vesselId=nope')).status === 400 && (await admin.get('/bookings/round-summary?tab=operational&roundId=nope')).status === 400);
  check('unknown vessel -> 200 with no rows', (await rs('operational', '&vesselId=000000000000000000000000')).data.length === 0);
  check('the old voyage-summary endpoint still works', (await admin.get('/bookings/voyage-summary?tab=operational')).status === 200);
  check('routes are not shadowed by /:id (vessel-summary / round-summary are not read as booking ids)', op.status === 200 && (await rs('operational', `&roundId=${hit?.roundId || '000000000000000000000000'}`)).status === 200);
  check('no cookie -> 401', (await fetch(`${BASE}/bookings/vessel-summary?tab=operational`)).status === 401 && (await fetch(`${BASE}/bookings/round-summary?tab=operational&vesselId=x`)).status === 401);

  // export from level 3: the Excel export accepts a roundId (all voyages of the round); an explicit voyage wins
  for (const [tab, mod, listPath] of [['operational', 'bookings', '/bookings'], ['estimated', 'manualBookings', '/bookings/manual']]) {
    const withBookings = (await Promise.all((await vs(tab, '&includeClosed=1')).data.map((x) => rs(tab, `&vesselId=${x.vesselId}&includeClosed=1`)))).flatMap((x) => x.data || []).find((x) => x.bookings > 0);
    if (!withBookings) { note(`no round with ${tab} bookings: export check skipped`); continue; }
    const e = await admin.exportCount(mod, { roundId: String(withBookings.roundId) });
    check(`export ${mod} with roundId = the ${withBookings.bookings} rows of round ${withBookings.roundNumber}`, e.status === 200 && e.count === withBookings.bookings, `${e.status} count=${e.count}`);
    const total = (await admin.get(`${listPath}?limit=1`)).body.pagination.total;
    check(`export ${mod} with roundId is narrower than the unfiltered export (${total} rows)`, withBookings.bookings <= total && (await admin.exportCount(mod, {})).count === total);
    const oneVoy = (await admin.get(`${listPath}?roundId=${withBookings.roundId}&limit=1`)).data[0];
    if (oneVoy) {
      const vid = String(oneVoy.voyageId?._id || oneVoy.voyageId);
      const n = (await admin.get(`${listPath}?voyageId=${vid}&limit=1`)).body.pagination.total;
      check(`export ${mod}: an explicit voyageId wins over roundId`, (await admin.exportCount(mod, { roundId: String(withBookings.roundId), voyageId: vid })).count === n);
    }
  }

  // partner user: only their own partner's bookings, no zero rows
  const partnerUser = await db.collection('users').findOne({ email: 'partner@logistics.com' });
  const partnerClient = await new Client().login('partner@logistics.com', PASS);
  if (partnerUser?.partnerId && partnerClient) {
    for (const tab of ['estimated', 'operational']) {
      const r = await partnerClient.get(`/bookings/vessel-summary?tab=${tab}&limit=100`);
      const rows = r.data || [];
      const rounds = allRounds.filter((x) => STAT.open.includes(x.status));
      const vids = allVoyages.filter((v) => rounds.some((x) => String(x._id) === String(v.roundId))).map((v) => v._id);
      const own = await db.collection(tab === 'estimated' ? 'manualbookings' : 'bookings').countDocuments({ voyageId: { $in: vids }, partnerId: partnerUser.partnerId });
      check(`partner user, ${tab}: 200, no zero rows, total = their own partner's bookings in open rounds (${own})`, r.status === 200 && rows.every((x) => x.bookings > 0) && sumOf(rows, 'bookings') === own, `${r.status} rows=${rows.length} sum=${sumOf(rows, 'bookings')} own=${own}`);
      const staff = await vs(tab);
      check(`partner user, ${tab}: sees no more than staff (vessels are a subset, totals never larger)`, rows.every((x) => (staff.data || []).some((s) => String(s.vesselId) === String(x.vesselId) && x.bookings <= s.bookings)));
      if (rows[0]) {
        const rr = await partnerClient.get(`/bookings/round-summary?tab=${tab}&vesselId=${rows[0].vesselId}`);
        check(`partner user, ${tab}: round-summary adds up to the vessel row`, rr.status === 200 && sumOf(rr.data, 'bookings') === rows[0].bookings);
      }
    }
  } else note('partner@logistics.com has no partner assigned or is not available: partner checks skipped');
  await mongoose.disconnect();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
