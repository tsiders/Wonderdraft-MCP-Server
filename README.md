# Wonderdraft MCP Server

A Windows local MCP server for inspecting and editing Wonderdraft map files and controlling the live Wonderdraft application.

Native file tools run independently. Live control requires an active Codex desktop Computer Use session and a trusted Node REPL bridge.

## Features

- Inspect map metadata and list labels.
- Add labels using an existing label's style or rename existing labels.
- Save native edits to a new file; existing outputs are never overwritten.
- Observe the live app, click coordinates or accessibility elements, drag, scroll, send restricted key chords, and enter text.
- Require fresh, single-use observation tokens for live actions and return refreshed app state.

## Requirements

- Windows and Wonderdraft.
- Node.js and npm.
- The Windows native backend in `bin/wonderdraft-native.exe`, or Rust to build it from source.
- For live control: Codex desktop with Computer Use and its trusted Node REPL available.

## Setup

Run these commands from the repository directory:

```powershell
npm ci --ignore-scripts
```

To build or rebuild the native backend:

```powershell
cargo build --release --manifest-path native/Cargo.toml
Copy-Item -LiteralPath native/target/release/wonderdraft-native.exe -Destination bin/wonderdraft-native.exe
```

Configure your MCP client to launch `node` with the absolute path to `server/index.mjs`. For example:

```json
{
  "mcpServers": {
    "wonderdraft": {
      "command": "node",
      "args": ["C:/path/to/wonderdraft-mcp/server/index.mjs"]
    }
  }
}
```

Use the configuration format required by your client. The included `mcp.json` supplies a plugin-relative configuration.

`npm start` launches the stdio MCP server. It communicates over stdin/stdout rather than presenting an interactive terminal interface.

### Map directories

Native tools allow access to these directories by default:

- `%APPDATA%\Wonderdraft\maps`
- The repository's `maps` directory

Set `WONDERDRAFT_MAP_ROOTS` to a JSON array of existing absolute directories to override them. Set `WONDERDRAFT_NATIVE` to override the native executable path.

Native edits create a separate map file. Open that copy in Wonderdraft to verify the result before relying on it.

## Live control

Read [the Wonderdraft workflow](skills/wonderdraft/SKILL.md) and the installed Computer Use skill before interacting with the app.

Initialize the real `sky` object in the trusted Codex Node REPL according to the Computer Use skill. Then import `server/bridge.mjs` using the absolute file URL for your checkout:

```javascript
// Replace this example URL with your checkout location.
globalThis.wdBridge = await (
  await import('file:///C:/path/to/wonderdraft-mcp/server/bridge.mjs')
).startBridge(sky);
```

For each live tool request, concurrently dispatch that MCP call and a trusted Node REPL call running:

```javascript
await wdBridge.pump({maxRequests: 1, timeoutMs: 10000});
```

The live request waits for the pump. Keep actions sequential: observe the app, inspect its screenshot and accessibility tree, choose an action, and inspect the refreshed state.

The bridge requires an active trusted execution context to preserve the host's Computer Use approval flow. A standalone MCP process cannot supply that context. Do not run a background pump outside an active trusted REPL call.

The bridge binds to loopback on an ephemeral port. Its per-session credential is stored in the Git-ignored `.runtime/` directory. Do not publish this directory. Close the bridge with `await wdBridge.close()` and reattach after a REPL reset or session change.

## Tests

```powershell
npm test
cargo test --release --manifest-path native/Cargo.toml
```

Tests cover observation-token replay, coordinate and key restrictions, native map round trips, Unicode labels, preservation of unrelated map data, and refusal to overwrite existing outputs.

The real-map tests require the [official sample map](https://github.com/Megasploot/Wonderdraft/blob/master/treasure.wonderdraft_map) at `native/tests/treasure.wonderdraft_map` and skip that coverage if the fixture is absent. The Node integration test creates a new proof map in `maps/`.

The optional `tests/live-smoke.mjs` check requires an attached live bridge and a concurrent pump for three requests. It observes the app and sends Escape, so it is excluded from the automatic test suite.

## Limitations

- Native editing currently supports labels only. Structured symbol, road, terrain, river, and territory editing is not implemented.
- Adding a native label requires an existing label to use as a style template.
- Live control is specific to Windows and an active Codex desktop Computer Use session.
- Higher-level live drawing/export workflows and map-to-window coordinate calibration are not implemented.
- The native backend's exclusive file publishing requires a filesystem supporting hard links, such as NTFS.

This is an unofficial experimental integration and is not affiliated with or endorsed by Wonderdraft.

## References and attribution

- [Miracledraft Map Helper](https://github.com/Glumbosch/miracledraft_map_helper) — Native parser reference. See [provenance](native/NOTICE.txt) and the [third-party license](native/THIRD_PARTY_LICENSE).
- [Official Wonderdraft repository](https://github.com/Megasploot/Wonderdraft)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)