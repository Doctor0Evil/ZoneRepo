***

## 1. `bdr-spec.md` (BDL‑META v1 + examples)

**Path:** `specs/bdr-spec.md`

```md
# BDL-META v1 Specification

BDL (Binary Descriptor Language) is a Markdown-friendly framing convention for binary data. It uses:

- A JSON metadata header embedded in a comment.
- A fenced code block containing a hex or base64 body.
- Optional checksum footer.

## 1. BDL-META header

The metadata header is a single-line JSON object prefixed by `// BDL-META:` immediately before the code fence.

Example:

```
// BDL-META: {
  "version": 1,
  "encoding": "hex",
  "endianness": "little",
  "framingType": "tlv-sequence",
  "schemaName": "ExampleTLV",
  "sampleLength": 32,
  "safetyFlags": ["maskSecrets"],
  "tags": ["example", "network"]
}
```

### 1.1 Required fields

- `version` (integer): BDL metadata version. For this spec: `1`.
- `encoding` (string): `"hex"` or `"base64"`.
- `endianness` (string): `"little"`, `"big"`, or `"unspecified"`.
- `framingType` (string): descriptive label; recommended values include:
  - `"tlv-sequence"`, `"varint-sequence"`, `"fixed-header"`, `"raw"`.
- `schemaName` (string): logical name of the BDL descriptor to use.
- `sampleLength` (integer): number of bytes represented in the body.
- `safetyFlags` (array of strings): safety controls such as:
  - `"maskSecrets"`, `"noExec"`, `"pseudonymized"`.
- `tags` (array of strings, optional): free-form hints (e.g. `"tls"`, `"firmware"`).

Consumers MUST:

- Parse the JSON strictly.
- Treat unknown `safetyFlags` conservatively (fail-closed).

## 2. Code fence and body

The binary body MUST be inside a fenced code block with a language tag matching the encoding.

### 2.1 Hex encoding

- Language tag: `hex`.
- Body: one or more lines of hex dump, preferably:
  - 16 bytes per line.
  - Optional offset and ASCII gutter.

Example:

```hex
00000000  01 0A 00 08 48 65 6C 6C  6F 2C 20 57 6F 72 6C 64  |....Hello, World|
00000010  02 0B 00 05 54 65 73 74  00                       |....Test.      |
```

Parsers MUST ignore offsets and ASCII gutters and reconstruct the byte stream from the hex pairs.

### 2.2 Base64 encoding

- Language tag: `base64`.
- Body: base64 text, with or without line breaks.

Example:

```
// BDL-META: {
  "version": 1,
  "encoding": "base64",
  "endianness": "unspecified",
  "framingType": "raw",
  "schemaName": "ExampleBlob",
  "sampleLength": 24,
  "safetyFlags": ["maskSecrets"],
  "tags": ["example", "blob"]
}
```

```base64
AQoACkhlbGxvLCBXb3JsZCEBAg==
```

## 3. Optional checksum footer

An optional checksum footer may be added after the fenced block:

- Format: `CRC32: 0x12345678` (upper or lower hex allowed).
- Parsers MAY validate and report mismatches but MUST NOT depend on checksum presence.

Example:

```
CRC32: 0x12345678
```

## 4. Canonical examples

### 4.1 TLV sequence

```
// BDL-META: {
  "version": 1,
  "encoding": "hex",
  "endianness": "little",
  "framingType": "tlv-sequence",
  "schemaName": "ExampleTLV",
  "sampleLength": 32,
  "safetyFlags": ["maskSecrets"],
  "tags": ["example", "network"]
}
```

```hex
00000000  01 05 48 65 6C 6C 6F  02 03 57 6F 72           |..Hello..Wor|
00000010  03 01 21 00 00 00 00  00 00 00 00              |..!.......|
```

### 4.2 Fixed header

```
// BDL-META: {
  "version": 1,
  "encoding": "hex",
  "endianness": "big",
  "framingType": "fixed-header",
  "schemaName": "MagicHeaderV1",
  "sampleLength": 16,
  "safetyFlags": [],
  "tags": ["example", "header"]
}
```

```hex
00000000  CA FE BA BE 00 01 00 10  DE AD BE EF 00 00 00 01  |................|
```

### 4.3 Base64 chunk

(See section 2.2 example above.)

This `bdr-spec.md` defines BDL-META v1 and sufficient examples for interoperable parsers.
```

***
