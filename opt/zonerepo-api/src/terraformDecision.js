const ZONES = [
  {
    id: 'prod-us-west',
    environment: 'prod',
    description: 'Primary production zone in us-west-2',
    workspacePatterns: ['zone-prod-us-west', 'prod-*'],
    riskLevel: 'critical'
  },
  {
    id: 'stg-us-west',
    environment: 'staging',
    description: 'Staging zone in us-west-2',
    workspacePatterns: ['zone-stg-*'],
    riskLevel: 'high'
  }
];

const CLIENTS = [
  {
    id: 'perplexity-chat',
    kind: 'ai-chat',
    maxEnvironment: 'prod', // can touch prod, but with stricter policies
    requireHumanApprovalAbove: 'staging',
    allowedActions: ['plan', 'apply']
  },
  {
    id: 'generic-ai-browser',
    kind: 'ai-browser',
    maxEnvironment: 'staging',
    requireHumanApprovalAbove: 'dev',
    allowedActions: ['plan']
  }
];

const POLICY_RULES = [
  {
    id: 'ZR-GLOBAL-CRITICAL-FINDINGS-BLOCK',
    scope: {},
    condition: {
      requireNoHighFindings: true
    },
    effect: 'deny',
    messageTemplate:
      'High or critical severity findings detected: {{maxSeverity}}. ZoneRepo blocks this run.'
  },
  {
    id: 'ZR-PROD-FORBID-DESTROY',
    scope: {
      environments: ['prod']
    },
    condition: {
      forbidDestroyInProd: true
    },
    effect: 'deny',
    messageTemplate: 'Destroy plans in prod are forbidden by ZoneRepo.'
  },
  {
    id: 'ZR-CLIENT-BROWSER-STAGING-ONLY',
    scope: {
      clients: ['generic-ai-browser']
    },
    condition: {},
    effect: 'deny',
    messageTemplate:
      'AI browser clients cannot operate on environment "{{environment}}".'
  }
];

const severityRank = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function findZone(terraform) {
  const workspaceName = terraform.workspaceName || '';
  const explicitZone = terraform.variables?.ZR_ZONE;

  if (explicitZone) {
    return ZONES.find((z) => z.id === explicitZone) || null;
  }

  return (
    ZONES.find((z) =>
      z.workspacePatterns?.some((p) =>
        workspaceName.toLowerCase().includes(p.toLowerCase())
      )
    ) || null
  );
}

function findClient(terraform) {
  const clientId = terraform.variables?.ZR_CLIENT || 'unknown';
  return CLIENTS.find((c) => c.id === clientId) || {
    id: clientId,
    kind: 'unknown',
    maxEnvironment: 'dev',
    requireHumanApprovalAbove: 'dev',
    allowedActions: ['plan']
  };
}

function computeMaxSeverity(factoryResult) {
  if (!factoryResult || !Array.isArray(factoryResult.findings)) return 'info';
  let max = 'info';
  for (const f of factoryResult.findings) {
    const sev = (f.severity || 'info').toLowerCase();
    if ((severityRank[sev] || 0) > (severityRank[max] || 0)) {
      max = sev;
    }
  }
  return max;
}

function envRank(env) {
  if (env === 'prod') return 3;
  if (env === 'staging') return 2;
  if (env === 'dev') return 1;
  return 0;
}

function applyTemplate(template, context) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] != null ? String(context[key]) : '';
  });
}

export function evaluateTerraformDecision(input) {
  const { ticketId, terraform, factoryResult } = input;
  const zone = findZone(terraform) || {
    id: 'unknown',
    environment: 'dev',
    description: 'Unknown zone',
    riskLevel: 'medium'
  };
  const client = findClient(terraform);
  const maxSeverity = computeMaxSeverity(factoryResult);
  const environment = zone.environment;

  const context = {
    ticketId: ticketId || null,
    zone: zone.id,
    environment,
    client: client.id,
    maxSeverity
  };

  // Quick global checks
  if (severityRank[maxSeverity] >= severityRank['high']) {
    const rule = POLICY_RULES[0];
    const reason = applyTemplate(rule.messageTemplate, context);
    return {
      decision: rule.effect,
      reason,
      reportUrl: null,
      outcomes: [
        {
          outcomeId: rule.id,
          description: 'High/critical findings present',
          body: `Max severity: ${maxSeverity}. Zone: ${zone.id}.`
        }
      ],
      metadata: context
    };
  }

  if (terraform.isDestroy && environment === 'prod') {
    const rule = POLICY_RULES[1];
    const reason = applyTemplate(rule.messageTemplate, context);
    return {
      decision: rule.effect,
      reason,
      reportUrl: null,
      outcomes: [
        {
          outcomeId: rule.id,
          description: 'Destroy in prod forbidden',
          body: 'ZoneRepo policy forbids destroy plans in prod.'
        }
      ],
      metadata: context
    };
  }

  // Client vs environment check
  const envLevel = envRank(environment);
  const maxEnvLevel = envRank(client.maxEnvironment);
  if (envLevel > maxEnvLevel) {
    const rule = POLICY_RULES[2];
    const reason = applyTemplate(rule.messageTemplate, context);
    return {
      decision: rule.effect,
      reason,
      reportUrl: null,
      outcomes: [
        {
          outcomeId: rule.id,
          description: 'Client not allowed in this environment',
          body: `Client "${client.id}" is not permitted to operate on environment "${environment}".`
        }
      ],
      metadata: context
    };
  }

  // Default allow
  return {
    decision: 'allow',
    reason: `ZoneRepo: no blocking policies matched for zone "${zone.id}" (env=${environment}, client=${client.id}, maxSeverity=${maxSeverity}).`,
    reportUrl: null,
    outcomes: [],
    metadata: context
  };
}
