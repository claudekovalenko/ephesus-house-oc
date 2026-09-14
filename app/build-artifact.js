#!/usr/bin/env node
/*
 * Claude Artifacts supply their own document wrapper, so publishing needs a page
 * with <!DOCTYPE>, <html>, <head> and <body> removed and the head's contents
 * hoisted to the top. This produces that file.
 *
 *   node app/build-artifact.js                    -> signpost/index.html
 *   node app/build-artifact.js app/index.html     -> the board itself
 *
 * The artifact is now only a signpost: the board itself lives on GitHub Pages,
 * where it can reach its database. Artifacts cannot make requests off-host.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const input = process.argv[2] || path.join(root, 'signpost', 'index.html');
const src = fs.readFileSync(input, 'utf8');

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
