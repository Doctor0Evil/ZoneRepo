/**
 * Unified interface for all density backends.
 * Real GIS and synthetic generators must implement these methods.
 */
class DensityProvider {
  /**
   * @param {string} regionId
   * @param {number} t - simulation time (e.g., integer step)
   * @returns {number} people per area unit
   */
  getDensity(regionId, t) {
    throw new Error("getDensity() must be implemented");
  }

  /**
   * Optional: additional attributes (venue mix, transit, vulnerability, etc.)
   * @param {string} regionId
   * @returns {object}
   */
  getRegionAttributes(regionId) {
    return {};
  }

  /**
   * List all region IDs managed by this provider.
   * @returns {string[]}
   */
  listRegions() {
    throw new Error("listRegions() must be implemented");
  }
}

/**
 * Real-world GIS-backed density provider.
 * Wraps raster/polygon data preprocessed into a lookup structure.
 */
class RealGisDensityProvider extends DensityProvider {
  constructor({ regionMeta, densityByRegionAndTime }) {
    super();
    this.regionMeta = regionMeta;                  // { regionId: { attrs... }, ... }
    this.densityByRegionAndTime = densityByRegionAndTime; // { t: { regionId: density } }
  }

  getDensity(regionId, t) {
    const timeSlice = this.densityByRegionAndTime[t];
    if (!timeSlice) return this.regionMeta[regionId]?.baseDensity ?? 0;
    return timeSlice[regionId] ?? this.regionMeta[regionId]?.baseDensity ?? 0;
  }

  getRegionAttributes(regionId) {
    return this.regionMeta[regionId] || {};
  }

  listRegions() {
    return Object.keys(this.regionMeta);
  }
}

/**
 * Synthetic density provider: e.g., Gaussian clusters, fractal patterns, etc.
 * The generator is any function regionId -> density, optionally time-dependent.
 */
class SyntheticDensityProvider extends DensityProvider {
  constructor({ regionIds, generatorFn, attrProviderFn }) {
    super();
    this.regionIds = regionIds;              // array of synthetic region IDs
    this.generatorFn = generatorFn;          // (regionId, t) => density
    this.attrProviderFn = attrProviderFn || (() => ({}));
  }

  getDensity(regionId, t) {
    return this.generatorFn(regionId, t);
  }

  getRegionAttributes(regionId) {
    return this.attrProviderFn(regionId);
  }

  listRegions() {
    return this.regionIds;
  }
}

module.exports = {
  DensityProvider,
  RealGisDensityProvider,
  SyntheticDensityProvider,
};
