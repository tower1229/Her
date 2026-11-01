// Test-only persistent client. All state and credentials come from the
// isolated child environment; only the public SDK export is imported.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const require = createRequire(path.join(process.env.OPENCLAW_PACKAGE_ROOT, 'package.json'));
const { GatewayClient } = await import(pathToFileURL(require.resolve('openclaw/plugin-sdk/gateway-runtime')).href);
const emit = value => process.stdout.write('HER_RPC ' + JSON.stringify(value) + '\n');
const client = new GatewayClient({
  url: process.env.HER_LIVE_GATEWAY_URL,
  token: process.env.OPENCLAW_GATEWAY_TOKEN,
  clientName: 'cli', mode: 'cli', role: 'operator',
  scopes: ['operator.admin'],
  onHelloOk: () => emit({ ready: true }),
  onConnectError: error => emit({ connectionError: error.message }),
});
client.start();
const input = readline.createInterface({ input: process.stdin });
input.on('line', async line => {
  const request = JSON.parse(line);
  try {
    const result = await client.request(request.method, request.params, { timeoutMs: request.timeout });
    emit({ id: request.id, result });
  } catch (error) { emit({ id: request.id, error: error.message }); }
});
input.on('close', async () => { await client.stopAndWait({ timeoutMs: 3000 }); process.exit(); });
