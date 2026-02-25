const { buildResponseSurface } = require("./responseSurface");
const { deriveRegulatoryThresholds } = require("./regulatoryThresholds");

async function evaluatePolicyPlan(densityProvider, mobilityGraph, planSpec) {
  const paramGrid = {
    seedFractions: planSpec.seedFractions,
    signalStrengths: planSpec.signalStrengths,
    spatialFocusOptions: planSpec.spatialFocusOptions,
  };

  const fairnessConfig = {
    maxHarmProbability: planSpec.maxHarmProbability,
    maxMeanGlobalFear: planSpec.maxMeanGlobalFear,
    weightRisk: 0.5,
    weightFear: 0.3,
    weightAlignment: 0.2,
    alignmentTarget: 0.1,
  };

  const surface = await buildResponseSurface(paramGrid, {
    densityProvider,
    mobilityGraph,
    baseSimConfig: planSpec.baseSimConfig,
    runsPerPoint: planSpec.runsPerPoint,
    fairnessConfig,
  });

  const thresholds = deriveRegulatoryThresholds(surface, {
    maxHarmProbability: planSpec.maxHarmProbability,
    maxMeanGlobalFear: planSpec.maxMeanGlobalFear,
    minFairnessScore: planSpec.minFairnessScore,
  });

  return { surface, thresholds };
}
