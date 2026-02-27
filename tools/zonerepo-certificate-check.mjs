/**
 * Check if a rollout request lies inside the safe region encoded in
 * a ZoneRepo Safety Certificate-like JSON object.
 *
 * cert.safeRegion.inequalities is assumed to be an array of entries:
 *   {
 *     densityClass: "dense-core",
 *     form: "seedFraction <= 0.02 when signalStrength <= 0.6"
 *   }
 * For simplicity, we support a structured format:
 *   {
 *     densityClass: "dense-core",
 *     maxSeedFraction: 0.02,
 *     maxSignalStrength: 0.6
 *   }
 */
export function isRolloutSafeUnderCertificate(cert, rollout) {
  const {
    densityClass,
    seedFraction,
    signalStrength,
  } = rollout;

  if (!cert || !cert.credentialSubject || !cert.credentialSubject.safeRegion) {
    return {
      allowed: false,
      reason: "Certificate missing safeRegion information",
    };
  }

  const inequalities = cert.credentialSubject.safeRegion.inequalities || [];
  const matching = inequalities.filter((ineq) => ineq.densityClass === densityClass);

  if (matching.length === 0) {
    return {
      allowed: false,
      reason: `No safe-region rule for densityClass=${densityClass}`,
    };
  }

  for (const ineq of matching) {
    const maxSeed = Number(ineq.maxSeedFraction ?? Infinity);
    const maxSignal = Number(ineq.maxSignalStrength ?? Infinity);

    if (seedFraction <= maxSeed && signalStrength <= maxSignal) {
      return {
        allowed: true,
        reason: `Within safe region for ${densityClass} (seedFraction<=${maxSeed}, signalStrength<=${maxSignal})`,
      };
    }
  }

  return {
    allowed: false,
    reason: "Rollout parameters exceed all safe-region inequalities for this densityClass",
  };
}
