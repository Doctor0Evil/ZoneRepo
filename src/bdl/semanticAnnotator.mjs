// Minimal semantic annotator: entropy + timestamp guess + magic constants.

const MAGIC_CONSTANTS = [
  { name: 'ipv4-header', valueHex: '4500' },
  { name: 'cafebabe', valueHex: 'cafebabe' }
];

export function annotateAst(meta, ast, bytes) {
  const fields = [];

  // Whole-blob entropy
  const entropy = estimateEntropy(bytes);
  fields.push({
    path: '$',
    role: entropy > 7.0 ? 'high-entropy' : 'low-entropy',
    confidence: 0.7
  });

  // Magic constants
  const prefixHex = bytes.slice(0, 4).toString('hex');
  for (const m of MAGIC_CONSTANTS) {
    if (prefixHex.startsWith(m.valueHex.toLowerCase())) {
      fields.push({
        path: '$.magic',
        role: m.name,
        confidence: 0.95
      });
    }
  }

  // Timestamp guess: check for any u64-like field in TLV frames whose value is plausible unix time.
  if (ast && ast.kind === 'tlv-sequence') {
    const nowSecs = Date.now() / 1000;
    ast.frames.forEach((frame, idx) => {
      const buf = Buffer.from(frame.valueHex, 'hex');
      if (buf.length === 8) {
        const v = buf.readBigUInt64BE(0);
        const n = Number(v);
        if (n > 946684800 && n < nowSecs + 10 * 365 * 24 * 3600) {
          fields.push({
            path: `$.frames[${idx}].value`,
            role: 'timestamp',
            confidence: 0.9
          });
        }
      }
    });
  }

  return {
    meta,
    ast,
    semantic: fields
  };
}

function estimateEntropy(bytes) {
  if (!bytes.length) return 0;
  const counts = new Array(256).fill(0);
  for (const b of bytes) counts[b] += 1;
  let entropy = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / bytes.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
