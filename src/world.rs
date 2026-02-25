use crate::core::id::{RegionId, ConceptId};
use crate::concept::Concept;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Region {
    pub id: RegionId,
    pub name: String,
    pub population: u32,
    pub area_km2: f32,
    pub neighbors: Vec<RegionId>, // mobility topology
    pub eco_vulnerability: f32,   // weight in ecological scoring
}

#[derive(Debug)]
pub struct World {
    pub regions: HashMap<RegionId, Region>,
    pub concepts: HashMap<ConceptId, Concept>,
    /// region -> concept -> current exposure intensity
    pub exposure_field: HashMap<RegionId, HashMap<ConceptId, f32>>,
}

pub struct WorldView<'a> {
    world: &'a World,
}

impl World {
    pub fn view(&self) -> WorldView<'_> {
        WorldView { world: self }
    }
}

impl<'a> WorldView<'a> {
    pub fn visible_concepts(&self, region: RegionId) -> Vec<&Concept> {
        self.world.concepts.values().collect()
    }

    pub fn local_exposure_intensity(&self, concept_id: ConceptId, region: RegionId) -> f32 {
        self.world
            .exposure_field
            .get(&region)
            .and_then(|m| m.get(&concept_id).copied())
            .unwrap_or(0.0)
    }

    pub fn sample_neighbor_region(
        &self,
        region: RegionId,
        rng: &mut impl rand::Rng,
    ) -> Option<RegionId> {
        let reg = self.world.regions.get(&region)?;
        if reg.neighbors.is_empty() {
            return None;
        }
        let idx = rng.gen_range(0..reg.neighbors.len());
        Some(reg.neighbors[idx])
    }
}
