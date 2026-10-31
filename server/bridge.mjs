// Start inside trusted node_repl with its existing sky object. This preserves
// the host's Computer Use approval flow rather than emulating an approval UI.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {WonderdraftLive} from './live.mjs';
const configFile=fileURLToPath(new URL('../.runtime/live-bridge.json',import.meta.url));
export async function startBridge(sky) {
  const live=new WonderdraftLive(sky);
  const secret=randomBytes(32).toString('hex');
  const pending=[];
  let wake;
  const server=http.createServer(async(req,res)=>{
    const respond=(code,obj)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(obj));};
    if(req.method!=='POST'||req.url!=='/call'||req.headers.authorization!==`Bearer ${secret}`) return respond(403,{error:'Forbidden'});
    let body='';
    try {
      for await(const chunk of req) {body+=chunk;if(body.length>32768) throw new Error('Request too large');}
      const call=JSON.parse(body);
      const execute=async()=>{
        switch(call.method) {
          case 'windows':return live.windows();
          case 'observe':return live.observe(call.id);
          case 'activate':return live.activate(call.id);
          case 'act':return live.act(call.token,call.action);
          default:throw new Error('Unknown Wonderdraft operation');
        }
      };
      // Sky needs an active trusted REPL execution context. The HTTP callback
      // only queues work; pump() must be awaited by an explicit REPL call.
      let task;
      const result=new Promise((resolve,reject)=>{task={execute,resolve,reject,expires:Date.now()+110000,cancelled:false};pending.push(task);});
      res.on('close',()=>{if(!res.writableEnded) task.cancelled=true;});
      wake?.();
      respond(200,{result:await result});
    } catch(e) {respond(400,{error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  server.unref();
  await mkdir(fileURLToPath(new URL('../.runtime/',import.meta.url)),{recursive:true});
  await writeFile(configFile,JSON.stringify({port:server.address().port,secret}),{mode:0o600});
  return {port:server.address().port,
    pump:async({maxRequests=1,timeoutMs=10000}={})=>{
      let completed=0;
      for(let i=0;i<maxRequests;i++) {
        if(!pending.length) await new Promise(resolve=>{const timer=setTimeout(()=>{wake=undefined;resolve();},timeoutMs);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});
        const task=pending.shift(); if(!task) break;
        if(task.cancelled||Date.now()>task.expires) {task.reject(new Error('Live request cancelled or expired'));continue;}
        try {task.resolve(await task.execute());} catch(e) {task.reject(e);}
        completed++;
      }
      return {completed};
    },
    close:async()=>{server.close();await unlink(configFile).catch(()=>{});}};
}
