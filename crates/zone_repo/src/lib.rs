use std::collections::HashMap;

// ---------- Core domain types ----------

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct AgentId(pub u64);

#[derive(Clone, Debug)]
pub struct Location {
    pub x: f64,
    pub y: f64,
    pub region_id: String, // neighborhood, city, etc.
}

#[derive(Clone, Debug)]
pub enum BeliefStrength {
    Weak,
    Moderate,
    Strong,
}

#[derive(Clone, Debug)]
pub struct Belief {
    pub key: String,          // e.g., "new_culture_X"
    pub strength: BeliefStrength,
}

#[derive(Clone, Debug)]
pub struct FearIndex {
    pub systemic_harm: f64,
    pub regret: f64,
    pub ecological_damage: f64,
}

impl FearIndex {
    pub fn total(&self) -> f64 {
        self.systemic_harm + self.regret + self.ecological_damage
    }
}

// ---------- Traits for simulation ----------

pub trait Agent {
    fn id(&self) -> AgentId;
    fn location(&self) -> &Location;
    fn beliefs(&self) -> &HashMap<String, Belief>;
    fn beliefs_mut(&mut self) -> &mut HashMap<String, Belief>;

    /// Called once per tick to let the agent update its state
    /// based on environment and policies.
    fn step<E: Environment, P: PolicyEngine>(
        &mut self,
        env: &E,
        policies: &P,
        dt: f64,
    );
}

pub trait Environment {
    fn get_time(&self) -> f64;
    fn get_region_population(&self, region_id: &str) -> usize;
    fn get_concept_intensity(&self, concept_key: &str, region_id: &str) -> f64;
}

pub trait PolicyEngine {
    /// Hard "ethical ceiling": if true, the transition is forbidden.
    fn is_transition_forbidden(
        &self,
        context: &PolicyContext,
    ) -> bool;

    /// Soft evaluation: increases or decreases fear index.
    fn evaluate_transition(
        &self,
        context: &PolicyContext,
    ) -> FearIndex;
}

// ---------- Policy context ----------

#[derive(Clone, Debug)]
pub struct PolicyContext<'a> {
    pub agent_id: AgentId,
    pub region_id: &'a str,
    pub concept_key: &'a str,
    pub current_belief: Option<&'a Belief>,
    pub proposed_strength: BeliefStrength,
    pub env_time: f64,
    pub region_population: usize,
    pub concept_intensity: f64,
}

// ---------- Concrete minimal types ----------

#[derive(Clone, Debug)]
pub struct HumanAgent {
    pub id: AgentId,
    pub location: Location,
    pub beliefs: HashMap<String, Belief>,
}

impl Agent for HumanAgent {
    fn id(&self) -> AgentId {
        self.id.clone()
    }

    fn location(&self) -> &Location {
        &self.location
    }

    fn beliefs(&self) -> &HashMap<String, Belief> {
        &self.beliefs
    }

    fn beliefs_mut(&mut self) -> &mut HashMap<String, Belief> {
        &mut self.beliefs
    }

    fn step<E: Environment, P: PolicyEngine>(
        &mut self,
        env: &E,
        policies: &P,
        dt: f64,
    ) {
        let _dt = dt;

        // Example: consider adopting or strengthening a belief in "new_concept"
        let concept_key = "new_concept";
        let region_population = env.get_region_population(&self.location.region_id);
        let intensity = env.get_concept_intensity(concept_key, &self.location.region_id);

        // Proposed new strength based on intensity (very simplistic)
        let proposed_strength = if intensity > 0.8 {
            BeliefStrength::Strong
        } else if intensity > 0.4 {
            BeliefStrength::Moderate
        } else {
            BeliefStrength::Weak
        };

        let current_belief = self.beliefs.get(concept_key);

        let ctx = PolicyContext {
            agent_id: self.id.clone(),
            region_id: &self.location.region_id,
            concept_key,
            current_belief,
            proposed_strength: proposed_strength.clone(),
            env_time: env.get_time(),
            region_population,
            concept_intensity: intensity,
        };

        // Check hard constraints
        if policies.is_transition_forbidden(&ctx) {
            return;
        }

        // Evaluate fear index (can be logged or aggregated externally)
        let _fear_index = policies.evaluate_transition(&ctx);

        // Apply the belief change if not forbidden
        self.beliefs.insert(
            concept_key.to_string(),
            Belief {
                key: concept_key.to_string(),
                strength: proposed_strength,
            },
        );
    }
}

pub struct World {
    pub time: f64,
    pub agents: Vec<HumanAgent>,
    pub region_populations: HashMap<String, usize>,
    pub concept_fields: HashMap<(String, String), f64>, // (concept_key, region_id) -> intensity
}

impl Environment for World {
    fn get_time(&self) -> f64 {
        self.time
    }

    fn get_region_population(&self, region_id: &str) -> usize {
        *self.region_populations.get(region_id).unwrap_or(&0)
    }

    fn get_concept_intensity(&self, concept_key: &str, region_id: &str) -> f64 {
        *self
            .concept_fields
            .get(&(concept_key.to_string(), region_id.to_string()))
            .unwrap_or(&0.0)
    }
}

// ---------- Simple policy engine skeleton ----------

pub struct ZoneRepoPolicyEngine {
    pub ethical_ceiling: f64,
}

impl PolicyEngine for ZoneRepoPolicyEngine {
    fn is_transition_forbidden(
        &self,
        ctx: &PolicyContext,
    ) -> bool {
        // Example: forbid if region is already overloaded with intensity + population.
        let overload_score =
            ctx.concept_intensity * (ctx.region_population as f64 / 10_000.0);
        overload_score > self.ethical_ceiling
    }

    fn evaluate_transition(
        &self,
        ctx: &PolicyContext,
    ) -> FearIndex {
        // Very simplified fear index model.
        let systemic_harm = ctx.concept_intensity * 0.5;
        let regret = match ctx.proposed_strength {
            BeliefStrength::Strong => 0.4,
            BeliefStrength::Moderate => 0.2,
            BeliefStrength::Weak => 0.1,
        };
        let ecological_damage = (ctx.region_population as f64 / 1_000_000.0) * 0.3;

        FearIndex {
            systemic_harm,
            regret,
            ecological_damage,
        }
    }
}

// ---------- Simulation loop helper ----------

pub fn step_world<P: PolicyEngine>(
    world: &mut World,
    policies: &P,
    dt: f64,
) {
    world.time += dt;
    for agent in world.agents.iter_mut() {
        agent.step(world, policies, dt);
    }
}
