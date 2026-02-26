// Minimal JS reference parser for BDL-framed Markdown blocks.

import crypto from 'node:crypto';

export function parseBDLBlock(markdown) {
  const meta = extractMeta(markdown);
  const bytes = extractBytes(markdown, meta.encoding);
  const ast = parseWithSchema(meta, bytes);
  const structure = inferStructure(bytes);
  return { meta, ast, structure };
}

export function inferStructure(bytes) {
  // Very simple heuristic: detect TLV-like frames (type u8, length u8).
  const frames = [];
  let offset = 0;

  while (offset + 2 <= bytes.length && frames.length < 64) {
    const type = bytes[offset];
    const len = bytes[offset + 1];
    const start = offset + 2;
    const end = start + len;
    if (end > bytes.length) break;

    frames.push({
      kind: 'tlv-frame',
      offset,
      type,
      length: len
    });

    offset = end;
  }

  return {
    kind: 'structure-hints',
    tlvFramesDetected: frames.length > 0,
    frames
  };
}

function extractMeta(markdown) {
  const lines = markdown.split(/\r?\n/);
  const metaLine = lines.find((l) => l.trim().startsWith('// BDL-META:'));
  if (!metaLine) {
    throw new Error('BDL-META header not found');
  }
  const jsonPart = metaLine.split('// BDL-META:') [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_087ee436-ed96-4aa7-b4cd-2ad705cf500a/62401ed6-8cb8-4bbc-acfe-48d6334f9959/8lkc-oc-cz-t-3-cenic-hpib-2bn-jua_M.heQlqsJBywcDqoFw.md);
  let meta;
  try {
    meta = JSON.parse(jsonPart);
  } catch (e) {
    throw new Error(`Invalid BDL-META JSON: ${e.message}`);
  }
  if (meta.version !== 1) {
    throw new Error(`Unsupported BDL-META version: ${meta.version}`);
  }
  if (!meta.encoding) throw new Error('BDL-META missing encoding');
  return meta;
}

function extractBytes(markdown, encoding) {
  const fenceMatch = markdown.match(/```([a-zA-Z0-9]+)[\r\n]+([\s\S]*?)```/);
  if (!fenceMatch) {
    throw new Error('Code fence with binary body not found');
  }
  const lang = fenceMatch [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_087ee436-ed96-4aa7-b4cd-2ad705cf500a/62401ed6-8cb8-4bbc-acfe-48d6334f9959/8lkc-oc-cz-t-3-cenic-hpib-2bn-jua_M.heQlqsJBywcDqoFw.md).toLowerCase();
  const body = fenceMatch [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_087ee436-ed96-4aa7-b4cd-2ad705cf500a/96619e5e-bfea-4fc5-8931-043eb2c6f1fe/mapping-zonerepo-spatial-focus-QGgTsPImTkye86Xxw3Yp0w.md);

  if (encoding === 'hex') {
    if (lang !== 'hex') throw new Error(`Expected hex fence, got ${lang}`);
    const hex = body
      .split(/\r?\n/)
      .map((line) => line.split('|')[0])             // drop ASCII gutter
      .map((line) => line.replace(/^[0-9a-fA-F]+\s+/, '')) // drop offset
      .join(' ')
      .replace(/[^0-9a-fA-F]/g, '');
    if (hex.length % 2 !== 0) throw new Error('Odd-length hex body');
    return Buffer.from(hex, 'hex');
  }

  if (encoding === 'base64') {
    if (lang !== 'base64') throw new Error(`Expected base64 fence, got ${lang}`);
    const b64 = body.replace(/\s+/g, '');
    return Buffer.from(b64, 'base64');
  }

  throw new Error(`Unsupported encoding: ${encoding}`);
}

function parseWithSchema(meta, bytes) {
  // Only support one demo schema: ExampleTLV as in bdr-spec.
  if (meta.schemaName === 'ExampleTLV') {
    return parseExampleTLV(bytes);
  }
  // Fallback: raw blob with checksum and entropy.
  return {
    kind: 'raw-blob',
    length: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    entropyBitsPerByte: estimateEntropy(bytes)
  };
}

function parseExampleTLV(bytes) {
  const frames = [];
  let offset = 0;
  let index = 0;

  while (offset + 2 <= bytes.length && frames.length < 64) {
    const type = bytes[offset];
    const len = bytes[offset + 1];
    const start = offset + 2;
    const end = start + len;
    if (end > bytes.length) break;

    const value = bytes.slice(start, end);

    frames.push({
      index,
      offset,
      type,
      length: len,
      valueHex: value.toString('hex')
    });

    offset = end;
    index += 1;
  }

  return {
    kind: 'tlv-sequence',
    frames,
    remainderBytes: bytes.length - offset
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
