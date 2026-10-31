---
name: wonderdraft
description: Inspect or edit Wonderdraft native map files, or operate the live Wonderdraft desktop application through this local MCP server.
---

# Wonderdraft

Native tools inspect files and save label edits to a new filename. Call map_roots first. Work inside those roots. Never overwrite a map being edited live. Save a copy, then open that copy in Wonderdraft after checking for unsaved work. A successful native encode does not prove the app can render every map feature; inspect the result in Wonderdraft.

## Live session setup

Live tools use an explicit bridge inside the trusted Codex Node REPL because Sky requires its host approval and execution context. The bridge is per REPL session. Do not emulate or bypass Computer Use approvals. Read the installed computer-use skill and its guidance before UI actions.

Initialize using the computer-use skill, obtaining the real `sky` object. Import this package's `server/bridge.mjs` by its actual absolute file URL, and assign `globalThis.wdBridge = await startBridge(sky)`. Keep credentials in `.runtime/` private; never print or copy its JSON into notes.

Each live MCP request must run concurrently with an explicitly awaited `wdBridge.pump()` in the same active trusted REPL execution context. Use `functions.exec` to await both tool calls with `Promise.all`: the discovered Wonderdraft MCP live tool, and `mcp__node_repl__js` with code `await wdBridge.pump({maxRequests:1,timeoutMs:10000})`. Do not call a live MCP tool alone and block waiting for an unpumped bridge. Do not launch a background infinite pump: it loses the trusted execution context. Native map tools need no pump.

Call live_windows, select one Wonderdraft window, then live_observe. Inspect the returned screenshot and accessibility tree. Every action consumes one observation token and returns a refreshed observation. Never guess coordinates, element indexes, or reuse consumed tokens. Tokens expire after 60 seconds. Refresh after errors, user interaction, layout changes or focus changes. Bring offscreen dialogs onscreen or use an observed editable element via live_set_value. Confirm text focus before live_type_text. A key or click can trigger save/export/destructive behavior: apply the installed Computer Use confirmation policy to the concrete action.

Map coordinates differ from screenshot coordinates: native label x/y use map pixels; live click/drag use the returned screenshot's window coordinates. Live drag draws a straight segment using the selected app tool. Select and verify the app tool before drawing.

If the REPL resets, reattach the bridge. If a live operation reports an error, observe before retrying; input may already have occurred. Do not silently retry a drawing stroke or save.
