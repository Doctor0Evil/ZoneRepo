use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EthicalCeiling {
    pub max_fear_index_node: f64,
    pub max_eco_damage_node: f64,
    pub forbid_irreversible_bio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcoBudget {
    pub max_eco_fear_node: f64,
    pub max_energy_kwh_per_day: f64,
    pub region_profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentEnvelope {
    pub transcript_root: String,
    pub workspace_hash: String,
    pub fear_index_max: f64,
    pub eco_fear_max: f64,
    pub fairness_score: f64,
    pub issuer_did: String,
    pub additional_signers: Vec<String>,
    pub envelope_hash: String,
    pub anchors: Vec<LedgerAnchor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerAnchor {
    pub chain: String,
    pub network: String,
    pub tx_hash: String,
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyCertificate {
    pub certificate_id: String,
    pub ethical_ceiling: SafetyCeilingParams,
    pub anchors: Vec<LedgerAnchor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyCeilingParams {
    pub tau_p: f64,
    pub tau_f: f64,
    pub tau_e: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuromorphicPolicyAttestationSpec {
    pub cluster_id: String,
    pub namespace: String,
    pub helm_release: Option<String>,
    pub node_class: String,
    pub telemetry_contract_id: Option<String>,
    pub bci_coupling: f64,
    pub eco_budget: EcoBudget,
    pub ethical_ceiling: EthicalCeiling,
    pub consent_envelope: ConsentEnvelope,
    pub safety_certificate: SafetyCertificate,
}

/// Node-level metrics derived from telemetry and resource requests.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuromorphicNodeMetrics {
    pub fear_index_node: f64,
    pub eco_fear_node: f64,
    pub irreversible_bio_risk: bool,
    pub power_watts: f64,
    pub energy_kwh_per_day: f64,
    pub telemetry_flags: HashMap<String, f64>,
}

/// Decision returned to the admission controller.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub reason: String,
}

pub trait DidLedgerVerifier {
    fn verify_consent_envelope(&self, env: &ConsentEnvelope) -> anyhow::Result<()>;
    fn verify_safety_certificate(&self, cert: &SafetyCertificate) -> anyhow::Result<()>;
}

/// Core check: ethical ceiling as a hard machine-enforced predicate.
pub fn evaluate_neuromorphic_transition(
    spec: &NeuromorphicPolicyAttestationSpec,
    metrics: &NeuromorphicNodeMetrics,
    verifier: &dyn DidLedgerVerifier,
) -> PolicyDecision {
    // 1. Ledger / DID checks (multi-sig, hash anchoring).
    if let Err(e) = verifier.verify_consent_envelope(&spec.consent_envelope) {
        return PolicyDecision {
            allowed: false,
            reason: format!("consent envelope verification failed: {e}"),
        };
    }
    if let Err(e) = verifier.verify_safety_certificate(&spec.safety_certificate) {
        return PolicyDecision {
            allowed: false,
            reason: format!("safety certificate verification failed: {e}"),
        };
    }

    // 2. Enforce BCI / irreversible bio ceilings.
    if spec.ethical_ceiling.forbid_irreversible_bio && metrics.irreversible_bio_risk {
        return PolicyDecision {
            allowed: false,
            reason: "irreversible bio-risk detected for node; forbidden by ceiling".into(),
        };
    }
    // Explicit hard clamp: bciCoupling > 0.3 is denied under current Phoenix profile.
    if spec.bci_coupling > 0.3 {
        return PolicyDecision {
            allowed: false,
            reason: format!(
                "bciCoupling {} exceeds Phoenix RoH/BCI ceiling of 0.3",
                spec.bci_coupling
            ),
        };
    }

    // 3. FearIndex and eco-fear ceilings (monotone, no rollbacks).
    if metrics.fear_index_node > spec.ethical_ceiling.max_fear_index_node {
        return PolicyDecision {
            allowed: false,
            reason: format!(
                "fearIndexNode {:.3} exceeds ceiling {:.3}",
                metrics.fear_index_node, spec.ethical_ceiling.max_fear_index_node
            ),
        };
    }
    if metrics.eco_fear_node > spec.ethical_ceiling.max_eco_damage_node {
        return PolicyDecision {
            allowed: false,
            reason: format!(
                "ecoFearNode {:.3} exceeds ceiling {:.3}",
                metrics.eco_fear_node, spec.ethical_ceiling.max_eco_damage_node
            ),
        };
    }
    if metrics.eco_fear_node > spec.eco_budget.max_eco_fear_node {
        return PolicyDecision {
            allowed: false,
            reason: format!(
                "ecoFearNode {:.3} exceeds ecoBudget {:.3}",
                metrics.eco_fear_node, spec.eco_budget.max_eco_fear_node
            ),
        };
    }
    if metrics.energy_kwh_per_day > spec.eco_budget.max_energy_kwh_per_day {
        return PolicyDecision {
            allowed: false,
            reason: format!(
                "energy {:.3} kWh/day exceeds ecoBudget {:.3} kWh/day",
                metrics.energy_kwh_per_day, spec.eco_budget.max_energy_kwh_per_day
            ),
        };
    }

    PolicyDecision {
        allowed: true,
        reason: "within neuromorphic ethical ceiling and eco budget".into(),
    }
}
