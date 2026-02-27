/**
 * Extract a concise, human-readable summary of ledger anchors
 * from a ZoneRepo Safety Certificate or SovereignCargo-like certificate.
 */
export function summarizeLedgerAnchors(cert) {
  const anchors = cert?.proof?.anchors || cert?.anchors || [];
  const issuer = cert?.issuer?.id || cert?.issuer;
  const id = cert?.id;

  const summary = {
    id,
    issuer,
    anchors: anchors.map((a) => ({
      type: a.type,
      network: a.network,
      txHash: a.txHash,
      sourceId: a.sourceId,
    })),
  };

  return summary;
}
