'use strict';

// S-09, one-off: drop the four old single-field location indexes that the compound indexes (added 2026-11-19 for the
// paginated lists) made redundant:  cities.countryId_1, ports.cityId_1, ports.countryId_1, terminals.portId_1.
//
//   node scripts/drop-old-location-indexes.js            dry run (default): lists what exists, drops nothing
//   node scripts/drop-old-location-indexes.js --apply    drops them
//
// TEST DATABASE ONLY. On any database other than "test" it refuses unless --allow-production AND --confirm-db <name>
// are both given (do NOT run it on production without checking first). Safe to run twice (a missing index is skipped).
// Before dropping, it checks that a compound index starting with the same field still exists, so a lookup by that
// field stays indexed; if not, that index is left alone.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const TARGETS = [
  { coll: 'cities', name: 'countryId_1', field: 'countryId' },
  { coll: 'ports', name: 'cityId_1', field: 'cityId' },
  { coll: 'ports', name: 'countryId_1', field: 'countryId' },
  { coll: 'terminals', name: 'portId_1', field: 'portId' },
];

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ALLOW_PROD = argv.includes('--allow-production');
const ci = argv.indexOf('--confirm-db');
const CONFIRM_DB = ci >= 0 ? argv[ci + 1] : null;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`Database "${dbName}" - ${APPLY ? 'APPLY' : 'dry run (add --apply to drop)'}`);

  if (APPLY && (dbName !== 'test' || process.env.NODE_ENV === 'production')) {
    if (!ALLOW_PROD || CONFIRM_DB !== dbName) {
      console.error(`Refused: "${dbName}" is not the TEST database. Pass --allow-production --confirm-db ${dbName} to drop here.`);
      await mongoose.disconnect(); process.exit(3);
    }
  }

  let dropped = 0;
  for (const t of TARGETS) {
    const label = `${t.coll}.${t.name}`;
    let indexes;
    try { indexes = await db.collection(t.coll).indexes(); } catch { console.log(`  skip  ${label}: collection not found`); continue; }
    const old = indexes.find((i) => i.name === t.name);
    if (!old) { console.log(`  skip  ${label}: not present (already dropped)`); continue; }
    const covered = indexes.some((i) => i.name !== t.name && Object.keys(i.key)[0] === t.field);
    if (!covered) { console.log(`  KEEP  ${label}: no compound index starts with ${t.field}, dropping it would leave that lookup unindexed`); continue; }
    if (!APPLY) { console.log(`  would drop  ${label}  (covered by a compound index)`); continue; }
    await db.collection(t.coll).dropIndex(t.name);
    dropped += 1;
    console.log(`  dropped  ${label}`);
  }
  console.log(APPLY ? `Done: ${dropped} index(es) dropped.` : 'Dry run only: nothing changed.');
  await mongoose.disconnect();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
