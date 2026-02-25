/**
 * surface: output of buildResponseSurface (array of cells).
 * riskConstraints: {
 *   maxHarmProbability: number,   // e.g., 0.05
 *   maxMeanGlobalFear?: number,   // optional
 * }
 *
 * Returns interpretable, ready-to-codify rules.
 */
function deriveRegulatoryThresholds(surface, riskConstraints) {
  const {
    maxHarmProbability,
    maxMeanGlobalFear = 1.0,
  } = riskConstraints;

  // Filter safe cells according to risk ceiling
  const safeCells = surface.filter((cell) => {
    const { probabilityHarmful, meanGlobalPeakFear } = cell.stats;
    return (
      probabilityHarmful <= maxHarmProbability &&
      meanGlobalPeakFear <= maxMeanGlobalFear
    );
  });

  if (safeCells.length === 0) {
    return {
      safe: false,
      message: "No parameter region satisfies risk constraints.",
      thresholds: null,
    };
  }

  // Example: derive max safe seed fraction per spatial focus type
  const byFocusKey = {};
  for (const cell of safeCells) {
    const key = spatialFocusKey(cell.spatialFocus);
    if (!byFocusKey[key]) {
      byFocusKey[key] = [];
    }
    byFocusKey[key].push(cell);
  }

  const thresholds = [];

  for (const [key, cells] of Object.entries(byFocusKey)) {
    const maxSafeSeed = maxBy(cells, (c) => c.seedFraction)?.seedFraction ?? 0;
    const maxSafeSignal = maxBy(cells, (c) => c.signalStrength)?.signalStrength ?? 0;

    thresholds.push({
      spatialFocusKey: key,
      maxSafeSeedFraction: maxSafeSeed,
      maxSafeSignalStrength: maxSafeSignal,
      riskConstraints,
    });
  }

  return {
    safe: true,
    thresholds,
  };
}

function spatialFocusKey(spatialFocus) {
  if (!spatialFocus) return "uniform";
  if (spatialFocus.type === "kernel") {
    return `kernel:${(spatialFocus.centerIds || []).sort().join(",")}`;
  }
  if (spatialFocus.type === "explicit") {
    return "explicit";
  }
  return spatialFocus.type || "other";
}

function maxBy(arr, fn) {
  let best = null;
  let bestVal = -Infinity;
  for (const x of arr) {
    const v = fn(x);
    if (v > bestVal) {
      bestVal = v;
      best = x;
    }
  }
  return best;
}

module.exports = {
  deriveRegulatoryThresholds,
};
