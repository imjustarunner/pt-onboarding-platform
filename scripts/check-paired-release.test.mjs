import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForPairedRelease} from './check-paired-release.mjs';
const candidate='a'.repeat(40);
test('accepts only the matching ready paired image',async()=>{
 await waitForPairedRelease({candidate,read:async()=>({buildId:candidate,ready:true}),timeoutMs:0});
 for(const version of [null,{buildId:'b'.repeat(40),ready:true},{buildId:candidate,ready:false}])await assert.rejects(waitForPairedRelease({candidate,read:async()=>version,timeoutMs:0}),/not promoted/);
});
test('waits for staging to finish and never treats a failed read as ready',async()=>{
 let clock=0,calls=0;await waitForPairedRelease({candidate,read:async()=>{calls++;if(calls===1)throw Error('offline');return {buildId:candidate,ready:true};},now:()=>clock,sleep:async ms=>clock+=ms,pollMs:1,timeoutMs:2});assert.equal(calls,2);
 await assert.rejects(waitForPairedRelease({candidate,read:async()=>{throw Error('offline');},timeoutMs:0}),/could not be verified/);
});
