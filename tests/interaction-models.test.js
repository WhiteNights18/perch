import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,decodeState,arrange,overlaps} from '../lib/layout.js';
import {photoInstances,photoSettings} from '../lib/instances.js';
import {parseLyrics,lyricAt} from '../lib/lyrics.js';
test('multiple frames retain independent sources, pause and collision-free layouts',()=>{
 let value=JSON.stringify([{id:'photo-aaaaaaaa',source:'/a',paused:false},{id:'photo-bbbbbbbb',source:'/b',paused:true}]);
 const settings={get_string:()=>value,set_string:(_,v)=>{value=v;}};
 photoSettings(settings,'photo-aaaaaaaa').set_boolean('photo-paused',true);
 assert.equal(photoInstances(settings)[0].paused,true);
 assert.equal(photoSettings(settings,'photo-bbbbbbbb').get_string('photo-source'),'/b');
 const state=defaultState(); state.layout['photo-aaaaaaaa']={x:0,y:0,w:6,h:6};state.layout['photo-bbbbbbbb']={x:0,y:0,w:8,h:8};
 state.tasks=[{id:'1',text:'提交作业',done:false}];
 const restored=decodeState(JSON.stringify(state)); assert.deepEqual(restored,state);
 const placed=arrange(restored.layout,['photo-aaaaaaaa','photo-bbbbbbbb'],30,30);
 assert.equal(overlaps(...Object.values(placed)),false);
});
test('invalid task state is protected and old notes migrate',()=>{
 const s=defaultState(); s.noteModified=1791900000000; assert.equal(decodeState(JSON.stringify(s)).noteModified,s.noteModified); delete s.noteModified; assert.equal(decodeState(JSON.stringify(s)).noteModified,0); delete s.tasks;assert.deepEqual(decodeState(JSON.stringify(s)).tasks,[]);
 s.tasks=[{id:'x',text:'x',done:'yes'}];assert.throws(()=>decodeState(JSON.stringify(s)));
});
test('LRC timestamps, multiple tags and offset follow playback and seek',()=>{
 const lines=parseLyrics('[offset:-500]\n[00:01.50][00:05.00]第一句\n[00:03]第二句');
 assert.equal(lyricAt(lines,0),'');assert.equal(lyricAt(lines,1),'第一句');
 assert.equal(lyricAt(lines,3),'第二句');assert.equal(lyricAt(lines,5),'第一句');
});
