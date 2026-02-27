/**
 * Given a parsed BDL object with safetyFlags and fields,
 * mask high-risk fields before sharing.
 *
 * Expected shape:
 *   {
 *     metadata: {
 *       safetyFlags: ["maskSecrets", "biosignalSensitive"],
 *       framingType: "...",
 *       ...
 *     },
 *     fields: [
 *       { name, role, value, entropy, sensitiveHints: ["biosignal", ...] },
 *       ...
 *     ]
 *   }
 */
export function maskBdlObjectForSharing(bdlObject) {
  const meta = bdlObject.metadata || {};
  const flags = new Set(meta.safetyFlags || []);
  const maskSecrets = flags.has("maskSecrets");
  const biosignalSensitive = flags.has("biosignalSensitive");

  const maskedFields = (bdlObject.fields || []).map((f) => {
    const shouldMask =
      (maskSecrets && isSecretLike(f)) ||
      (biosignalSensitive && isBiosignalLike(f));

    if (!shouldMask) return f;

    return {
      ...f,
      value: null,
      masked: true,
      maskReason: deriveMaskReason(f, { maskSecrets, biosignalSensitive }),
    };
  });

  return {
    ...bdlObject,
    fields: maskedFields,
    metadata: {
      ...meta,
      maskedAt: new Date().toISOString(),
    },
  };
}

function isSecretLike(field) {
  const highEntropy = typeof field.entropy === "number" && field.entropy > 0.85;
  const roleSecret = (field.role || "").toLowerCase().includes("secret");
  const nameHint = /(key|token|password|auth|nonce)/i.test(field.name || "");
  return highEntropy || roleSecret || nameHint;
}

function isBiosignalLike(field) {
  const hints = (field.sensitiveHints || []).map((h) => h.toLowerCase());
  if (hints.includes("biosignal") || hints.includes("bci-signal")) return true;
  const name = (field.name || "").toLowerCase();
  return /ecg|eeg|emg|bci|pulse|heartrate/.test(name);
}

function deriveMaskReason(field, opts) {
  const reasons = [];
  if (opts.maskSecrets && isSecretLike(field)) reasons.push("secret-like");
  if (opts.biosignalSensitive && isBiosignalLike(field)) reasons.push("biosignal-sensitive");
  return reasons.join(", ") || "masked-by-policy";
}
