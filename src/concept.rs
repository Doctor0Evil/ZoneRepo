use crate::core::id::ConceptId;

#[derive(Debug, Clone)]
pub struct ConceptAttributes {
    pub name: String,
    pub attractiveness: f32, // perceived benefit
    pub controversy: f32,    // perceived social risk
    pub resource_cost: f32,  // money/time/energy per use
}

#[derive(Debug, Clone)]
pub struct ConceptRiskProfile {
    pub expected_fear: f32,      // 0..1 (panic, regret, social harm)
    pub eco_harm_score: f32,     // 0..1 (ecological damage)
    pub data_abuse_risk: f32,    // 0..1 (privacy, surveillance)
    pub irreversible_bio_risk: f32, // 0..1 (hard ethical stop)
}

#[derive(Debug, Clone)]
pub struct Concept {
    pub id: ConceptId,
    pub attrs: ConceptAttributes,
    pub risk_profile: ConceptRiskProfile,
    pub legal_status: ConceptLegalStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConceptLegalStatus {
    Allowed,
    Restricted,
    Prohibited,
}
