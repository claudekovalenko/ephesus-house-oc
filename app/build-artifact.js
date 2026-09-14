#!/usr/bin/env node
/*
 * The app in app/ is a complete standalone page any static host can serve.
 * Claude Artifacts supply their own document wrapper, so publishing needs the
 * same page with <!DOCTYPE>, <html>, <head> and <body> removed and the head's
 * contents hoisted to the top. This produces that file, so the two never drift.
 *
 *   node app/build-artifact.js  ->  dist/artifact.html
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const head = src.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/i)[1];

// charset and viewport come from the artifact wrapper; ours would be duplicates.
const keptHead = head
  .split('\n')
  .filter((l) => !/<meta\s+charset/i.test(l) && !/name="viewport"/i.test(l))
  .join('\n')
  .trim();

const out = keptHead + '\n' + body.trim() + '\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), out);
console.log('dist/artifact.html', out.length, 'bytes');
