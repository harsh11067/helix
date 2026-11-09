// W5-01 smoke test: start the MCP server over stdio, list its tools, call one.
//   HELIX_API=http://localhost:8081 node smoke.mjs [0xaddress]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('./server.mjs', import.meta.url).pathname], env: { ...process.env } });
const client = new Client({ name: 'helix-smoke', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log('tools:', names.join(', '));
const want = ['helix_credibility', 'helix_lessons', 'helix_memory', 'helix_preview'];
if (want.some((w) => !names.includes(w))) { console.error('missing tools'); process.exit(1); }
const addr = process.argv[2];
if (addr) {
  const r = await client.callTool({ name: 'helix_credibility', arguments: { address: addr } });
  console.log('helix_credibility →', r.content[0].text.slice(0, 600));
}
await client.close();
console.log('SMOKE PASS');
