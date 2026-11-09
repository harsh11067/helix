# helix-mcp — your HELIX trading memory in Claude Code (or any MCP client)

HELIX writes every conviction, settled outcome, calibration score and lesson to
**Walrus Memory on mainnet**. This tiny MCP server exposes that memory as tools, so an
agent can check your track record *before* you trade. It calls only the public HELIX
compiler API (`HELIX_API`) — no Walrus Memory key, no Tatum key, no wallet key.

| tool | what it returns |
|---|---|
| `helix_memory(address, limit?)` | recent memories, each with its Walrus blob id and source tx |
| `helix_credibility(address)` | Brier per voice (you / Predict market / HELIX model / Polymarket crowd), overall and per setup |
| `helix_lessons(address, bucket?)` | plain-language lessons (written only after 3+ settled outcomes in a setup) |
| `helix_preview(conviction)` | the order HELIX would place now + what your memory would change |

## Claude Code

```bash
cd mcp && npm install
```

`.mcp.json` at your project root (or `claude mcp add helix-memory -- node /abs/path/mcp/server.mjs`):

```json
{
  "mcpServers": {
    "helix-memory": {
      "command": "node",
      "args": ["/absolute/path/to/helix/mcp/server.mjs"],
      "env": { "HELIX_API": "https://helix-compiler.onrender.com" }
    }
  }
}
```

Then ask: *"I'm thinking of going long BTC with high confidence in a choppy market. What does
my HELIX memory say about 0x…?"*

## Smoke test

```bash
HELIX_API=https://helix-compiler.onrender.com npm run smoke -- 0x<address>
```
