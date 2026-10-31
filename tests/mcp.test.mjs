import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=path.join(root,'native','tests','treasure.wonderdraft_map');
test('Real MCP discovery and native map edit round trip',async t=>{
  try {await access(fixture);} catch {t.skip('Download official sample to native/tests/treasure.wonderdraft_map first');return;}
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'server','index.mjs')],
    env:{...process.env,WONDERDRAFT_MAP_ROOTS:JSON.stringify([path.dirname(fixture),path.join(root,'maps')])}});
  const client=new Client({name:'wonderdraft-verification',version:'1.0.0'});
  await client.connect(transport);
  try {
    const tools=await client.listTools();
    assert.equal(tools.tools.length,15);
    const call=async(name,args)=>{const r=await client.callTool({name,arguments:args}); assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);};
    const hash=buf=>createHash('sha256').update(buf).digest('hex');
    const before=hash(await readFile(fixture));
    const labels=await call('list_labels',{path:fixture});
    assert.ok(labels.labels.length);
    const output=path.join(root,'maps',`mcp-proof-${randomUUID()}.wonderdraft_map`);
    await call('add_label',{path:fixture,output,template_index:0,text:'MCP Connected',x:2048,y:1024});
    const after=await call('list_labels',{path:output});
    assert.equal(after.labels.length,labels.labels.length+1);
    assert.equal(after.labels.at(-1).text,'MCP Connected');
    assert.equal(hash(await readFile(fixture)),before);
    const refused=await client.callTool({name:'rename_label',arguments:{path:fixture,output,label_index:0,text:'bad'}});
    assert.equal(refused.isError,true);
    const outside=await client.callTool({name:'inspect_map',arguments:{path:path.join(root,'package.json')}});
    assert.equal(outside.isError,true);
    console.log('Proof map:',output);
  } finally {await client.close();}
});
