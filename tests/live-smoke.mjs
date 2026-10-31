// Explicit opt-in desktop verification, excluded from the automatic test suite.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const client=new Client({name:'wonderdraft-live-verification',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server/index.mjs',import.meta.url))]}));
try {
  const windows=await client.callTool({name:'live_windows',arguments:{}});
  console.log(JSON.stringify(windows));
  if(windows.isError) process.exitCode=1;
  else {
    const state=await client.callTool({name:'live_observe',arguments:{}});
    if(state.isError) throw new Error(JSON.stringify(state));
    const meta=JSON.parse(state.content[0].text);
    if(!state.content.some(c=>c.type==='image')) throw new Error('Missing live screenshot');
    const next=await client.callTool({name:'live_key',arguments:{token:meta.token,key:'Escape'}});
    if(next.isError) throw new Error(JSON.stringify(next));
    console.log(JSON.stringify({live_observe:'passed',live_key_escape:'passed',window:meta.window}));
  }
} finally {await client.close();}
