/**
 * sectorRightsRouter.js
 *
 * Purpose:
 * - Ingest policy/rights artifacts from majority sectors in a smart city:
 *   regulators, infrastructure operators, healthcare orgs, cybernetics vendors,
 *   augmented-citizen platforms, and civic/republic actors.
 * - Normalize them into a common "rights profile" surface (who, where, what, how).
 * - Score them on autonomy, transparency, and sector-alignment.
 * - Route each artifact into a sector-zone + conflict set so augmented citizens
 *   and city systems can see overlaps, gaps, and conflicts instead of opaque blobs.
 *
 * This is designed to sit beside Javaspectre-style excavation outputs, taking
 * discovered virtual-objects (policies, licenses, configs) and turning them into
 * majority-sector-aware rights maps.
 */

export class SectorRightsRouter {
  constructor(options = {}) {
    this.version = options.version || 'srr-1.0.0';

    // Core scoring thresholds (tunable per deployment).
    this.thresholds = {
      minAutonomyScore: options.minAutonomyScore ?? 0.6,
      minTransparencyScore: options.minTransparencyScore ?? 0.7,
      maxCoercionScore: options.maxCoercionScore ?? 0.3,
    };

    // Majority sectors relevant to smart-city & cybernetics.
    this.sectors = [
      {
        id: 'REGULATOR',
        label: 'Regulators & Policymakers',
        keywords: ['ordinance', 'law', 'statute', 'regulation', 'municipal', 'state', 'federal'],
      },
      {
        id: 'INFRA',
        label: 'Urban Infrastructure & Grid',
        keywords: ['grid', 'power', 'transit', 'traffic', 'lighting', 'iot', 'jetson', 'gateway'],
      },
      {
        id: 'HEALTHCARE',
        label: 'Healthcare & Biomed',
        keywords: ['health', 'clinical', 'medical', 'hospital', 'patient', 'augmented limb', 'implant'],
      },
      {
        id: 'CYBERNETICS',
        label: 'Cybernetics & XR',
        keywords: ['cybernetic', 'brain-computer', 'bci', 'xr', 'neuro', 'prosthetic', 'haptic'],
      },
      {
        id: 'CITIZEN',
        label: 'Augmented Citizens & Community',
        keywords: ['citizen', 'resident', 'tenant', 'augmented-citizen', 'cooperative', 'union'],
      },
      {
        id: 'FINANCE',
        label: 'Financial / Token Governance',
        keywords: ['token', 'erc-20', 'wallet', 'tariff', 'billing', 'subscription', 'fund'],
      },
    ];
  }

  /**
   * Classify and route a set of artifacts.
   * @param {Array<object>} artifacts
   *    [{
   *       id: string,
   *       text: string,          // raw policy/rights/license text
   *       meta?: {
   *         region?: string,
   *         territory?: string,
   *         issuer?: string,
   *         declaredSector?: string,
   *         tags?: string[]
   *       }
   *    }]
   */
  routeArtifacts(artifacts) {
    if (!Array.isArray(artifacts)) {
      throw new Error('SectorRightsRouter.routeArtifacts: artifacts must be an array.');
    }

    const profiles = [];
    const conflicts = [];

    for (const art of artifacts) {
      const normalized = this._normalizeArtifact(art);
      const sector = this._inferSector(normalized);
      const autonomy = this._scoreAutonomy(normalized);
      const transparency = this._scoreTransparency(normalized);
      const scope = this._extractScope(normalized);

      const profile = {
        artifactId: normalized.id,
        issuer: normalized.meta.issuer,
        sector,
        region: normalized.region,
        territory: normalized.territory,
        autonomy,
        transparency,
        scope,
      };

      profiles.push(profile);
    }

    // Detect conflicts by region/territory/subject
    for (let i = 0; i < profiles.length; i += 1) {
      for (let j = i + 1; j < profiles.length; j += 1) {
        const c = this._detectConflict(profiles[i], profiles[j]);
        if (c) conflicts.push(c);
      }
    }

    return {
      version: this.version,
      thresholds: this.thresholds,
      sectors: this.sectors,
      profiles,
      conflicts,
      indexByRegion: this._buildRegionIndex(profiles),
    };
  }

  // ---------- Internal helpers ----------

  _normalizeArtifact(artifact) {
    if (!artifact || typeof artifact !== 'object') {
      throw new Error('SectorRightsRouter._normalizeArtifact: artifact must be an object.');
    }
    const id = String(artifact.id ?? `artifact-${Math.random().toString(36).slice(2)}`);
    const text = (artifact.text ?? '').toString();
    const meta = artifact.meta ?? {};

    const region = meta.region ?? 'unspecified-region';
    const territory = meta.territory ?? 'unspecified-territory';

    return {
      id,
      text,
      meta,
      region,
      territory,
      lower: text.toLowerCase(),
      tags: Array.isArray(meta.tags) ? meta.tags.map((t) => String(t).toLowerCase()) : [],
    };
  }

  _inferSector(normalized) {
    const declared = normalized.meta.declaredSector;
    if (declared) {
      const match = this.sectors.find(
        (s) => s.id === declared || s.id.toLowerCase() === declared.toLowerCase(),
      );
      if (match) return match;
    }

    const lower = normalized.lower;
    let bestSector = this.sectors[0];
    let bestScore = -1;

    for (const sector of this.sectors) {
      let score = 0;
      for (const kw of sector.keywords) {
        if (lower.includes(kw)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSector = sector;
      }
    }

    return bestSector;
  }

  _scoreAutonomy(normalized) {
    const t = normalized.lower;
    let autonomyScore = 0.5;
    let coercionScore = 0.0;

    // Positive autonomy indicators.
    if (t.includes('informed consent')) autonomyScore += 0.2;
    if (t.includes('opt-in')) autonomyScore += 0.15;
    if (t.includes('opt-out')) autonomyScore += 0.1;
    if (t.includes('right to refuse') || t.includes('right to decline')) autonomyScore += 0.15;
    if (t.includes('human override') || t.includes('human-in-the-loop')) autonomyScore += 0.15;

    // Negative: coercive structures presented as default.
    if (t.includes('mandatory') && !t.includes('appeal')) coercionScore += 0.2;
    if (t.includes('forced') || t.includes('compulsory')) coercionScore += 0.2;
    if (t.includes('waive all liability') || t.includes('waive all rights')) coercionScore += 0.25;
    if (t.includes('irreversible') && !t.includes('cooling-off')) coercionScore += 0.1;

    autonomyScore = Math.max(0, Math.min(1, autonomyScore));
    coercionScore = Math.max(0, Math.min(1, coercionScore));

    const passes =
      autonomyScore >= this.thresholds.minAutonomyScore &&
      coercionScore <= this.thresholds.maxCoercionScore;

    const issues = [];
    if (!passes) {
      if (autonomyScore < this.thresholds.minAutonomyScore) {
        issues.push('Weak or missing consent and override mechanisms.');
      }
      if (coercionScore > this.thresholds.maxCoercionScore) {
        issues.push('Coercive or non-revocable obligations detected.');
      }
    }

    return {
      autonomyScore,
      coercionScore,
      passes,
      issues,
    };
  }

  _scoreTransparency(normalized) {
    const t = normalized.lower;
    let transparencyScore = 0.5;
    let opacityScore = 0.0;

    if (t.includes('audit') || t.includes('auditable')) transparencyScore += 0.1;
    if (t.includes('open data') || t.includes('open access')) transparencyScore += 0.15;
    if (t.includes('explainable') || t.includes('explanation')) transparencyScore += 0.1;
    if (t.includes('independent review') || t.includes('oversight')) transparencyScore += 0.15;
    if (t.includes('privacy by design') || t.includes('data minimization')) transparencyScore += 0.1;

    if (t.includes('non-disclosure') || t.includes('nda')) opacityScore += 0.2;
    if (t.includes('trade secret') && t.includes('clinical')) opacityScore += 0.2;
    if (t.includes('black box') || t.includes('proprietary algorithm')) opacityScore += 0.2;

    transparencyScore = Math.max(0, Math.min(1, transparencyScore));
    opacityScore = Math.max(0, Math.min(1, opacityScore));

    const passes = transparencyScore >= this.thresholds.minTransparencyScore && opacityScore <= 0.3;
    const issues = [];
    if (!passes) {
      if (transparencyScore < this.thresholds.minTransparencyScore) {
        issues.push('Insufficient auditability or explainability.');
      }
      if (opacityScore > 0.3) {
        issues.push('High reliance on secrecy for critical decision logic.');
      }
    }

    return {
      transparencyScore,
      opacityScore,
      passes,
      issues,
    };
  }

  _extractScope(normalized) {
    const t = normalized.lower;
    const scope = {
      affectsAugmentedCitizens: false,
      affectsNonAugmentedCitizens: false,
      touchesCriticalInfra: false,
      touchesHealthcare: false,
      touchesCybernetics: false,
    };

    if (t.includes('augmented citizen') || t.includes('implant') || t.includes('bci')) {
      scope.affectsAugmentedCitizens = true;
      scope.touchesCybernetics = true;
    }
    if (t.includes('resident') || t.includes('tenant') || t.includes('citizen')) {
      scope.affectsNonAugmentedCitizens = true;
    }
    if (t.includes('grid') || t.includes('traffic') || t.includes('transit') || t.includes('gateway')) {
      scope.touchesCriticalInfra = true;
    }
    if (t.includes('patient') || t.includes('clinical') || t.includes('hospital') || t.includes('device implantable')) {
      scope.touchesHealthcare = true;
      scope.touchesCybernetics = scope.touchesCybernetics || t.includes('implant');
    }

    return scope;
  }

  _detectConflict(a, b) {
    // Same region/territory AND overlapping scope is where conflicts matter.
    if (a.region !== b.region || a.territory !== b.territory) return null;

    const overlappingScope =
      (a.scope.touchesCriticalInfra && b.scope.touchesCriticalInfra) ||
      (a.scope.touchesHealthcare && b.scope.touchesHealthcare) ||
      (a.scope.affectsAugmentedCitizens && b.scope.affectsAugmentedCitizens);

    if (!overlappingScope) return null;

    const autonomyGap = Math.abs(a.autonomy.autonomyScore - b.autonomy.autonomyScore);
    const transparencyGap = Math.abs(a.transparency.transparencyScore - b.transparency.transparencyScore);

    if (autonomyGap < 0.25 && transparencyGap < 0.25) return null;

    return {
      pair: [a.artifactId, b.artifactId],
      region: a.region,
      territory: a.territory,
      sectors: [a.sector.id, b.sector.id],
      autonomyGap,
      transparencyGap,
    };
  }

  _buildRegionIndex(profiles) {
    const index = {};
    for (const p of profiles) {
      const region = p.region;
      const territory = p.territory;
      if (!index[region]) index[region] = {};
      if (!index[region][territory]) index[region][territory] = {};
      const key = p.sector.id;
      if (!index[region][territory][key]) index[region][territory][key] = [];
      index[region][territory][key].push({
        artifactId: p.artifactId,
        autonomyScore: p.autonomy.autonomyScore,
        transparencyScore: p.transparency.transparencyScore,
        scope: p.scope,
      });
    }
    return index;
  }
}

export default SectorRightsRouter;
