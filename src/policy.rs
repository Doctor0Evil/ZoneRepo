use crate::core::id::{ConceptId, RegionId, Tick};

#[derive(Debug, Clone)]
pub struct EthicalCeiling {
    pub max_fear_index: f32,          // global 0..1
    pub max_eco_damage: f32,          // global 0..1
    pub forbid_irreversible_bio: bool,
}

#[derive(Debug, Clone)]
pub struct PolicyContext {
    pub ethical_ceiling: EthicalCeiling,
    // future: per-region rules, time windows, logging policies
}

impl PolicyContext {
    pub fn is_exposure_allowed(&self, concept_id: ConceptId, region: RegionId, _tick: Tick) -> bool {
        // Here you can implement fine-grained rules (curfews, bans, etc.)
        let _ = (concept_id, region);
        true
    }

    /// Extra penalty when concept risk profile is near/over ceilings.
    pub fn policy_penalty_for(&self, _concept_id: ConceptId) -> f32 {
        // In full implementation, look up concept, compare with ceilings
        0.0
    }
}
