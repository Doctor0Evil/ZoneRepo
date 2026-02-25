// 1. Parameter semantics and basic validation

function semanticSeedFraction(seedFraction) {
  return {
    value: seedFraction,
    unit: "fraction_of_local_agents",
    description: "Share of agents initially activated in each density cell.",
    constraints: {
      globalMin: 0.0,
      globalMax: 0.15,
      safeEvalMin: 0.001,
      safeEvalMax: 0.08,
    },
  };
}

function semanticSignalStrength(signalStrength) {
  return {
    value: signalStrength,
    unit: "normalized_0_1",
    description:
      "Per-contact influence intensity (salience × reliability × repetition).",
    constraints: {
      min: 0.0,
      max: 1.0,
      safeEvalMin: 0.3,
      safeEvalMax: 0.9,
      cascadeSensitiveMin: 0.65,
      regulatoryComfortMax: 0.6,
    },
  };
}

function semanticSpatialFocus(spatialFocus, cellSizeMeters) {
  // spatialFocus can come in angular or scalar form
  const k = spatialFocus.k ?? 0.5; // normalized 0–1 kernel scale
  const rMin = 1 * cellSizeMeters;
  const rMax = 10 * cellSizeMeters;
  const radius = rMin + k * (rMax - rMin);

  return {
    raw: spatialFocus,
    kernelScale: k,
    radiusMeters: radius,
    constraints: {
      kernelMin: 0.0,
      kernelMax: 1.0,
      radiusMin: rMin,
      radiusMax: rMax,
    },
  };
}
