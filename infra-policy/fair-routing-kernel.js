/**
 * Core data types (informal):
 *
 * RouteCandidate = {
 *   id: string,
 *   lengthKm: number,
 *   estDurationHours: number,
 *   directCostUSD: number,
 *   // logistics
 *   tonnageMoved: number,          // total tonnes moved over this route
 *   mode: "road" | "rail" | "barge",
 *   avgSpeedKph: number,
 *   // environment
 *   fuelLitersPer100TonneKm: number,
 *   habitatSensitivityIndex: number, // 0..1 (0 = no habitat, 1 = critical corridor)
 *   soilFragilityIndex: number,      // 0..1 (0 = robust, 1 = highly fragile)
 *   noiseSensitivityIndex: number,   // 0..1 (0 = industrial, 1 = quiet / residential / fauna)
 *   passesThroughNoGoZone: boolean   // hard stop if true
 * }
 *
 * EcoEnvelope = {
 *   maxEcoFear: number,        // 0..1 ceiling, e.g. 0.6
 *   maxFuelPerTonneKm: number, // absolute ceiling
 *   hardNoGoPenalty: number    // forced fear if no-go is hit, e.g. 1.0
 * }
 *
 * WeightingConfig = {
 *   wFuel: number,     // weight for fuel/emissions
 *   wHabitat: number,  // weight for habitat sensitivity
 *   wSoil: number,     // weight for soil compaction/erosion
 *   wNoise: number     // weight for nuisance
 * }
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute basic logistics KPIs for a route.
 */
function computeRouteLogistics(route) {
  const tonneKm = route.tonnageMoved * route.lengthKm;
  const fuelPerTonneKm =
    tonneKm > 0
      ? (route.fuelLitersPer100TonneKm / 100.0)
      : 0;

  const fuelTotalLiters = fuelPerTonneKm * tonneKm;

  return {
    tonneKm,
    fuelPerTonneKm,
    fuelTotalLiters
  };
}

/**
 * Map mode to a reference emissions factor or risk modifier if needed.
 * You can expand this table later.
 */
function modeRiskModifier(mode) {
  switch (mode) {
    case "rail":
      return 0.7; // generally lower per tonne-km
    case "barge":
      return 0.6; // very efficient in many cases
    case "road":
    default:
      return 1.0;
  }
}

/**
 * Compute an eco “fear” score 0..1 for a route.
 * Higher = worse (more ecologically risky).
 */
function computeEcoFear(route, logistics, envelope, weights) {
  const {
    wFuel,
    wHabitat,
    wSoil,
    wNoise
  } = weights;

  const {
    maxFuelPerTonneKm,
    hardNoGoPenalty
  } = envelope;

  // 1. Fuel / emissions component (normalized vs envelope)
  const fuelRatio = maxFuelPerTonneKm > 0
    ? logistics.fuelPerTonneKm / maxFuelPerTonneKm
    : 0;

  const fuelComponent = clamp01(fuelRatio) * modeRiskModifier(route.mode);

  // 2. Habitat, soil, noise directly 0..1 indices
  const habitatComponent = clamp01(route.habitatSensitivityIndex);
  const soilComponent = clamp01(route.soilFragilityIndex);
  const noiseComponent = clamp01(route.noiseSensitivityIndex);

  // 3. Aggregate fear score (weighted average)
  const totalWeight = (wFuel + wHabitat + wSoil + wNoise) || 1;
  let ecoFear =
    (wFuel * fuelComponent +
      wHabitat * habitatComponent +
      wSoil * soilComponent +
      wNoise * noiseComponent) / totalWeight;

  // 4. Hard penalty for no-go zones
  if (route.passesThroughNoGoZone) {
    ecoFear = Math.max(ecoFear, hardNoGoPenalty);
  }

  return clamp01(ecoFear);
}

/**
 * Combined evaluation: cost, time, eco, plus a scalar “fairness” score
 * that prefers low-ecoFear routes and then cheaper / faster ones.
 */
function evaluateRoute(route, envelope, weightConfig) {
  const logistics = computeRouteLogistics(route);
  const ecoFear = computeEcoFear(route, logistics, envelope, weightConfig);

  // Normalize cost and time heuristically for multi-route comparison.
  // We keep them as raw numbers plus simple scaled versions.
  const cost = route.directCostUSD;
  const timeHours = route.estDurationHours;

  // Heuristic fairness score: start from 1, subtract ecoFear, then small penalties
  // for cost and time (scaled) so eco dominates.
  const costScale = 1e-6; // adjust per project (e.g. 1e-6 per USD)
  const timeScale = 1e-2; // adjust per project (e.g. 0.01 per hour)

  let fairness = 1.0;
  fairness -= ecoFear;                  // strong penalty
  fairness -= costScale * cost;         // mild penalty
  fairness -= timeScale * timeHours;    // mild penalty

  fairness = clamp01(fairness);

  const allowed = ecoFear <= envelope.maxEcoFear && !route.passesThroughNoGoZone;

  return {
    id: route.id,
    logistics,
    ecoFear,
    cost,
    timeHours,
    fairness,
    allowed
  };
}

/**
 * Evaluate a set of candidate routes and return:
 * - full scored list
 * - only routes within eco envelope, sorted by fairness (best first)
 */
function evaluateRoutes(routes, envelope, weightConfig) {
  const evaluated = routes.map(r => evaluateRoute(r, envelope, weightConfig));
  const allowed = evaluated
    .filter(r => r.allowed)
    .sort((a, b) => b.fairness - a.fairness);
  return { evaluated, allowed };
}

// Example usage
if (require.main === module) {
  const routes = [
    {
      id: "A",
      lengthKm: 10,
      estDurationHours: 4,
      directCostUSD: 100000,
      tonnageMoved: 50000,
      mode: "road",
      avgSpeedKph: 30,
      fuelLitersPer100TonneKm: 35,
      habitatSensitivityIndex: 0.8,
      soilFragilityIndex: 0.7,
      noiseSensitivityIndex: 0.9,
      passesThroughNoGoZone: true
    },
    {
      id: "B",
      lengthKm: 14,
      estDurationHours: 4.5,
      directCostUSD: 108000,
      tonnageMoved: 50000,
      mode: "road",
      avgSpeedKph: 35,
      fuelLitersPer100TonneKm: 32,
      habitatSensitivityIndex: 0.2,
      soilFragilityIndex: 0.3,
      noiseSensitivityIndex: 0.4,
      passesThroughNoGoZone: false
    },
    {
      id: "C",
      lengthKm: 18,
      estDurationHours: 5.5,
      directCostUSD: 115000,
      tonnageMoved: 50000,
      mode: "rail",
      avgSpeedKph: 40,
      fuelLitersPer100TonneKm: 18,
      habitatSensitivityIndex: 0.25,
      soilFragilityIndex: 0.2,
      noiseSensitivityIndex: 0.3,
      passesThroughNoGoZone: false
    }
  ];

  const envelope = {
    maxEcoFear: 0.6,
    maxFuelPerTonneKm: 0.35, // liters per tonne-km ceiling
    hardNoGoPenalty: 1.0
  };

  const weights = {
    wFuel: 0.4,
    wHabitat: 0.3,
    wSoil: 0.2,
    wNoise: 0.1
  };

  const { evaluated, allowed } = evaluateRoutes(routes, envelope, weights);

  console.log("All routes:");
  console.dir(evaluated, { depth: null });

  console.log("\nEco-allowed, best first:");
  console.dir(allowed, { depth: null });
}

module.exports = {
  computeRouteLogistics,
  computeEcoFear,
  evaluateRoute,
  evaluateRoutes
};
