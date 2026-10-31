import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MapPaths } from './paths.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const mapRoots = process.env.WONDERDRAFT_MAP_ROOTS ? JSON.parse(process.env.WONDERDRAFT_MAP_ROOTS) :
  [path.join(process.env.APPDATA || base, 'Wonderdraft', 'maps'), path.join(base, 'maps')];
const paths = new MapPaths(mapRoots);
const native = process.env.WONDERDRAFT_NATIVE || path.join(base, 'bin', 'wonderdraft-native.exe');
let live;
async function getLive() {
  if (live) return live;
  const call=async(method,args={})=>{
    let config;
    try {config=JSON.parse(await readFile(path.join(base,'.runtime','live-bridge.json'),'utf8'));}
    catch {throw new Error('Live bridge is not attached. Start server/bridge.mjs inside trusted Codex node_repl using the Wonderdraft skill. Native map tools remain available.');}
    if(!Number.isInteger(config.port)||config.port<1||config.port>65535) throw new Error('Invalid live bridge port');
    let response;
    try {response=await fetch(`http://127.0.0.1:${config.port}/call`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.secret}`},body:JSON.stringify({method,...args}),signal:AbortSignal.timeout(120000)});}
    catch {throw new Error('Live bridge is unavailable; reattach it in trusted Codex node_repl.');}
    const result=await response.json();
    if(!response.ok||result.error) throw new Error(result.error||'Live bridge failed');
    return result.result;
  };
  live={windows:()=>call('windows'),observe:id=>call('observe',{id}),activate:id=>call('activate',{id}),act:(token,action)=>call('act',{token,action})};
  return live;
}
async function nativeCall(request) {
  request.path = await paths.check(request.path);
  if (request.output) request.output = await paths.check(request.output, true);
  const child = execFile(native, [], {timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide:true});
  const result = await new Promise((resolve,reject) => {
    let stdout='', stderr='';
    child.stdout.on('data', d => {stdout += d; if(stdout.length > 8*1024*1024) {child.kill(); reject(new Error('Native response too large'));}});
    child.stderr.on('data', d => {stderr = (stderr + d).slice(-4096);});
    child.on('error',reject);
    child.on('close',code => { if(code) reject(new Error(`Native backend failed (${code}): ${stderr}`)); else {try {resolve(JSON.parse(stdout));} catch(e) {reject(e);}} });
    child.stdin.on('error',reject);
    child.stdin.end(JSON.stringify(request));
  });
  if (!result.ok) throw new Error(result.error);
  return result.result;
}
const textResult = result => ({content:[{type:'text',text:JSON.stringify(result,null,2)}]});
function stateResult(state) {
  const {screenshots,...meta} = state;
  return {content:[{type:'text',text:JSON.stringify({...meta,screenshots:screenshots.map(({url,...s})=>s)},null,2)},
    ...screenshots.map(s => {const match = /^data:(image\/[^;]+);base64,(.+)$/s.exec(s.url); if(!match) throw new Error('Unsupported screenshot encoding'); return {type:'image',mimeType:match[1],data:match[2]};})]};
}
export function createServer() {
  const server = new McpServer({name:'wonderdraft-mcp',version:'0.1.0'},{instructions:`Read ${path.join(base,'skills','wonderdraft','SKILL.md')} before live control. Native map tools run directly. Live tools require a bridge attached in trusted Codex node_repl; run each live tool concurrently with an awaited wdBridge.pump() in that REPL. Never block on a live tool without pumping.`});
  const tool = (name,description,schema,fn,readonly=false) => server.registerTool(name,{
    description,inputSchema:schema,annotations:{readOnlyHint:readonly,destructiveHint:!readonly,openWorldHint:false}},
    async args => {try{return await fn(args);}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
  tool('map_roots','List configured directories allowed for native map access.',{},async()=>textResult({roots:mapRoots}),true);
  tool('inspect_map','Inspect a saved Wonderdraft map without changing it.',{path:z.string()},async a=>textResult(await nativeCall({op:'inspect',...a})),true);
  tool('list_labels','List saved map labels and stable array indexes for this file revision.',{path:z.string()},async a=>textResult(await nativeCall({op:'list_labels',...a})),true);
  tool('rename_label','Rename one label in a NEW map file. The source is preserved and existing outputs are refused.',{
    path:z.string(),output:z.string(),label_index:z.number().int().nonnegative(),text:z.string().max(4096)},
    async a=>textResult(await nativeCall({op:'rename_label',...a})));
  tool('add_label','Clone an existing label style at map coordinates, saving to a NEW file. Requires an existing label template.',{
    path:z.string(),output:z.string(),template_index:z.number().int().nonnegative(),text:z.string().max(4096),x:z.number().finite(),y:z.number().finite()},
    async a=>textResult(await nativeCall({op:'add_label',...a})));
  tool('live_windows','List only currently open Wonderdraft windows.',{},async()=>textResult(await (await getLive()).windows()),true);
  tool('live_observe','Bring Wonderdraft forward and return screenshot, focus and a single-use action token.',{window_id:z.number().int().optional()},async a=>stateResult(await (await getLive()).observe(a.window_id)));
  tool('live_activate','Restore/activate a selected Wonderdraft window and return a fresh observation.',{window_id:z.number().int().optional()},async a=>stateResult(await (await getLive()).activate(a.window_id)));
  const token = z.string();
  tool('live_click_element','Click an accessibility element from the latest Wonderdraft tree.',{token,element_index:z.number().int().nonnegative()},async a=>stateResult(await (await getLive()).act(a.token,{type:'element_click',...a})));
  tool('live_set_value','Set the value of an observed editable Wonderdraft element, including a native map filename field.',{token,element_index:z.number().int().nonnegative(),value:z.string().max(4096)},async a=>stateResult(await (await getLive()).act(a.token,{type:'set_value',...a})));
  tool('live_click','Click a point from the latest screenshot. Consumes observation token and returns refreshed state.',{token,x:z.number(),y:z.number(),button:z.enum(['left','right','middle']).default('left')},async a=>stateResult(await (await getLive()).act(a.token,{type:'click',...a})));
  tool('live_drag','Draw one straight canvas stroke or drag a control. Use only coordinates inspected in the latest screenshot.',{token,from_x:z.number(),from_y:z.number(),to_x:z.number(),to_y:z.number()},async a=>stateResult(await (await getLive()).act(a.token,{type:'drag',...a})));
  tool('live_scroll','Scroll/zoom at an observed window point.',{token,x:z.number(),y:z.number(),scrollX:z.number().min(-1200).max(1200).default(0),scrollY:z.number().min(-1200).max(1200)},async a=>stateResult(await (await getLive()).act(a.token,{type:'scroll',...a})));
  tool('live_key','Send a restricted Wonderdraft key chord (for example Control_L+o or Escape). Inspect result before continuing.',{token,key:z.string().max(80)},async a=>stateResult(await (await getLive()).act(a.token,{type:'key',...a})));
  tool('live_type_text','Type literal text into a verified focused Wonderdraft text field.',{token,text:z.string().max(4096)},async a=>stateResult(await (await getLive()).act(a.token,{type:'text',...a})));
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createServer().connect(new StdioServerTransport());
}
