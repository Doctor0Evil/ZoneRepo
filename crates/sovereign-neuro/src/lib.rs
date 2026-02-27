use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FearIndex {
    pub value: f64,  // 0.0-1.0 normalized composite
    pub components: HashMap<String, f64>,  // ecology, systemic_harm, regret
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuroActionContext {
    pub hardware_profile: String,  // e.g., "Loihi-style"
    pub learning_rules: Vec<String>,  // e.g., ["STDP", "local_Hebb"]
    pub did: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernanceContext {
    pub nsc_hash: String,
    pub ethical_ceilings: HashMap<String, f64>,
}

pub trait NeuroPolicyEngine {
    fn evolution_allowed(&self, ctx: NeuroActionContext, gov: GovernanceContext) -> (bool, FearIndex);
}

#[derive(Debug, Clone)]
pub struct LuaNeuroPolicyEngine {
    // Lua integration placeholder, mirroring sovereign-cargo pattern[file:2]
}

impl NeuroPolicyEngine for LuaNeuroPolicyEngine {
    fn evolution_allowed(&self, _ctx: NeuroActionContext, _gov: GovernanceContext) -> (bool, FearIndex) {
        // Delegate to Lua kernel for FearIndex calc
        (true, FearIndex { value: 0.3, components: HashMap::new() })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuroSafetyCertificate {
    pub hardware_profile: String,
    pub fear_ceiling: FearIndex,
    pub ledger_anchor: String,  // Bostrom tx hash
    // Anchor full JSON hash to bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7[file:1]
}
