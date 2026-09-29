import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schoolCareBridgeDeployment,routingDestination,mintRoutingHint,consumeRoutingHint} from '../schoolCareBridgeRouting.service.js';
const enabled={SCHOOLCAREBRIDGE_PUBLIC_ORIGIN:'https://schoolcarebridge.org',SCHOOLCAREBRIDGE_LEGACY_REDIRECT_ENABLED:'true'};
function database(){const records=new Map();let expired=false;return {records,expire:()=>{expired=true;},async execute(sql,args=[]){
 if(sql.startsWith('INSERT'))records.set(args[0],{username:args[1],destination:args[2]});
 if(sql.startsWith('SELECT')){const row=records.get(args[0]);return [[row && row.destination===args[1] && !expired?{username:row.username}:null].filter(Boolean)];}
 if(sql.startsWith('DELETE')&&args.length)records.delete(args[0]);return [[]];
 },async getConnection(){return {...this,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};}};}
test('default stays at MH4Kidz and redirects remain disabled',async()=>{
 assert.equal(schoolCareBridgeDeployment({}).legacyRedirectEnabled,false);
 assert.equal(routingDestination('ashley',{}),'https://mh4kidz.org/schoolcarebridge/app/ashley');
 const db=database();assert.equal(await mintRoutingHint(db,{username:'staff@example.test',slug:'ashley'},{}),null);assert.equal(db.records.size,0);
});
test('rejects arbitrary destinations and unsafe school slugs',()=>{
 for(const origin of ['http://schoolcarebridge.org','https://evil.test','https://schoolcarebridge.org.evil.test','https://user@schoolcarebridge.org','https://schoolcarebridge.org/path'])assert.throws(()=>schoolCareBridgeDeployment({SCHOOLCAREBRIDGE_PUBLIC_ORIGIN:origin}));
 assert.throws(()=>routingDestination('../evil',enabled));
});
test('routing hints are opaque, destination-bound and single use',async()=>{
 const db=database();const redirect=await mintRoutingHint(db,{username:'staff@example.test',slug:'ashley'},enabled);const url=new URL(redirect);const token=url.searchParams.get('routingHint');
 assert.ok(!redirect.includes('staff'));assert.equal(db.records.has(token),false);
 assert.equal(await consumeRoutingHint(db,{token,destination:'https://schoolcarebridge.org/app/other'},enabled),null);
 assert.equal(await consumeRoutingHint(db,{token,destination:'https://schoolcarebridge.org/app/ashley'},enabled),'staff@example.test');
 assert.equal(await consumeRoutingHint(db,{token,destination:'https://schoolcarebridge.org/app/ashley'},enabled),null);
});
test('expired hints and disabled rollout cannot be consumed',async()=>{
 const db=database();const url=new URL(await mintRoutingHint(db,{username:'staff@example.test',slug:'ashley'},enabled));const token=url.searchParams.get('routingHint');const destination='https://schoolcarebridge.org/app/ashley';
 assert.equal(await consumeRoutingHint(db,{token,destination},{}),null);db.expire();assert.equal(await consumeRoutingHint(db,{token,destination},enabled),null);
});
test('multi-school hints return to the school selector without choosing a school',async()=>{
 const db=database();const url=new URL(await mintRoutingHint(db,{username:'multi@example.test',slug:''},enabled));
 assert.equal(url.pathname,'/app');
 assert.equal(await consumeRoutingHint(db,{token:url.searchParams.get('routingHint'),destination:'https://schoolcarebridge.org/app'},enabled),'multi@example.test');
});
