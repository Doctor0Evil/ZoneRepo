use crate::core::agent::{Agent, AgentAction};
use crate::core::id::Tick;
use crate::metrics::FearIndexMetrics;
use crate::policy::PolicyContext;
use crate::world::World;
use rand::SeedableRng;

#[derive(Debug)]
pub struct SimulationConfig {
    pub max_ticks: Tick,
    pub random_seed: u64,
}

#[derive(Debug)]
pub struct DecisionLogEntry {
    pub tick: Tick,
    pub description: String,
}

#[derive(Debug, Default)]
pub struct SimulationLog {
    pub actions: Vec<DecisionLogEntry>,
}

pub struct Simulation {
    pub world: World,
    pub agents: Vec<Agent>,
    pub policy: PolicyContext,
    pub config: SimulationConfig,
    pub log: SimulationLog,
    pub fear_metrics: FearIndexMetrics,
}

impl Simulation {
    pub fn run(&mut self) {
        let mut rng = rand::rngs::StdRng::seed_from_u64(self.config.random_seed);

        for tick in 0..self.config.max_ticks {
            // 1. Collect actions from all agents
            let world_view = self.world.view();
            let mut all_actions = Vec::new();
            for agent in &mut self.agents {
                let actions = agent.step(tick, &world_view, &self.policy, &mut rng);
                all_actions.extend(actions);
            }

            // 2. Apply actions to world/agents and log them
            self.apply_actions(tick, &all_actions);

            // 3. Update fear metrics after this tick
            let mut fear_by_region = std::collections::HashMap::new();
            for agent in &self.agents {
                let entry = fear_by_region.entry(agent.state.region).or_insert(0.0);
                *entry = (*entry).max(agent.state.fear_level);
            }
            self.fear_metrics
                .update_from_snapshot(tick, &self.world, &fear_by_region);

            // 4. Early stop if ethical ceiling is violated
            if self
                .fear_metrics
                .is_above_ethical_ceiling(&self.policy.ethical_ceiling)
            {
                self.log.actions.push(DecisionLogEntry {
                    tick,
                    description: "Simulation stopped: ethical ceiling violated".into(),
                });
                break;
            }
        }
    }

    fn apply_actions(&mut self, tick: Tick, actions: &[AgentAction]) {
        for action in actions {
            match action {
                AgentAction::Move { agent_id, from, to } => {
                    if let Some(agent) = self.agents.iter_mut().find(|a| &a.id == agent_id) {
                        if agent.state.region == *from {
                            agent.state.region = *to;
                        }
                    }
                    self.log.actions.push(DecisionLogEntry {
                        tick,
                        description: format!("Agent {agent_id} moved {from}->{to}"),
                    });
                }
                AgentAction::Adopt { agent_id, concept_id } => {
                    if let Some(agent) = self.agents.iter_mut().find(|a| &a.id == agent_id) {
                        if !agent.state.adopted_concepts.contains(concept_id) {
                            agent.state.adopted_concepts.push(*concept_id);
                        }
                    }
                    self.log.actions.push(DecisionLogEntry {
                        tick,
                        description: format!("Agent {agent_id} adopted concept {concept_id}"),
                    });
                }
                AgentAction::Share {
                    agent_id,
                    concept_id,
                    region,
                } => {
                    // simple: bump exposure in region
                    let region_exposure = self
                        .world
                        .exposure_field
                        .entry(*region)
                        .or_default();
                    let e = region_exposure.entry(*concept_id).or_insert(0.0);
                    *e += 0.1;

                    self.log.actions.push(DecisionLogEntry {
                        tick,
                        description: format!(
                            "Agent {agent_id} shared concept {concept_id} in region {region}"
                        ),
                    });
                }
            }
        }
    }
}
