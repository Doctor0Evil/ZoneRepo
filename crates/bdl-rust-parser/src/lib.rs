use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct BdlMeta {
    pub version: u32,
    pub encoding: String,
    pub endianness: String,
    pub framingType: String,
    pub schemaName: String,
    pub sampleLength: u32,
    pub safetyFlags: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RawBlobAst {
    pub kind: String,
    pub length: usize,
    pub sha256: String,
    pub entropyBitsPerByte: f64,
}

#[derive(Debug, Serialize)]
pub struct TlvFrame {
    pub index: usize,
    pub offset: usize,
    pub r#type: u8,
    pub length: u8,
    pub valueHex: String,
}

#[derive(Debug, Serialize)]
pub struct TlvSequenceAst {
    pub kind: String,
    pub frames: Vec<TlvFrame>,
    pub remainderBytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Ast {
    Tlv(TlvSequenceAst),
    Raw(RawBlobAst),
}

pub fn parse_bdl_block(markdown: &str) -> Result<(BdlMeta, Ast), String> {
    let meta = extract_meta(markdown)?;
    let bytes = extract_bytes(markdown, &meta.encoding)?;
    let ast = parse_with_schema(&meta, &bytes)?;
    Ok((meta, ast))
}

fn extract_meta(markdown: &str) -> Result<BdlMeta, String> {
    let line = markdown
        .lines()
        .find(|l| l.trim_start().starts_with("// BDL-META:"))
        .ok_or_else(|| "BDL-META header not found".to_string())?;
    let json_part = line.splitn(2, "// BDL-META:").nth(1).unwrap().trim_start();
    let meta: BdlMeta = serde_json::from_str(json_part)
        .map_err(|e| format!("Invalid BDL-META JSON: {e}"))?;
    if meta.version != 1 {
        return Err(format!("Unsupported BDL-META version: {}", meta.version));
    }
    if meta.encoding.is_empty() {
        return Err("BDL-META missing encoding".to_string());
    }
    Ok(meta)
}

fn extract_bytes(markdown: &str, encoding: &str) -> Result<Vec<u8>, String> {
    let re = regex::Regex::new(r"```([A-Za-z0-9]+)\r?\n([\s\S]*?)```")
        .map_err(|e| e.to_string())?;
    let caps = re
        .captures(markdown)
        .ok_or_else(|| "Code fence with binary body not found".to_string())?;
    let lang = caps.get(1).unwrap().as_str().to_lowercase();
    let body = caps.get(2).unwrap().as_str();

    match encoding {
        "hex" => {
            if lang != "hex" {
                return Err(format!("Expected hex fence, got {lang}"));
            }
            let mut hex = String::new();
            for line in body.lines() {
                let before_gutter = line.split('|').next().unwrap_or("");
                let without_offset = regex::Regex::new(r"^[0-9a-fA-F]+\s+")
                    .unwrap()
                    .replace(before_gutter, "");
                hex.push_str(&without_offset);
                hex.push(' ');
            }
            let clean = hex.replace(|c: char| !c.is_ascii_hexdigit(), "");
            if clean.len() % 2 != 0 {
                return Err("Odd-length hex body".to_string());
            }
            hex::decode(clean).map_err(|e| format!("Hex decode error: {e}"))
        }
        "base64" => {
          if lang != "base64" {
              return Err(format!("Expected base64 fence, got {lang}"));
          }
          let b64: String = body.chars().filter(|c| !c.is_whitespace()).collect();
          base64::decode(b64).map_err(|e| format!("Base64 decode error: {e}"))
        }
        other => Err(format!("Unsupported encoding: {other}")),
    }
}

fn parse_with_schema(meta: &BdlMeta, bytes: &[u8]) -> Result<Ast, String> {
    if meta.schemaName == "ExampleTLV" {
        Ok(Ast::Tlv(parse_example_tlv(bytes)))
    } else {
        Ok(Ast::Raw(parse_raw_blob(bytes)))
    }
}

fn parse_example_tlv(bytes: &[u8]) -> TlvSequenceAst {
    let mut frames = Vec::new();
    let mut offset = 0usize;
    let mut index = 0usize;

    while offset + 2 <= bytes.len() && frames.len() < 64 {
        let t = bytes[offset];
        let len = bytes[offset + 1];
        let start = offset + 2;
        let end = start + len as usize;
        if end > bytes.len() {
            break;
        }
        let value = &bytes[start..end];
        frames.push(TlvFrame {
            index,
            offset,
            r#type: t,
            length: len,
            valueHex: hex::encode(value),
        });
        offset = end;
        index += 1;
    }

    TlvSequenceAst {
        kind: "tlv-sequence".to_string(),
        frames,
        remainderBytes: bytes.len() - offset,
    }
}

fn parse_raw_blob(bytes: &[u8]) -> RawBlobAst {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    RawBlobAst {
        kind: "raw-blob".to_string(),
        length: bytes.len(),
        sha256: hex::encode(digest),
        entropyBitsPerByte: estimate_entropy(bytes),
    }
}

fn estimate_entropy(bytes: &[u8]) -> f64 {
    if bytes.is_empty() {
        return 0.0;
    }
    let mut counts = [0usize; 256];
    for &b in bytes {
        counts[b as usize] += 1;
    }
    let mut entropy = 0.0;
    for &c in &counts {
        if c == 0 {
            continue;
        }
        let p = c as f64 / bytes.len() as f64;
        entropy -= p * p.log2();
    }
    entropy
}
