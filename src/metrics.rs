use crate::core::id::{RegionId, Tick};
use crate::world::World;
use std::collections::HashMap;

#[derive(Debug, Default)]
pub struct FearIndexMetrics {
    pub time_series: Vec<(Tick, f32)>, // global fear index over time
    pub by_region: HashMap<RegionId, f32>, // cumulative / peak fear by region
    pub eco_damage_score: f32,
}

impl FearIndexMetrics {
    pub fn update_from_snapshot(
        &mut self,
        tick: Tick,
        world: &World,
        agent_fear_by_region: &HashMap<RegionId, f32>, // fraction 0..1
    ) {
        // population-weighted mean fear
        let mut total_pop = 0.0;
        let mut weighted_fear = 0.0;
        for (region_id, fear) in agent_fear_by_region {
            if let Some(region) = world.regions.get(region_id) {
                let pop = region.population as f32;
                total_pop += pop;
                weighted_fear += pop * fear;
                let entry = self.by_region.entry(*region_id).or_insert(0.0);
                *entry = (*entry).max(*fear);
            }
        }
        if total_pop > 0.0 {
            let global_fear = weighted_fear / total_pop;
            self.time_series.push((tick, global_fear));
        }

        // ecological damage proxy: fear × eco_vulnerability
        let mut eco_weighted = 0.0;
        let mut eco_total = 0.0;
        for (region_id, fear) in agent_fear_by_region {
            if let Some(region) = world.regions.get(region_id) {
                let w = region.eco_vulnerability.max(0.0);
                eco_weighted += w * *fear;
                eco_total += w;
            }
        }
        if eco_total > 0.0 {
            self.eco_damage_score = (eco_weighted / eco_total).max(self.eco_damage_score);
        }
    }

    pub fn is_above_ethical_ceiling(&self, ceiling: &crate::policy::EthicalCeiling) -> bool {
        let peak_fear = self
            .time_series
            .iter()
            .map(|(_, f)| *f)
            .fold(0.0_f32, f32::max);

        peak_fear > ceiling.max_fear_index || self.eco_damage_score > ceiling.max_eco_damage
    }
}
