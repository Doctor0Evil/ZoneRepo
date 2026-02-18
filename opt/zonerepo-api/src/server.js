import http from 'http';
import { evaluateTerraformDecision } from './terraformDecision.js';

const PORT = process.env.PORT || 8081;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/terraform/decision') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }

      const result = evaluateTerraformDecision(input);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`ZoneRepo API listening on :${PORT}`);
});
