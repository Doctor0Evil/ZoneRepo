#!/usr/bin/env node

// Minimal SecretGuard-style masker for BDL neuromorphic logs.

const fs = require("fs");
const crypto = require("crypto");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Apply safety flags to a single BDL-framed record.
function maskRecord(rec) {
  const flags = new Set(rec.safetyFlags || []);

  const masked = JSON.parse(JSON.stringify(rec));

  // Always drop raw secrets-like fields.
  if (flags.has("maskSecrets")) {
    if (masked.payload && typeof masked.payload === "object") {
      for (const k of Object.keys(masked.payload)) {
        const lk = k.toLowerCase();
        if (
          lk.includes("secret") ||
          lk.includes("key") ||
          lk.includes("token") ||
          lk.includes("password")
        ) {
          masked.payload[k] = "[MASKED]";
        }
      }
    }
  }

  // No executable code: strip code blobs if flagged noExec.
  if (flags.has("noExec")) {
    if (masked.payload && typeof masked.payload === "object") {
      for (const k of Object.keys(masked.payload)) {
        const v = masked.payload[k];
        if (typeof v === "string" && /function|=>|#include|import /i.test(v)) {
          masked.payload[k] = "[CODE_REMOVED]";
        }
      }
    }
  }

  // Biosignal-sensitive: strip or aggregate fine-grained biophysical traces.
  if (flags.has("biosignalSensitive")) {
    if (masked.payload && masked.payload.biosignals) {
      const bios = masked.payload.biosignals;
      if (Array.isArray(bios)) {
        // Replace detailed time series with summary stats.
        const n = bios.length;
        const sum = bios.reduce((s, x) => s + (x.value || 0), 0);
        const mean = n > 0 ? sum / n : 0;
        masked.payload.biosignals = {
          count: n,
          meanValue: mean,
          hash: sha256(Buffer.from(JSON.stringify(bios))),
        };
      } else {
        masked.payload.biosignals = "[AGGREGATED]";
      }
    }
  }

  // Drop explicit PII-ish fields regardless of flags.
  const piiKeys = ["name", "email", "phone", "address", "ssn"];
  if (masked.payload && typeof masked.payload === "object") {
    for (const k of piiKeys) {
      if (Object.prototype.hasOwnProperty.call(masked.payload, k)) {
        masked.payload[k] = "[PII_REMOVED]";
      }
    }
  }

  return masked;
}

function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error("usage: secretguard-bdl-mask INPUT.jsonl OUTPUT.jsonl");
    process.exit(1);
  }

  const raw = fs.readFileSync(inPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const outLines = [];

  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      console.error("skip malformed line");
      continue;
    }
    const masked = maskRecord(rec);
    outLines.push(JSON.stringify(masked));
  }

  fs.writeFileSync(outPath, outLines.join("\n") + "\n", "utf8");
}

if (require.main === module) {
  main();
}
