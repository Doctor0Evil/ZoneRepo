/**
 * theta: {
 *   seedFraction: number in [0, 1],
 *   spatialFocus: { type: "kernel" | "explicit", centerIds?: string[], weights?: Record<string,number> },
 *   signalStrength: number,
 *   timeHorizon: number,
 *   dt: number, // e.g., 1 step
 *   randomSeed?: number
 * }
 *
 * mobilityGraph: {
 *   // adjacency matrix or list: fromRegion -> array of { to, weight }
 *   [regionId: string]: { to: string, weight: number }[]
 * }
 *
 * simConfig: {
 *   fearParams: {...},
 *   adoptionParams: {...},
 *   popByRegion: Record<string, number>,
 *   initialFearByRegion?: Record<string, number>,
 *   rngFactory?: (seed) => () => number
 * }
 */

function runCascadeSimulation(theta, densityProvider, mobilityGraph, simConfig) {
  const {
    seedFraction,
    spatialFocus,
    signalStrength,
    timeHorizon,
    dt,
    randomSeed,
  } = theta;

  const {
    fearParams,
    adoptionParams,
    popByRegion,
    initialFearByRegion = {},
    rngFactory,
  } = simConfig;

  const rng = rngFactory ? rngFactory(randomSeed || 0) : Math.random;

  const regions = densityProvider.listRegions();
  const T = Math.floor(timeHorizon / dt);

  // State arrays: A (adoption), F (fear)
  const A = {}; // { regionId: number }
  const F = {};
  const history = {
    A: [], // array of { t, values: { regionId: A } }
    F: [],
  };

  // --- 1. Initialize adoption and fear states ---
  initializeAdoption(A, regions, seedFraction, spatialFocus, popByRegion, rng);
  initializeFear(F, regions, initialFearByRegion);

  // --- 2. Simulation loop ---
  for (let step = 0; step <= T; step++) {
    const t = step * dt;

    // Snapshot current state
    history.A.push({ t, values: { ...A } });
    history.F.push({ t, values: { ...F } });

    if (step === T) break;

    // Compute exposure per region
    const exposure = computeExposure(
      regions,
      A,
      densityProvider,
      mobilityGraph,
      signalStrength,
      adoptionParams
    );

    // Update adoption and fear
    const newA = {};
    const newF = {};

    for (const r of regions) {
      const a = A[r];
      const f = F[r];
      const e = exposure[r] || 0;

      const dA = adoptionIncrement(a, f, e, adoptionParams);
      newA[r] = clamp01(a + dA);

      const harmSignal = computeHarmSignal(r, A, F, exposure, simConfig);
      const dF = fearIncrement(f, e, dA, harmSignal, fearParams);
      newF[r] = Math.max(0, f + dF);
    }

    // Commit step
    for (const r of regions) {
      A[r] = newA[r];
      F[r] = newF[r];
    }
  }

  // --- 3. Aggregate metrics ---
  const metrics = computeSimulationMetrics(history, regions, popByRegion, fearParams);

  return {
    history,
    metrics,
  };
}

// ---------- Initialization helpers ----------

function initializeAdoption(A, regions, seedFraction, spatialFocus, popByRegion, rng) {
  const totalPop = regions.reduce((sum, r) => sum + (popByRegion[r] || 0), 0);
  const targetSeedPop = totalPop * seedFraction;

  const weights = computeSpatialFocusWeights(regions, spatialFocus, popByRegion);

  // Simple proportional seeding at region level
  for (const r of regions) {
    const w = weights[r] || 0;
    const regionPop = popByRegion[r] || 0;
    // expected seeded pop in region
    const expectedSeeds = (w * targetSeedPop) / (regionPop > 0 ? regionPop : 1);
    // convert to fraction, capped at 1
    const frac = Math.min(1, expectedSeeds / (regionPop || 1));
    // allow randomness around expectation
    const jitter = (rng() - 0.5) * 0.1;
    A[r] = clamp01(frac + jitter);
  }
}

function computeSpatialFocusWeights(regions, spatialFocus, popByRegion) {
  const weights = {};
  if (!spatialFocus || spatialFocus.type === "uniform") {
    const n = regions.length;
    for (const r of regions) weights[r] = 1 / n;
    return weights;
  }

  if (spatialFocus.type === "explicit" && spatialFocus.weights) {
    const raw = spatialFocus.weights;
    const sum = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
    for (const r of regions) weights[r] = (raw[r] || 0) / sum;
    return weights;
  }

  if (spatialFocus.type === "kernel" && spatialFocus.centerIds?.length) {
    // Example: simple kernel proportional to pop in centers vs others
    const centers = new Set(spatialFocus.centerIds);
    let centerPop = 0;
    for (const r of regions) if (centers.has(r)) centerPop += popByRegion[r] || 0;
    const totalPop = regions.reduce((s, r) => s + (popByRegion[r] || 0), 0) || 1;

    for (const r of regions) {
      if (centers.has(r)) {
        weights[r] = (popByRegion[r] || 0) / centerPop || 0;
      } else {
        // small residual mass
        weights[r] = 0.001 * ((popByRegion[r] || 0) / totalPop);
      }
    }
    return weights;
  }

  // Fallback: uniform
  const n = regions.length;
  for (const r of regions) weights[r] = 1 / n;
  return weights;
}

function initializeFear(F, regions, initialFearByRegion) {
  for (const r of regions) {
    F[r] = initialFearByRegion[r] || 0;
  }
}

// ---------- Dynamics helpers ----------

function computeExposure(regions, A, densityProvider, mobilityGraph, signalStrength, adoptionParams) {
  const { localWeight = 1.0, importedWeight = 1.0 } = adoptionParams || {};
  const exposure = {};

  for (const i of regions) {
    const localDensity = densityProvider.getDensity(i, 0); // or time-varying if needed
    const localContactRate = localContactFunction(localDensity, adoptionParams);
    const localExposure = localWeight * localContactRate * (A[i] || 0);

    let importedExposure = 0;
    const incoming = reverseEdgesForRegion(i, mobilityGraph); // or precompute once
    for (const edge of incoming) {
      const fromA = A[edge.from] || 0;
      importedExposure += edge.weight * fromA;
    }

    exposure[i] = signalStrength * (localExposure + importedWeight * importedExposure);
  }

  return exposure;
}

function localContactFunction(density, adoptionParams) {
  const { baseContact = 0.01, densityExponent = 0.5 } = adoptionParams || {};
  return baseContact * Math.pow(density + 1, densityExponent);
}

function reverseEdgesForRegion(targetRegionId, mobilityGraph) {
  const incoming = [];
  for (const from in mobilityGraph) {
    for (const edge of mobilityGraph[from]) {
      if (edge.to === targetRegionId) {
        incoming.push({ from, weight: edge.weight });
      }
    }
  }
  return incoming;
}

function adoptionIncrement(a, f, e, adoptionParams) {
  const {
    exposureScale = 1.0,
    fearSensitivity = 1.0,
    maxRate = 0.2,
  } = adoptionParams || {};

  const effectiveExposure = e * exposureScale;
  const fearFactor = 1 / (1 + fearSensitivity * f);
  const rawGrowth = effectiveExposure * fearFactor * (1 - a);
  return Math.min(maxRate, rawGrowth);
}

function computeHarmSignal(regionId, A, F, exposure, simConfig) {
  // placeholder; plug in domain-specific harm events later
  const { harmWeights = {} } = simConfig || {};
  const adoptionLevel = A[regionId] || 0;
  const fearLevel = F[regionId] || 0;
  const exp = exposure[regionId] || 0;

  return (
    (harmWeights.adoption || 0.0) * adoptionLevel +
    (harmWeights.fear || 0.0) * fearLevel +
    (harmWeights.exposure || 0.0) * exp
  );
}

function fearIncrement(f, e, dA, harmSignal, fearParams) {
  const {
    kExposure = 0.1,
    kGrowth = 0.5,
    kHarm = 1.0,
    decay = 0.05,
    nonLinearSpike = true,
    spikeThreshold = 0.2,
    spikeGain = 2.0,
  } = fearParams || {};

  let driver = kExposure * e + kGrowth * Math.max(0, dA) + kHarm * harmSignal;

  if (nonLinearSpike && driver > spikeThreshold) {
    driver *= spikeGain;
  }

  return driver - decay * f;
}

// ---------- Metrics ----------

function computeSimulationMetrics(history, regions, popByRegion, fearParams) {
  const popTotal = regions.reduce((s, r) => s + (popByRegion[r] || 0), 0) || 1;

  let globalPeakAdoption = 0;
  let globalPeakFear = 0;
  let peakAdoptionTime = null;
  let peakFearTime = null;

  const perRegion = {};
  for (const r of regions) {
    perRegion[r] = {
      peakAdoption: 0,
      peakFear: 0,
      peakAdoptionTime: null,
      peakFearTime: null,
    };
  }

  for (let i = 0; i < history.A.length; i++) {
    const { t, values: Avals } = history.A[i];
    const Fvals = history.F[i].values;

    let totalAdoptedPop = 0;
    let totalFearWeightedPop = 0;

    for (const r of regions) {
      const a = Avals[r] || 0;
      const f = Fvals[r] || 0;
      const pop = popByRegion[r] || 0;

      totalAdoptedPop += a * pop;
      totalFearWeightedPop += f * pop;

      if (a > perRegion[r].peakAdoption) {
        perRegion[r].peakAdoption = a;
        perRegion[r].peakAdoptionTime = t;
      }
      if (f > perRegion[r].peakFear) {
        perRegion[r].peakFear = f;
        perRegion[r].peakFearTime = t;
      }
    }

    const avgAdoption = totalAdoptedPop / popTotal;
    const avgFear = totalFearWeightedPop / popTotal;

    if (avgAdoption > globalPeakAdoption) {
      globalPeakAdoption = avgAdoption;
      peakAdoptionTime = t;
    }
    if (avgFear > globalPeakFear) {
      globalPeakFear = avgFear;
      peakFearTime = t;
    }
  }

  // Harmful cascade definition
  const {
    criticalFear = 0.7,
    materialAdoption = 0.3,
    criticalPopShare = 0.1,
  } = fearParams || {};

  let harmfulCascadeOccurred = false;

  for (let i = 0; i < history.A.length; i++) {
    const { values: Avals } = history.A[i];
    const Fvals = history.F[i].values;

    let popAtRisk = 0;
    for (const r of regions) {
      const a = Avals[r] || 0;
      const f = Fvals[r] || 0;
      const pop = popByRegion[r] || 0;

      if (a >= materialAdoption && f >= criticalFear) {
        popAtRisk += pop;
      }
    }
    const shareAtRisk = popAtRisk / popTotal;
    if (shareAtRisk >= criticalPopShare) {
      harmfulCascadeOccurred = true;
      break;
    }
  }

  return {
    globalPeakAdoption,
    globalPeakFear,
    peakAdoptionTime,
    peakFearTime,
    perRegion,
    harmfulCascadeOccurred,
  };
}

// ---------- Utils ----------

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

module.exports = {
  runCascadeSimulation,
};
