import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';

const PORT = process.env.PORT || 8080;

// Configuration – inject via environment or secret manager
const TFC_HMAC_SECRET = process.env.TFC_HMAC_SECRET || ''; // optional
const FACTORY_WEBHOOK_URL = process.env.FACTORY_WEBHOOK_URL; // required
const CALLBACK_STATUS_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

if (!FACTORY_WEBHOOK_URL) {
  throw new Error('FACTORY_WEBHOOK_URL is required');
}

function verifyHmacSignature(rawBody, signatureHeader, secret) {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Terraform Cloud sends hex digest; adjust if you use custom format
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signatureHeader, 'utf8')
  );
}

async function forwardToSophosFactory(payload) {
  // Terraform Cloud Run Task payload is forwarded as-is
  const resp = await fetch(FACTORY_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Sophos Factory webhook error: ${resp.status} ${resp.statusText} – ${text}`
    );
  }

  return resp;
}

async function sendTerraformCallback(callbackUrl, accessToken, status, message, reportUrl) {
  const body = {
    data: {
      type: 'task-results',
      attributes: {
        status,    // "running" | "passed" | "failed"
        message,   // short text shown in Terraform run UI
        url: reportUrl || null
      }
    }
  };

  const resp = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Terraform callback error: ${resp.status} ${resp.statusText} – ${text}`
    );
  }
}

function isCallbackUrlFresh(callbackUrl) {
  try {
    const u = new URL(callbackUrl);
    const ts = Number(u.searchParams.get('created-at') || 0);
    if (!ts) return true;
    return Date.now() - ts < CALLBACK_STATUS_URL_TTL_MS;
  } catch {
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/tfc/run-task') {
    res.writeHead(404);
    return res.end('Not found');
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const signature = req.headers['x-terraform-signature'] || '';

    if (!verifyHmacSignature(rawBody, signature, TFC_HMAC_SECRET)) {
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

    // Send immediate "running" callback to Terraform
    const callbackUrl = payload?.data?.attributes?.task_result_callback_url;
    const accessToken = payload?.data?.attributes?.access_token;

    try {
      if (callbackUrl && accessToken && isCallbackUrlFresh(callbackUrl)) {
        await sendTerraformCallback(
          callbackUrl,
          accessToken,
          'running',
          'Sophos Factory scan started',
          null
        );
      }

      // Forward to Sophos Factory Job webhook
      await forwardToSophosFactory(payload);

      // For simple setups where Sophos immediately returns status,
      // you could parse that response and send a final callback here.
      // In the canonical example, Sophos Factory itself performs the callback.

      res.writeHead(200);
      res.end('Task accepted');
    } catch (err) {
      console.error(err);
      // Inform Terraform that the task has failed at the bridge
      if (callbackUrl && accessToken && isCallbackUrlFresh(callbackUrl)) {
        try {
          await sendTerraformCallback(
            callbackUrl,
            accessToken,
            'failed',
            'Sophos Factory bridge error – see logs',
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
  console.log(`Terraform–Sophos Factory bridge listening on :${PORT}`);
});
