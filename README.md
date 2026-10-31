---
type: documentation
created: 2026-10-31
updated: 2026-10-31
project: "[[Wonderdraft MCP Server]]"
tags:
  - type/documentation
---

# Wonderdraft MCP Server Setup

A Windows local stdio MCP prototype with 15 tools. Native map tools run independently. Live tools use the installed Codex Computer Use runtime through an explicit trusted Node REPL bridge.

## Implemented

- Native: list allowed map directories, inspect map metadata, list labels, rename an existing label, add a label by cloning an existing label's style.
- Live: list Wonderdraft windows, activate and observe the app, click coordinates or accessibility elements, drag straight strokes, scroll, send restricted key chords, type into a verified focus, and set an observed editable element value.
- Native output is always a new file. Existing output filenames are rejected. Original files remain unchanged.
- Live operations require a fresh single-use observation token; they return updated screenshots and focus information.

## Installed Location

`D:\repos\Wonderdraft MCP Server`

The global Codex MCP entry is named `wonderdraft`. It launches `server/index.mjs` using an absolute Node executable path. Registration is verified with `codex mcp get wonderdraft`. This does not establish that the current chat has refreshed its tool catalog.

Native default map roots:

- `%APPDATA%\Wonderdraft\maps`
- This package's `maps` directory

Set `WONDERDRAFT_MAP_ROOTS` to a JSON array of existing absolute directories to change them. `WONDERDRAFT_NATIVE` can override the native executable path. Do not point native tools at a currently open map and overwrite it through other software; save a new file, then deliberately open the new file in Wonderdraft.

## Start or Rebuild

Requirements: Node.js, installed npm dependencies, and the included Windows native executable. Rust is needed only to rebuild the native backend.

```powershell
npm ci --ignore-scripts
npm start
```

Run commands in the package directory. `npm start` speaks MCP JSON-RPC on stdin/stdout; it is not an interactive terminal UI.

Rebuild the native executable:

```powershell
cargo build --release --manifest-path native/Cargo.toml
Copy-Item -LiteralPath native/target/release/wonderdraft-native.exe -Destination bin/wonderdraft-native.exe
```

## Attach Live Control

Read `skills/wonderdraft/SKILL.md` and the installed computer-use skill before live app interaction. Initialize `sky` in the trusted Codex Node REPL as that skill directs, then:

```javascript
globalThis.wdBridge = await (
  await import('file:///D:/repos/Wonderdraft%20MCP%20Server/server/bridge.mjs')
).startBridge(sky);
```

For each live tool call, concurrently await that MCP tool and a trusted Node REPL call running:

```javascript
await wdBridge.pump({maxRequests: 1, timeoutMs: 10000});
```

Both calls must be dispatched together, for example using `functions.exec` with `Promise.all` over the two tool calls. A live MCP call alone waits for the pump. Keep actions sequential, observe before choosing an input, and inspect refreshed state after each action.

The bridge binds only to loopback on an ephemeral port and requires a per-session random bearer credential. The credential is stored under `.runtime/`, excluded from version control; do not publish it or store it in the vault. Close with `await wdBridge.close()`. Reattach after a REPL reset or chat change. Do not reuse a background pump outside an active trusted execution context.

Why this exists: standalone Sky app access reported `Computer Use requires app approval but elicitations are unavailable`. The trusted bridge preserves the actual host approval flow. It does not bypass it.

## Verification

Verified against installed Wonderdraft 1.1.8.2 on 2026-10-31:

- Three Node tests passed: token replay and coordinate/key restrictions, plus a real stdio MCP discovery/native file-edit round trip.
- Four native Rust tests passed, including decoded whole-map byte preservation after reversing a label edit, Unicode labels, add-label coordinates, and refused overwrite.
- The official sample map was read successfully; source file SHA-256 remained unchanged after edits.
- An MCP-created map with an additional label opened and rendered in Wonderdraft.
- A real stdio MCP client verified live window discovery, screenshot observation, and a harmless Escape input through the trusted bridge.
- npm production dependency audit reported zero vulnerabilities after dependency updates.

```powershell
npm test
cargo test --release --manifest-path native/Cargo.toml
```

The real-map integration test expects the official sample at `native/tests/treasure.wonderdraft_map` and skips if unavailable. It creates a new proof map in `maps/`. The explicit `tests/live-smoke.mjs` check needs the attached bridge and a concurrently awaited pump for three requests. It changes app focus and sends Escape; it is excluded from automatic tests.

## Limits and Next Work

Native tools currently edit labels only; symbols, roads, landmasses, rivers, and territories need additional structured operations and tests. Live inputs provide access to those tools through Wonderdraft's UI, but higher-level semantic wrappers and full drawing/export workflows have not been verified. Map-to-window coordinate calibration is not implemented.

Live control is currently specific to an active Codex desktop Computer Use session on Windows. It is not a standalone remote ChatGPT service. No API key or cloud hosting is required. New/restarted Codex sessions may be needed for registered MCP tools to appear; the actual tool catalog must be checked before claiming discovery.

The plugin manifest and skill are included for packaging. The server was registered directly as a local MCP server; no account plugin upload or public publication was performed. Dependency directories, `.runtime`, build intermediates and official sample maps must be excluded from a redistributed archive.

## Sources

- [Miracledraft Map Helper](https://github.com/Glumbosch/miracledraft_map_helper) — Unlicense parser reference; provenance in `native/NOTICE.txt`.
- [Official Wonderdraft repository](https://github.com/Megasploot/Wonderdraft) — Official sample map and documentation.
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp)

## Related Notes

- [[Wonderdraft MCP Server]]
- [[REA]]
