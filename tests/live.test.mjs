import test from 'node:test';
import assert from 'node:assert/strict';
import { WonderdraftLive } from '../server/live.mjs';
function setup() {
  const window={app:'process:C:\\Program Files\\Wonderdraft\\Wonderdraft.exe',id:5,title:'Wonderdraft'};
  const calls=[];
  const sky={list_windows:async()=>[window,{app:'process:Other.exe',id:8}],activate_window:async()=>{},get_window:async()=>window,
    get_window_state:async()=>({window,accessibility:{focused_element:'text field'},screenshots:[{id:'s',width:100,height:100,url:'data:image/png;base64,eA=='}]}),
    click:async a=>calls.push(a),press_key:async a=>calls.push(a)};
  return {controller:new WonderdraftLive(sky),calls};
}
test('Only Wonderdraft windows are selected; action tokens cannot replay',async()=>{
  const {controller,calls}=setup();
  assert.equal((await controller.windows()).length,1);
  const state=await controller.observe();
  await controller.act(state.token,{type:'click',x:10,y:20});
  assert.equal(calls.length,1);
  await assert.rejects(controller.act(state.token,{type:'click',x:10,y:20}),/stale/);
  assert.equal(calls.length,1);
});
test('Out-of-window points and desktop shortcuts never inject input',async()=>{
  const {controller,calls}=setup();
  let state=await controller.observe();
  await assert.rejects(controller.act(state.token,{type:'click',x:100,y:20}),/outside/);
  state=await controller.observe();
  await assert.rejects(controller.act(state.token,{type:'key',key:'Windows+r'}),/Unsupported/);
  assert.equal(calls.length,0);
});
