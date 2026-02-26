#!/usr/bin/env node
// Strict SecretGuard: any suspicious value MUST be exactly "***masked***".
// If it looks like a secret and isn't masked, CI fails.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const BASE64_RE = /^[A-Za-z0-9+/=]{20,}$/;
const TOKEN_HINT_RE = /(secret|token|apikey|api_key|private_key|access_key|credential|passwd|password)/i;
const MASK_VALUE = '***masked***';

function isSuspiciousString(str) {
  if (typeof str !== 'string') return false;
  if (str.length < 16) return false;

  if (BASE64_RE.test(str)) return true;
  if (str.startsWith('ghp_') || str.startsWith('AKIA') || str.startsWith('sk-')) return true;

  return false;
}

function scanValue(value, pathSegments, findings) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanValue(v, pathSegments.concat(String(i)), findings));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      scanValue(v, pathSegments.concat(k), findings);
    }
    return;
  }

  if (typeof value !== 'string') return;

  const pathStr = pathSegments.join('.');

  // Only care about suspicious-looking strings
  if (!isSuspiciousString(value)) return;

  // If the field name hints secret-ness, enforce mask even harder
  const nameHint = TOKEN_HINT_RE.test(pathStr);

  if (value !== MASK_VALUE) {
    findings.push({
      path: pathStr,
      valuePreview: value.slice(0, 16) + '…',
      reason: nameHint
        ? 'field-name hints secret, but value is not masked'
        : 'value looks like a secret, but is not masked'
    });
  }
}

function scanFile(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  let json;
  try {
    json = JSON.parse(txt);
  } catch (e) {
    console.error(`::error::Failed to parse JSON in ${filePath}: ${e.message}`);
    return [{ path: '<parse>', valuePreview: 'invalid-json', reason: 'json-parse-error' }];
  }
  const findings = [];
  scanValue(json, [], findings);
  return findings;
}

function walkDir(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, cb);
    } else if (entry.isFile()) {
      cb(full);
    }
  }
}

function main() {
  const targets = [
    path.join(ROOT, 'bdl-tests', 'corpus'),
  ];

  let totalFindings = 0;

  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    walkDir(target, (file) => {
      if (!file.endsWith('.json')) return;
      const findings = scanFile(file);
      if (findings.length > 0) {
        findings.forEach((f) => {
          console.error(
            `::error file=${file}::Strict SecretGuard violation at ${f.path}: ${f.reason} (preview=${f.valuePreview})`
          );
        });
        totalFindings += findings.length;
      }
    });
  }

  if (totalFindings > 0) {
    console.error(
      `Strict SecretGuard: ${totalFindings} potential secrets are not masked as "${MASK_VALUE}".`
    );
    process.exit(1);
  } else {
    console.log('Strict SecretGuard: all suspicious values are correctly masked.');
  }
}

main();
