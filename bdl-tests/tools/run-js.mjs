#!/usr/bin/env node
// Run JS BDL parser for a single corpus case directory.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBDL } from '../../src/bdl/jsParser.mjs'; // adjust if needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const [,, caseDirArg] = process.argv;
  if (!caseDirArg) {
    console.error('Usage: run-js.mjs /path/to/caseDir');
    process.exit(1);
  }

  const caseDir = path.resolve(__dirname, '..', caseDirArg.includes('/') ? caseDirArg.split('bdl-tests/').pop() : '..', caseDirArg);

  const descriptorPath = path.join(caseDir, 'descriptor.bdl.json');
  const samplePath = path.join(caseDir, 'sample.bin');

  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  const sample = fs.readFileSync(samplePath);

  let result;
  try {
    const parsed = parseBDL(descriptor, sample);
    result = { ok: true, ast: parsed };
  } catch (err) {
    result = {
      ok: false,
      error: {
        kind: err.name || 'ParseError',
        message: err.message || String(err),
        stack: (err && err.stack) || null
      }
    };
  }

  process.stdout.write(JSON.stringify(result, null, 2));
}

main();
