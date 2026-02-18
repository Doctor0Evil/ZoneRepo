import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';

// Environment configuration
const PORT = process.env.PORT || 8090;
const TFC_HMAC_SECRET = process.env.TFC_HMAC_SECRET || '';           // optional
const FACTORY_WEBHOOK_URL = process.env.FACTORY_WEBHOOK_URL;         // required
const ZONEREPO_API_BASE = process.env.ZONEREPO_API_BASE;             // required
const ZONEREPO_API_TOKEN = process.env.ZONEREPO_API_TOKEN || '';     // bearer token
const CALLBACK_URL_TTL_MS = 15 * 60 * 1000;                          // 15 minutes

if (!FACTORY_WEBHOOK_URL) throw new Error('FACTORY_WEBHOOK_URL is required');
if (!ZONEREPO_API_BASE) throw new Error('ZONEREPO_API_BASE is required');

function verifyHmac(rawBody, signatureHeader, secret) {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signatureHeader, 'utf8')
  );
}

function isFreshCallbackUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const ts = Number(u.searchParams.get('created-at') || 0);
    if (!ts) return true;
    return Date.now() - ts < CALLBACK_URL_TTL_MS;
  } catch {
    return true;
  }
}

async function sendTerraformCallback(callbackUrl, token, status, message, reportUrl) {
  const body = {
    data: {
      type: 'task-results',
      attributes: {
        status,    // "running" | "passed" | "failed"
        message,
        url: reportUrl || null
      }
    }
  };

  const res = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Terraform callback error: ${res.status} ${res.statusText} – ${text}`
    );
  }
}

async function forwardToSophosFactory(payload) {
  const res = await fetch(FACTORY_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Sophos Factory webhook error: ${res.status} ${res.statusText} – ${text}`
    );
  }

  // Optionally parse pipeline output if the Job is synchronous
  try {
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function queryZoneRepoDecision(payload, factoryResult) {
  const ticketId =
    payload?.data?.attributes?.configuration_version_id ||
    payload?.data?.attributes?.run_id ||
    null;

  const body = {
    ticketId,
    terraform: {
      runId: payload?.data?.id || null,
      attributes: payload?.data?.attributes || {}
    },
    factoryResult: factoryResult || null
  };

  const res = await fetch(`${ZONEREPO_API_BASE}/v1/terraform/decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ZONEREPO_API_TOKEN ? `Bearer ${ZONEREPO_API_TOKEN}` : ''
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `ZoneRepo decision error: ${res.status} ${res.statusText} – ${text}`
    );
  }

  const data = await res.json();
  // Expected shape: { decision: "allow" | "deny", reason, reportUrl }
  return data;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/tfc/run-task') {
    res.writeHead(404);
    return res.end('Not found');
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const signature = req.headers['x-terraform-signature'] || '';

    if (!verifyHmac(rawBody, signature, TFC_HMAC_SECRET)) {
      res.writeHead(401);
      return res.end('Invalid HMAC signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.writeHead(400);
      return res.end('Invalid JSON');
    }

    const callbackUrl = payload?.data?.attributes?.task_result_callback_url;
    const accessToken = payload?.data?.attributes?.access_token;

    try {
      // Early feedback: mark as running
      if (callbackUrl && accessToken && isFreshCallbackUrl(callbackUrl)) {
        await sendTerraformCallback(
          callbackUrl,
          accessToken,
          'running',
          'ZoneRepo: policy evaluation in progress (Sophos scan running)',
          null
        );
      }

      // 1) Execute Sophos Factory pipeline
      const factoryResult = await forwardToSophosFactory(payload);

      // 2) Ask ZoneRepo for a final decision
      const decision = await queryZoneRepoDecision(payload, factoryResult);

      let status = 'failed';
      if (decision.decision === 'allow') status = 'passed';
      else if (decision.decision === 'deny') status = 'failed';

      const message = decision.reason || 'ZoneRepo policy decision applied';
      const reportUrl = decision.reportUrl || null;

      if (callbackUrl && accessToken && isFreshCallbackUrl(callbackUrl)) {
        await sendTerraformCallback(
          callbackUrl,
          accessToken,
          status,
          message,
          reportUrl
        );
      }

      res.writeHead(200);
      res.end('Task handled by ZoneRepo bridge');
    } catch (err) {
      console.error(err);
      if (callbackUrl && accessToken && isFreshCallbackUrl(callbackUrl)) {
        try {
          await sendTerraformCallback(
            callbackUrl,
            accessToken,
            'failed',
            'ZoneRepo bridge error – see logs',
            null
          );
        } catch (e2) {
          console.error('Secondary callback error', e2);
        }
      }
      res.writeHead(500);
      res.end('Internal error');
    }
  });
});

server.listen(PORT, () => {
  console.log(`ZoneRepo Terraform–Sophos bridge listening on :${PORT}`);
});
