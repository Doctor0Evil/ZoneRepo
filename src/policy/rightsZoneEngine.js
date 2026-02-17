/**
 * rightsZoneEngine.js
 *
 * A policy-as-code zoning and comparison engine that:
 * - Ingests arbitrary items (policies, licenses, datasets, entities, regions, machines, belief-systems, etc.).
 * - Extracts a normalized "governance profile" per item.
 * - Classifies each item into a non-conflicting rights-zone that:
 *     - Does NOT exchange freedom for safety.
 *     - Does NOT sacrifice rights for liberty.
 *     - Avoids policies that hide cures, intelligent life, or material truths.
 * - Produces region/territory/being-specific assortments that can be sorted, compared, and composed.
 *
 * All logic is deterministic, auditable, and JSON-serializable to support ALN-style reasoning layers.
 */

export class RightsZoneEngine {
  constructor(options = {}) {
    this.version = options.version || 'rz-1.0.0';
    this.defaultLocale = options.defaultLocale || 'en-US';

    // Tunable thresholds for "freedom vs safety" and "truth vs obscurity"
    this.thresholds = {
      minFreedomScore: options.minFreedomScore ?? 0.6,
      minTruthScore: options.minTruthScore ?? 0.7,
      maxCoercionScore: options.maxCoercionScore ?? 0.3,
      maxObscurityScore: options.maxObscurityScore ?? 0.3,
    };

    // Static zone definitions; these can be extended per deployment.
    this.zones = [
      {
        id: 'OPEN_COMMONS',
        label: 'Open Commons Zone',
        description:
          'Maximizes knowledge access, open-source reuse, and non-rivalrous sharing while preserving individual autonomy and attribution.',
        targetUse: ['opensource', 'research', 'education', 'civic-tech'],
      },
      {
        id: 'CARE_SOVEREIGN',
        label: 'Care & Sovereign Health Zone',
        description:
          'Health, housing, and care policies that prioritize bodily autonomy, informed consent, and non-coercive safety measures.',
        targetUse: ['healthcare', 'housing', 'residential', 'disability'],
      },
      {
        id: 'CIVIC_REPUBLIC',
        label: 'Civic- Republic Zone',
        description:
          'Constitutional, republican, and municipal frameworks that must not trade fundamental rights for temporary security.',
        targetUse: ['republic', 'civic', 'district', 'municipal'],
      },
      {
        id: 'FINANCE_TRANSPARENT',
        label: 'Transparent Finance Zone',
        description:
          'Financial, licensing, and economic systems with strong auditability, fair access, and no exploitative asymmetries.',
        targetUse: ['financial', 'licensing', 'token', 'exchange'],
      },
      {
        id: 'MACHINE_AUGMENTED',
        label: 'Machine & Augmented Intelligence Zone',
        description:
          'Appliances, machines, networks, and augmented-citizen systems that extend human capability without reducing rights.',
        targetUse: ['augmented-citizen', 'machine', 'network', 'xr'],
      },
    ];
  }

  /**
   * Public entry point.
   * @param {Array<object>} items - Arbitrary inputs with minimal structure:
   *   {
   *     id: string,
   *     kind: string,            // 'policy' | 'license' | 'person' | 'region' | ...
   *     text?: string,           // raw text, description, terms, etc.
   *     meta?: object            // extra metadata (tags, region, etc.)
   *   }
   * @returns {object} zoningResult
   */
  classifyItems(items) {
    if (!Array.isArray(items)) {
      throw new Error('RightsZoneEngine.classifyItems: items must be an array.');
    }

    const profiles = [];
    const violations = [];
    const zones = [];
    const comparisons = [];

    for (const item of items) {
      const normalized = this._normalizeItem(item);
      const guard = this._evaluateFreedomSafety(normalized);
      const truth = this._evaluateTruthVisibility(normalized);
      const zone = this._assignZone(normalized, guard, truth);
      const rightsLayer = this._buildRightsLayer(normalized, guard, truth, zone);
      const profile = {
        itemId: normalized.id,
        kind: normalized.kind,
        region: normalized.region,
        territory: normalized.territory,
        categoryTags: normalized.tags,
        guard,
        truth,
        zone,
        rightsLayer,
      };

      profiles.push(profile);
      zones.push({ itemId: normalized.id, zoneId: zone.id });

      if (!guard.passes || !truth.passes) {
        violations.push({
          itemId: normalized.id,
          guardIssues: guard.issues,
          truthIssues: truth.issues,
        });
      }
    }

    // Build pairwise comparison matrix for cross-zone analysis
    for (let i = 0; i < profiles.length; i += 1) {
      for (let j = i + 1; j < profiles.length; j += 1) {
        comparisons.push(this._compareProfiles(profiles[i], profiles[j]));
      }
    }

    return {
      engineVersion: this.version,
      thresholds: this.thresholds,
      zonesCatalog: this.zones,
      profiles,
      zones,
      violations,
      comparisons,
      summary: this._buildSummary(profiles),
    };
  }

  // ---------- Internal helpers ----------

  _normalizeItem(item) {
    if (!item || typeof item !== 'object') {
      throw new Error('RightsZoneEngine._normalizeItem: item must be an object.');
    }
    const id = String(item.id ?? `item-${Math.random().toString(36).slice(2)}`);
    const text = (item.text ?? '').toString();
    const meta = item.meta ?? {};
    const kind = (item.kind ?? meta.kind ?? 'unknown').toLowerCase();

    const region = meta.region ?? meta.country ?? 'unspecified-region';
    const territory = meta.territory ?? meta.state ?? meta.district ?? 'unspecified-territory';

    const tags = this._inferTags(kind, text, meta);

    return {
      id,
      kind,
      text,
      meta,
      region,
      territory,
      tags,
    };
  }

  _inferTags(kind, text, meta) {
    const lower = text.toLowerCase();
    const tags = new Set();

    // From kind
    if (kind.includes('health') || kind.includes('care')) tags.add('healthcare');
    if (kind.includes('house') || kind.includes('residential') || kind.includes('tenant')) {
      tags.add('housing');
      tags.add('residential');
    }
    if (kind.includes('financ') || kind.includes('bank') || kind.includes('token')) {
      tags.add('financial');
    }
    if (kind.includes('license') || kind.includes('licence')) {
      tags.add('licensing');
    }
    if (kind.includes('republic') || kind.includes('civic') || kind.includes('district')) {
      tags.add('republic');
      tags.add('civic');
    }
    if (kind.includes('machine') || kind.includes('device') || kind.includes('appliance')) {
      tags.add('machine');
    }
    if (kind.includes('network')) tags.add('network');
    if (kind.includes('augment') || kind.includes('xr') || kind.includes('cybernetic')) {
      tags.add('augmented-citizen');
    }
    if (kind.includes('open') || kind.includes('oss') || kind.includes('gpl') || kind.includes('mit')) {
      tags.add('opensource');
    }

    // From text
    if (lower.includes('health') || lower.includes('medical') || lower.includes('clinical')) {
      tags.add('healthcare');
    }
    if (lower.includes('housing') || lower.includes('residential') || lower.includes('tenant')) {
      tags.add('housing');
      tags.add('residential');
    }
    if (lower.includes('license') || lower.includes('licence') || lower.includes('copyleft')) {
      tags.add('licensing');
    }
    if (lower.includes('token') || lower.includes('erc-20') || lower.includes('wallet')) {
      tags.add('token');
      tags.add('financial');
    }
    if (lower.includes('open source') || lower.includes('open-source') || lower.includes('repository')) {
      tags.add('opensource');
    }
    if (lower.includes('district') || lower.includes('municipal') || lower.includes('jurisdiction')) {
      tags.add('district');
      tags.add('civic');
    }
    if (lower.includes('republic') || lower.includes('constitutional')) {
      tags.add('republic');
    }
    if (lower.includes('ai') || lower.includes('machine') || lower.includes('neural')) {
      tags.add('machine');
      tags.add('intelligence');
    }
    if (lower.includes('augmented') || lower.includes('cybernetic') || lower.includes('implant')) {
      tags.add('augmented-citizen');
    }

    // From meta tags if supplied
    if (Array.isArray(meta.tags)) {
      for (const t of meta.tags) tags.add(String(t).toLowerCase());
    }

    return Array.from(tags);
  }

  _evaluateFreedomSafety(normalized) {
    // Heuristic scoring from text + meta. This is intentionally conservative and auditable.
    const text = normalized.text.toLowerCase();
    let freedomScore = 0.5;
    let coercionScore = 0.0;

    // Positive indicators: explicit rights protection
    if (text.includes('freedom of')) freedomScore += 0.1;
    if (text.includes('no forced') || text.includes('no coercion')) freedomScore += 0.15;
    if (text.includes('informed consent') || text.includes('opt-in')) freedomScore += 0.15;
    if (text.includes('right to refuse') || text.includes('right to exit')) freedomScore += 0.15;
    if (text.includes('due process') || text.includes('appeal')) freedomScore += 0.1;

    // Negative indicators: coercive “safety”
    if (text.includes('mandatory') && !text.includes('opt-out')) coercionScore += 0.2;
    if (text.includes('forced') || text.includes('compulsory')) coercionScore += 0.2;
    if (text.includes('waive all rights') || text.includes('binding arbitration')) coercionScore += 0.2;
    if (text.includes('mass surveillance') || text.includes('bulk collection')) coercionScore += 0.2;
    if (text.includes('emergency powers without review')) coercionScore += 0.3;

    // Clamp
    freedomScore = Math.max(0, Math.min(1, freedomScore));
    coercionScore = Math.max(0, Math.min(1, coercionScore));

    const passes =
      freedomScore >= this.thresholds.minFreedomScore &&
      coercionScore <= this.thresholds.maxCoercionScore;

    const issues = [];
    if (!passes) {
      if (freedomScore < this.thresholds.minFreedomScore) {
        issues.push('Insufficient explicit protection of freedoms.');
      }
      if (coercionScore > this.thresholds.maxCoercionScore) {
        issues.push('Coercive or non-consensual safety measures detected.');
      }
    }

    return {
      freedomScore,
      coercionScore,
      passes,
      issues,
    };
  }

  _evaluateTruthVisibility(normalized) {
    const text = normalized.text.toLowerCase();
    let truthScore = 0.5;
    let obscurityScore = 0.0;

    // Positive indicators: transparency, audit, disclosure
    if (text.includes('audit') || text.includes('auditable')) truthScore += 0.1;
    if (text.includes('open data') || text.includes('open access')) truthScore += 0.15;
    if (text.includes('transparency') || text.includes('disclosure')) truthScore += 0.15;
    if (text.includes('reproducible') || text.includes('verifiable')) truthScore += 0.1;
    if (text.includes('independent review') || text.includes('public oversight')) truthScore += 0.15;

    // Negative indicators: secrecy and gag clauses
    if (text.includes('non-disparagement') || text.includes('gag order')) obscurityScore += 0.2;
    if (text.includes('non-disclosure') || text.includes('nda')) obscurityScore += 0.2;
    if (text.includes('classified') && !text.includes('declassification schedule')) obscurityScore += 0.1;
    if (text.includes('trade secret') && text.includes('health')) obscurityScore += 0.2;
    if (text.includes('proprietary algorithm') && text.includes('decision')) obscurityScore += 0.2;

    // Clamp
    truthScore = Math.max(0, Math.min(1, truthScore));
    obscurityScore = Math.max(0, Math.min(1, obscurityScore));

    const passes =
      truthScore >= this.thresholds.minTruthScore &&
      obscurityScore <= this.thresholds.maxObscurityScore;

    const issues = [];
    if (!passes) {
      if (truthScore < this.thresholds.minTruthScore) {
        issues.push('Insufficient transparency or auditability.');
      }
      if (obscurityScore > this.thresholds.maxObscurityScore) {
        issues.push('Secrecy mechanisms likely to hide material truths or remedies.');
      }
    }

    return {
      truthScore,
      obscurityScore,
      passes,
      issues,
    };
  }

  _assignZone(normalized, guard, truth) {
    const tagSet = new Set(normalized.tags);
    let bestZone = this.zones[0];
    let bestScore = -1;

    for (const zone of this.zones) {
      let score = 0;

      // Tag alignment
      for (const t of zone.targetUse) {
        if (tagSet.has(t)) score += 1;
      }

      // Governance quality bonus
      if (guard.passes) score += 1;
      if (truth.passes) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestZone = zone;
      }
    }

    return {
      id: bestZone.id,
      label: bestZone.label,
      description: bestZone.description,
      matchScore: bestScore,
    };
  }

  _buildRightsLayer(normalized, guard, truth, zone) {
    // A compact, machine-parsable policy-as-code layer for downstream engines.
    return {
      itemId: normalized.id,
      zoneId: zone.id,
      hardConstraints: {
        noFreedomForSafetyTrade: true,
        noRightsForLibertyTrade: true,
        requireInformedConsent: guard.freedomScore >= this.thresholds.minFreedomScore,
        forbidHighCoercion: guard.coercionScore <= this.thresholds.maxCoercionScore,
        forbidHighObscurity: truth.obscurityScore <= this.thresholds.maxObscurityScore,
      },
      softPreferences: {
        favorOpenSource: normalized.tags.includes('opensource'),
        favorAuditability: truth.truthScore >= 0.8,
        favorPublicOversight: truth.truthScore >= 0.85,
      },
      routingHints: {
        region: normalized.region,
        territory: normalized.territory,
        candidateUseCases: normalized.tags,
      },
    };
  }

  _compareProfiles(a, b) {
    const zoneEqual = a.zone.id === b.zone.id;
    const regionEqual = a.region === b.region;
    const territoryEqual = a.territory === b.territory;

    const freedomDelta = a.guard.freedomScore - b.guard.freedomScore;
    const truthDelta = a.truth.truthScore - b.truth.truthScore;

    return {
      pair: [a.itemId, b.itemId],
      sameZone: zoneEqual,
      sameRegion: regionEqual,
      sameTerritory: territoryEqual,
      higherFreedomItemId: freedomDelta === 0 ? null : freedomDelta > 0 ? a.itemId : b.itemId,
      higherTruthItemId: truthDelta === 0 ? null : truthDelta > 0 ? a.itemId : b.itemId,
      deltas: {
        freedom: freedomDelta,
        truth: truthDelta,
      },
    };
  }

  _buildSummary(profiles) {
    const byZone = {};
    const byRegion = {};
    const byTerritory = {};

    for (const p of profiles) {
      byZone[p.zone.id] = (byZone[p.zone.id] || 0) + 1;
      byRegion[p.region] = (byRegion[p.region] || 0) + 1;
      byTerritory[p.territory] = (byTerritory[p.territory] || 0) + 1;
    }

    return {
      totalItems: profiles.length,
      distributionByZone: byZone,
      distributionByRegion: byRegion,
      distributionByTerritory: byTerritory,
    };
  }
}

/**
 * Convenience function: sort and group items into zones + regional slices.
 * Returns a structure suitable for UI tables or further ALN planning.
 */
export function buildRegionalZoneIndex(zoningResult) {
  const index = {};

  for (const profile of zoningResult.profiles) {
    const region = profile.region;
    const territory = profile.territory;
    const zoneId = profile.zone.id;

    if (!index[region]) index[region] = {};
    if (!index[region][territory]) index[region][territory] = {};
    if (!index[region][territory][zoneId]) {
      index[region][territory][zoneId] = {
        zoneId,
        items: [],
      };
    }

    index[region][territory][zoneId].items.push({
      itemId: profile.itemId,
      kind: profile.kind,
      tags: profile.categoryTags,
      freedomScore: profile.guard.freedomScore,
      truthScore: profile.truth.truthScore,
    });
  }

  return index;
}

export default RightsZoneEngine;
