import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState, decodeState} from '../lib/layout.js';
import {coverPalette, luminance, reorder} from '../lib/workflows.js';
test('old notes migrate without losing legacy text, new histories and deleted tasks persist', () => {
 const old=defaultState(); old.note='已有内容'; delete old.notes;
 assert.equal(decodeState(JSON.stringify(old)).note,'已有内容');
 const state=defaultState(); state.notes=[{id:'main',text:'第二版',modified:10,history:['第一版']}];
 state.activeNoteId='main';state.deletedTasks=[{index:0,task:{id:'t',text:'恢复任务',done:false}}];
 state.launcherSizes={labels:{w:12,h:8},icons:{w:8,h:6}};
 assert.deepEqual(decodeState(JSON.stringify(state)),state);
 state.notes[0].history=[42];assert.throws(()=>decodeState(JSON.stringify(state)));
});
test('reorder moves only the selected app and preserves membership',()=>{
 assert.deepEqual(reorder(['a','b','c'],0,2),['b','c','a']);
 assert.deepEqual(reorder(['a','b','c'],2,0),['c','a','b']);
 assert.deepEqual(reorder(['a','b'],-1,2),['a','b']);
});
test('cover palettes and interpolated colors keep white text above 4.5:1',()=>{
 const palettes=[];
 for(let r=0;r<=255;r+=51)for(let g=0;g<=255;g+=51)for(let b=0;b<=255;b+=51){
  const palette=coverPalette([r,g,b]);palettes.push(palette);
  for(const c of palette)assert.ok(1.05/(luminance(c)+0.05)>=4.5);
 }
 for(let i=1;i<palettes.length;i++)for(const t of [0,.25,.5,.75,1]){
  const mix=palettes[i][0].map((c,j)=>c*t+palettes[i-1][0][j]*(1-t));
  assert.ok(1.05/(luminance(mix)+0.05)>=4.5);
 }
});
