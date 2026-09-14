#!/usr/bin/env node
/*
 * Rebuild app/seed.json from an export of the live board.
 *
 * The shared board lives in the Claude artifact's document store, which only
 * the Claude viewer can reach. The GitHub Pages copy has no such store, so it
 * boots from app/seed.json instead. This keeps the two in step:
 *
 *   1. Export the live collections to a directory, one JSON file per document,
 *      nested by collection (the artifact read_db `out_dir` layout).
 *   2. node tools/assemble-seed.js <that directory>
 *
 * Progress (who ticked what) is deliberately NOT carried: those are live ticks,
 * and freezing one evening's checkmarks into every new visitor's board would be
 * misleading. Setup is carried in full.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/assemble-seed.js <export-dir>');
  process.exit(1);
}

const readCollection = (name) => {
  const dir = path.join(src, name);
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [path.basename(f, '.json'),
                   JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))])
  );
};

const config = readCollection('config');
const seed = {
  exportedAt: new Date().toISOString().slice(0, 10),
  config: { house: config.house || null, reminders: config.reminders || null },
  chores: readCollection('chores'),
  updates: readCollection('updates'),
  absences: readCollection('absences'),
  occurrences: {}
};

if (!seed.config.house) {
  console.error('no config/house in the export — refusing to write an empty seed');
  process.exit(1);
}

const out = path.join(__dirname, '..', 'app', 'seed.json');
fs.writeFileSync(out, JSON.stringify(seed, null, 2) + '\n');
console.log(`app/seed.json  ${Object.keys(seed.chores).length} chores, ` +
  `${Object.keys(seed.updates).length} special tasks, ` +
  `${(seed.config.reminders?.groups || []).reduce((n, g) => n + g.items.length, 0)} reminders`);
