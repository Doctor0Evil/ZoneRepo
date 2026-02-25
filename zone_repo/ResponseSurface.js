const { runCascadeSimulation } = require("./cascadeSimulation");

/**
 * paramGrid: {
 *   seedFractions: number[],
 *   signalStrengths: number[],
 *   spatialFocusOptions: any[], // objects compatible with runCascadeSimulation
 * }
 *
 * simConfig: {
 *   densityProvider,
 *   mobilityGraph,
 *   baseSimConfig,  // shared simConfig except theta
 *   runsPerPoint: number
 * }
 */
async function buildResponseSurface(paramGrid, simConfig) {
  const {
    densityProvider,
    mobilityGraph,
    baseSimConfig,
    runsPerPoint,
  } = simConfig;

  const surface = []; // array of cells

  for (const seedFraction of paramGrid.seedFractions) {
    for (const signalStrength of paramGrid.signalStrengths) {
      for (const spatialFocus of paramGrid.spatialFocusOptions) {
        const thetaBase = {
          seedFraction,
          signalStrength,
          spatialFocus,
          timeHorizon: baseSimConfig.timeHorizon,
          dt: baseSimConfig.dt,
        };

        const results = [];
        for (let k = 0; k < runsPerPoint; k++) {
          const theta = { ...thetaBase, randomSeed: k };
          const simResult = runCascadeSimulation(
            theta,
            densityProvider,
            mobilityGraph,
            baseSimConfig
          );
          results.push(simResult.metrics);
        }

        const aggregated = aggregateMetrics(results);

        surface.push({
          seedFraction,
          signalStrength,
          spatialFocus,
          stats: aggregated,
        });
      }
    }
  }

  return surface;
}

function aggregateMetrics(metricsArray) {
  const n = metricsArray.length || 1;

  const mean = (arr, key) => arr.reduce((s, m) => s + (m[key] || 0), 0) / n;

  const probabilityHarmful =
    metricsArray.filter((m) => m.harmfulCascadeOccurred).length / n;

  return {
    meanGlobalPeakAdoption: mean(metricsArray, "globalPeakAdoption"),
    meanGlobalPeakFear: mean(metricsArray, "globalPeakFear"),
    probabilityHarmful,
    // Optionally keep distribution details
    raw: metricsArray,
  };
}

module.exports = {
  buildResponseSurface,
};
