/**
 * Compute a composite FearIndex from per-step components.
 * Expects an array of { ecologicalDamage, systemicHarm, regret } in [0,1].
 * Ecology is up-weighted to keep nature-first ethics central.
 */
export function computeFearIndexSeries(steps, weights = { ecology: 0.5, systemic: 0.3, regret: 0.2 }) {
  let sumEcology = 0;
  let sumSystemic = 0;
  let sumRegret = 0;

  for (const s of steps) {
    const e = Number(s.ecologicalDamage ?? 0);
    const h = Number(s.systemicHarm ?? 0);
    const r = Number(s.regret ?? 0);
    sumEcology += e;
    sumSystemic += h;
    sumRegret += r;
  }

  const n = steps.length || 1;
  const avgEcology = sumEcology / n;
  const avgSystemic = sumSystemic / n;
  const avgRegret = sumRegret / n;

  const value =
    weights.ecology * avgEcology +
    weights.systemic * avgSystemic +
    weights.regret * avgRegret;

  return {
    value: clamp01(value),
    components: {
      ecologicalDamage: clamp01(avgEcology),
      systemicHarm: clamp01(avgSystemic),
      regret: clamp01(avgRegret),
    },
  };
}

export function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Check a FearIndex against an EthicalCeiling.
 * ceiling: { maxFear, maxEcology, maxSystemic, maxRegret, neverAllowedFlags?: string[] }
 */
export function checkEthicalCeiling(fearIndex, ceiling) {
  const { value, components } = fearIndex;
  const {
    maxFear = 0.6,
    maxEcology = 0.4,
    maxSystemic = 0.6,
    maxRegret = 0.6,
    neverAllowedFlags = [],
  } = ceiling || {};

  const reasons = [];
  let allowed = true;

  if (value > maxFear) {
    allowed = false;
    reasons.push(`FearIndex ${value.toFixed(3)} exceeds maxFear ${maxFear.toFixed(3)}`);
  }
  if (components.ecologicalDamage > maxEcology) {
    allowed = false;
    reasons.push(`ecologicalDamage ${components.ecologicalDamage.toFixed(3)} exceeds maxEcology ${maxEcology.toFixed(3)}`);
  }
  if (components.systemicHarm > maxSystemic) {
    allowed = false;
    reasons.push(`systemicHarm ${components.systemicHarm.toFixed(3)} exceeds maxSystemic ${maxSystemic.toFixed(3)}`);
  }
  if (components.regret > maxRegret) {
    allowed = false;
    reasons.push(`regret ${components.regret.toFixed(3)} exceeds maxRegret ${maxRegret.toFixed(3)}`);
  }

  if (neverAllowedFlags.includes("irreversibleBioRisk") && components.regret > 0.8) {
    allowed = false;
    reasons.push("neverAllowed: irreversibleBioRisk triggered by high regret component");
  }

  return { allowed, reasons, fearIndex };
}
