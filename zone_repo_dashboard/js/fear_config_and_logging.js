/**
 * High-level JSON schema (conceptual) for configuring ethical ceilings
 * and fear-index behavior in ZoneRepo.
 */
const ethicalConfigSchema = {
  type: "object",
  required: ["global", "regions", "logging"],
  properties: {
    global: {
      type: "object",
      required: ["ethicalCeiling", "hardStops"],
      properties: {
        ethicalCeiling: { type: "number", minimum: 0 },
        hardStops: {
          type: "object",
          properties: {
            maxSystemicHarm: { type: "number" },
            maxEcologicalDamage: { type: "number" },
            maxRegret: { type: "number" },
          },
        },
      },
    },
    regions: {
      type: "array",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          ethicalCeilingMultiplier: { type: "number" }, // e.g. 0.5 for fragile regions
        },
      },
    },
    logging: {
      type: "object",
      required: ["enabled"],
      properties: {
        enabled: { type: "boolean" },
        outputFile: { type: "string" },
        minFearToLog: { type: "number" },
      },
    },
  },
};

/**
 * A tiny in-process logger for fear metrics. In a real system, you'd
 * push this to a proper log pipeline / database.
 */
const fs = require("fs");
const path = require("path");

class FearLogger {
  /**
   * @param {Object} loggingConfig - part of the config matching `logging` schema.
   */
  constructor(loggingConfig) {
    this.enabled = loggingConfig.enabled;
    this.minFearToLog = loggingConfig.minFearToLog ?? 0.0;
    this.outputFile =
      loggingConfig.outputFile ||
      path.join(__dirname, "fear_metrics.log.jsonl");

    if (this.enabled) {
      fs.writeFileSync(this.outputFile, "", { encoding: "utf8" });
    }
  }

  /**
   * Record a single metric entry.
   * @param {Object} entry
   * @param {number} entry.step
   * @param {string} entry.regionId
   * @param {string} entry.conceptKey
   * @param {number} entry.systemicHarm
   * @param {number} entry.regret
   * @param {number} entry.ecologicalDamage
   * @param {number} entry.totalFear
   */
  log(entry) {
    if (!this.enabled) return;
    if (entry.totalFear < this.minFearToLog) return;

    const line = JSON.stringify({
      ts: Date.now(),
      step: entry.step,
      regionId: entry.regionId,
      conceptKey: entry.conceptKey,
      systemicHarm: entry.systemicHarm,
      regret: entry.regret,
      ecologicalDamage: entry.ecologicalDamage,
      totalFear: entry.totalFear,
    });

    fs.appendFileSync(this.outputFile, line + "\n", { encoding: "utf8" });
  }
}

module.exports = {
  ethicalConfigSchema,
  FearLogger,
};
