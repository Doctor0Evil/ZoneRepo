use std::io::{Read, Write};

use anyhow::Result;
use neuromorphic_policy::{
    ConsentEnvelope, DidLedgerVerifier, LedgerAnchor, NeuromorphicNodeMetrics,
    NeuromorphicPolicyAttestationSpec, PolicyDecision, SafetyCertificate,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CliInput {
    spec: NeuromorphicPolicyAttestationSpec,
    metrics: NeuromorphicNodeMetrics,
}

/// Minimal, pluggable verifier; replace TODO sections with real DID/ledger checks.
struct StubDidLedgerVerifier;

impl DidLedgerVerifier for StubDidLedgerVerifier {
    fn verify_consent_envelope(&self, env: &ConsentEnvelope) -> Result<()> {
        if env.envelope_hash.is_empty() {
            anyhow::bail!("envelope_hash missing");
        }
        if env.anchors.is_empty() {
            anyhow::bail!("no ledger anchors on consent envelope");
        }
        // TODO: verify DID signatures and that tx contains envelope_hash.
        Ok(())
    }

    fn verify_safety_certificate(&self, cert: &SafetyCertificate) -> Result<()> {
        if cert.certificate_id.is_empty() {
            anyhow::bail!("certificate_id missing");
        }
        if cert.anchors.is_empty() {
            anyhow::bail!("no ledger anchors on safety certificate");
        }
        // TODO: verify anchors and link to your ALN/Googolswarm profile.
        Ok(())
    }
}

fn main() -> Result<()> {
    // Read JSON from stdin.
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf)?;

    let input: CliInput = serde_json::from_str(&buf)?;
    let verifier = StubDidLedgerVerifier;

    let decision: PolicyDecision = neuromorphic_policy::evaluate_neuromorphic_transition(
        &input.spec,
        &input.metrics,
        &verifier,
    );

    let mut out = std::io::BufWriter::new(std::io::stdout());
    serde_json::to_writer(&mut out, &decision)?;
    out.write_all(b"\n")?;
    Ok(())
}
