use crate::core::id::{AgentId, RegionId, ConceptId};
use crate::policy::PolicyContext;
use crate::world::WorldView;

#[derive(Debug, Clone)]
pub struct AgentAttributes {
    pub age: u8,
    pub income_level: f32,
    pub risk_tolerance: f32, // 0..1
    pub mobility_score: f32, // 0..1
    pub eco_values: f32,     // 0..1 (nature-first concern)
}

#[derive(Debug, Clone)]
pub struct AgentBeliefs {
    pub openness_to_change: f32, // 0..1
    pub trust_in_institutions: f32,
    pub tech_skepticism: f32,
}

#[derive(Debug, Clone)]
pub struct AgentState {
    pub region: RegionId,
    pub adopted_concepts: Vec<ConceptId>,
    pub fatigue: f32,  // 0..1
    pub fear_level: f32, // 0..1 (per-agent fear)
}

#[derive(Debug, Clone)]
pub struct Agent {
    pub id: AgentId,
    pub attrs: AgentAttributes,
    pub beliefs: AgentBeliefs,
    pub state: AgentState,
}

impl Agent {
    /// Decide actions for this tick: move, adopt, share, etc.
    pub fn step(
        &mut self,
        tick: Tick,
        world: &WorldView,
        policy: &PolicyContext,
        rng: &mut impl rand::Rng,
    ) -> Vec<AgentAction> {
        let mut actions = Vec::new();

        // 1. Movement decision (simplified)
        if rng.gen::<f32>() < self.attrs.mobility_score {
            if let Some(new_region) = world.sample_neighbor_region(self.state.region, rng) {
                actions.push(AgentAction::Move {
                    agent_id: self.id,
                    from: self.state.region,
                    to: new_region,
                });
            }
        }

        // 2. Concept adoption/share decisions
        for concept in world.visible_concepts(self.state.region) {
            // Check policy: is exposure/adoption allowed here?
            if !policy.is_exposure_allowed(concept.id, self.state.region, tick) {
                continue;
            }

            let exposure_intensity =
                world.local_exposure_intensity(concept.id, self.state.region);

            let p_adopt = adoption_probability(self, concept, exposure_intensity, policy);
            if rng.gen::<f32>() < p_adopt {
                if !self.state.adopted_concepts.contains(&concept.id) {
                    actions.push(AgentAction::Adopt {
                        agent_id: self.id,
                        concept_id: concept.id,
                    });
                }
            }

            // Optionally share concept (word-of-mouth)
            let p_share = p_adopt * 0.5;
            if rng.gen::<f32>() < p_share {
                actions.push(AgentAction::Share {
                    agent_id: self.id,
                    concept_id: concept.id,
                    region: self.state.region,
                });
            }
        }

        actions
    }
}

#[derive(Debug, Clone)]
pub enum AgentAction {
    Move { agent_id: AgentId, from: RegionId, to: RegionId },
    Adopt { agent_id: AgentId, concept_id: ConceptId },
    Share { agent_id: AgentId, concept_id: ConceptId, region: RegionId },
}

// Simple adoption probability including fear-before-benefit
fn adoption_probability(
    agent: &Agent,
    concept: &crate::concept::Concept,
    exposure: f32,
    policy: &PolicyContext,
) -> f32 {
    // Base attractiveness vs controversy
    let mut score = concept.attrs.attractiveness - concept.attrs.controversy;

    // Agent openness and risk tolerance
    score += 0.5 * agent.beliefs.openness_to_change;
    score += 0.3 * agent.attrs.risk_tolerance;

    // Fear-first: discount by expected fear and ecological harm
    let fear_penalty = concept.risk_profile.expected_fear;
    let eco_penalty = concept.risk_profile.eco_harm_score;

    // Policy can add further penalty if near ethical ceiling
    let policy_penalty = policy.policy_penalty_for(concept.id);

    score -= 1.2 * fear_penalty;
    score -= 0.8 * eco_penalty;
    score -= policy_penalty;

    // Exposure intensity and local norms
    score += exposure;

    // Squash to [0,1]
    (1.0 / (1.0 + (-score).exp())).clamp(0.0, 1.0)
}
