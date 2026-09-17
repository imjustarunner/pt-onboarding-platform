import test from 'node:test';
import assert from 'node:assert/strict';
import {listPublicReferralNetwork} from '../publicReferralNetwork.service.js';
test('shared directory uses approved ITSCO companies and includes managed organizations once',async()=>{
 let query;
 const companies=await listPublicReferralNetwork({database:{execute:async sql=>{query=sql;return [[{id:1,name:'ITSCO alternate',url:'https://www.itsco.health/contact',category:'Counseling'},{id:2,name:'Community company',url:'https://community.example',category:'Housing'}]];}},identities:async()=>[{slug:'itsco',name:'ITSCO',url:'https://itsco.health',industries:['Mental health'],comingSoon:false},{slug:'ptco',name:'PlotTwistCo',url:'https://plottwistco.com',industries:['Management'],comingSoon:false}]});
 assert.match(query,/a.slug='itsco'/);assert.match(query,/e.is_active=1/);assert.match(query,/e.approval_status='approved'/);assert.doesNotMatch(query,/e\.notes|e\.email|e\.phone|e\.\*/);
 assert.deepEqual(companies.map(c=>c.name),['Community company','ITSCO','PlotTwistCo']);
});
