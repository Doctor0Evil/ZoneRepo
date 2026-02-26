#!/usr/bin/env node
// Normalize JSON to a canonical form: sorted object keys, stable formatting.

import fs from 'node:fs';

function readJson(path) {
  const txt = fs.readFileSync(path, 'utf8');
  return JSON.parse(txt);
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const out = {};
    for (const k of keys) {
      out[k] = normalize(value[k]);
    }
    return out;
  }
  return value;
}

function main() {
  const [,, inputPath] = process.argv;
  if (!inputPath) {
    console.error('Usage: normalize-json.mjs input.json > output.json');
    process.exit(1);
  }
  const json = readJson(inputPath);
  const norm = normalize(json);
  process.stdout.write(JSON.stringify(norm, null, 2));
}

main();
