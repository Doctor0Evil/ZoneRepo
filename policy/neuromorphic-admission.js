#!/usr/bin/env node
/**
 * Minimal Kubernetes admission webhook for neuromorphic pods.
 * Treats each pod as a "concept" and each admission as a transition
 * under a NeuromorphicEthicalCeiling profile.
 */

import http from "node:http";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || 8443;

// Helper: approximate node metrics from pod spec.
function estimateNodeMetrics(pod) {
  const annotations = pod.metadata?.annotations || {};
  const telemetryFlags = {};
  let powerWatts = 0;
  let energyKwhPerDay = 0;

  const containers = pod.spec?.containers || [];
  for (const c of containers) {
    const limits = c.resources?.limits || {};
    const cpu = parseFloat((limits["cpu"] || "0").toString().replace("m", "")) || 0;
    const mem = parseFloat((limits["memory"] || "0").toString().replace("Mi", "")) || 0;

    // Crude proxies; you can swap in your eco-weighted function.
    powerWatts += cpu * 0.5 + mem * 0.01;
    energyKwhPerDay += powerWatts * 24.0 / 1000.0;
  }

  // FearIndex components: start from annotations; fall back to eco/BCI labels.
  let fearIndexNode = parseFloat(annotations["neuromorphic.zonerepo.io/fear-index-node"] || "0") || 0;
  let ecoFearNode = parseFloat(annotations["neuromorphic.zonerepo.io/eco-fear-node"] || "0") || 0;
  const irreversibleBio = annotations["neuromorphic.zonerepo.io/irreversible-biorisk"] === "true";

  if (annotations["neuromorphic.zonerepo.io/node-class"]?.includes("bci")) {
    fearIndexNode = Math.max(fearIndexNode, 0.4);
  }
  if (powerWatts > 0) {
    ecoFearNode = Math.max(ecoFearNode, Math.min(1.0, energyKwhPerDay / 50.0));
  }

  return {
    fear_index_node: fearIndexNode,
    eco_fear_node: ecoFearNode,
    irreversible_bio_risk: irreversibleBio,
    power_watts: powerWatts,
    energy_kwh_per_day: energyKwhPerDay,
    telemetry_flags: telemetryFlags,
  };
}

// Call Rust verifier via a CLI that reads JSON on stdin and writes JSON decision.
function callRustVerifier(spec, metrics) {
  return new Promise((resolve, reject) => {
    const child = spawn("neuromorphic-policy-cli", [], { stdio: ["pipe", "pipe", "inherit"] });
    const payload = JSON.stringify({ spec, metrics });

    child.stdin.write(payload);
    child.stdin.end();

    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`neuromorphic-policy-cli exited with ${code}`));
      }
      try {
        const decision = JSON.parse(out.trim());
        resolve(decision);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function buildAdmissionReview(uid, allowed, reason) {
  return {
    apiVersion: "admission.k8s.io/v1",
    kind: "AdmissionReview",
    response: {
      uid,
      allowed,
      status: allowed
        ? undefined
        : {
            code: 403,
            message: reason,
          },
    },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end();
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString("utf8");
  });

  req.on("end", async () => {
    try {
      const review = JSON.parse(body);
      const reqObj = review.request;
      const kind = reqObj.kind?.kind;
      const uid = reqObj.uid;

      if (kind !== "Pod" && kind !== "Deployment") {
        const resp = buildAdmissionReview(uid, true, "");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resp));
      }

      const obj = reqObj.object;
      const annotations = obj.metadata?.annotations || {};
      const npaName = annotations["neuromorphic.zonerepo.io/attestation-name"];
      const npaNamespace =
        annotations["neuromorphic.zonerepo.io/attestation-namespace"] || obj.metadata?.namespace;

      if (!npaName || !npaNamespace) {
        const resp = buildAdmissionReview(
          uid,
          false,
          "missing NeuromorphicPolicyAttestation reference (neuromorphic.zonerepo.io/attestation-name)"
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(resp));
      }

      // In-cluster lookup via projected file or sidecar; here we assume a
      // pre-populated JSON cache at /var/run/zonerepo/attestations.
      const path = `/var/run/zonerepo/attestations/${npaNamespace}_${npaName}.json`;
      const spec = JSON.parse(await import("node:fs/promises").then((m) => m.readFile(path, "utf8")));

      const metrics = estimateNodeMetrics(obj);
      const decision = await callRustVerifier(spec, metrics);

      const resp = buildAdmissionReview(uid, !!decision.allowed, decision.reason || "");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(resp));
    } catch (err) {
      const resp = {
        apiVersion: "admission.k8s.io/v1",
        kind: "AdmissionReview",
        response: {
          uid: "",
          allowed: false,
          status: {
            code: 500,
            message: `neuromorphic policy admission error: ${err.message}`,
          },
        },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(resp));
    }
  });
});

server.listen(PORT, () => {
  // log to stdout for cluster operators; no greedy semantics here.
});
