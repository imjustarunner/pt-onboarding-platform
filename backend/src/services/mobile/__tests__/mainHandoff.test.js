import {it as test,afterAll} from 'vitest';
import assert from 'node:assert/strict';
import pool from '../../../config/database.js';
import {createMobileMainHandoff,mobileMainTrustedOrigins} from '../mainHandoff.service.js';
afterAll(()=>pool.end());
const NOW=Date.parse('2026-11-11T15:00:00Z'),TOKEN='a'.repeat(64);
const agency={id:2,name:'Practice Two',portal_url:'itsco'};
function setup(options={}){
 const calls=[];
 const context={user:{id:7,email:'test@example.invalid',role:'provider'},surface:'staff',device:{id:4,client_id:'web',primary_authentication_json:{sessionKey:'original-primary-session',authMethod:'google',issuedAt:Math.floor(NOW/1000)-86400}}};
 const unlocked={userId:7,agencyId:2,mobileDeviceSessionId:4,credentialVersion:3,expiresAt:new Date(NOW+600000)};
 const handler=createMobileMainHandoff({
  touch:async(...args)=>{calls.push(['touch',...args]);return {...unlocked,...options.unlocked};},
  access:async(...args)=>{calls.push(['access',...args]);if(options.accessError)throw options.accessError;return {...context,...options.context};},
  assertProduct:async id=>{calls.push(['product',id]);if(options.productError)throw options.productError;},
  agencies:async()=>({agencies:options.agencies||[agency],qaAgencyIds:options.qaAgencyIds??null}),
  getActor:async()=>({role:'provider',...options.actor}),
  clientContext:async(request,clientId,agencyId)=>{calls.push(['client',request.quickView,clientId,agencyId]);return {client:{id:clientId},actor:{role:'provider'},agency:{id:agencyId},fullProfileUrl:'https://app.itsco.health/admin/clients/55',...options.client};},
  sign:async(...args)=>{calls.push(['sign',...args]);return 'main-cookie-secret';},
  buildUrl:options.buildUrl||((a,path)=>`https://app.itsco.health/${path}`),
  trustedOrigins:mobileMainTrustedOrigins('https://platform.example.invalid'),now:()=>NOW,newSessionId:()=> 'fresh-session',
  settings:{jwt:{secret:'signing-secret'},authCookie:{set:()=>({path:'/',sameSite:'none',httpOnly:true,secure:true,maxAge:86400000})}}
 });
 return {calls,handler};
}
function request(body={},headers={}){return {method:'POST',body:{sessionToken:TOKEN,kind:'client',agencyId:'2',clientId:'55',...body},headers:{origin:'https://auricwell.com','content-type':'application/x-www-form-urlencoded','sec-fetch-mode':'navigate','sec-fetch-dest':'document',host:'app.itsco.health',...headers}};}
function response(){return {headers:{},cookies:[],setHeader(key,value){this.headers[key]=value;},cookie(...args){this.cookies.push(args);},redirect(status,url){this.redirectStatus=status;this.location=url;},status(status){this.statusCode=status;return this;},json(body){this.body=body;}};}
async function run(options={},req=request()){const f=setup(options),res=response();await f.handler(req,res);return {...f,res,req};}
test('client handoff rechecks primary grant, product, fresh target agency and client without extending workspace',async()=>{
 const f=await run();assert.equal(f.res.redirectStatus,303);assert.equal(f.res.location,'/admin/clients/55?mobileHandoff=1&mobileHandoffAgency=2');
 assert.deepEqual(f.calls.find(c=>c[0]==='touch').slice(1),[TOKEN,{activity:false}]);
 assert.deepEqual(f.calls.find(c=>c[0]==='access').slice(1),[4,7,2,3]);assert.ok(f.calls.find(c=>c[0]==='product'));assert.ok(f.calls.find(c=>c[0]==='client'));
 const sign=f.calls.find(c=>c[0]==='sign');assert.deepEqual(sign[1],{id:7,email:'test@example.invalid',role:'provider',agencyId:2,product:'full_suite',authMethod:'mobile',sessionId:'fresh-session'});assert.equal(sign[3].expiresIn,300);
 assert.deepEqual(f.res.cookies,[['authToken','main-cookie-secret',{path:'/',sameSite:'none',httpOnly:true,secure:true,maxAge:300000}]]);
 assert.equal(f.req.body.sessionToken,undefined);assert.equal(f.req.sanitizedBody,'[PRIVATE MOBILE HANDOFF]');assert.equal(f.res.headers['Referrer-Policy'],'no-referrer');assert.equal(f.res.headers['Cache-Control'],'no-store');
 assert.equal(JSON.stringify({location:f.res.location,body:f.res.body}).includes(TOKEN),false);
});
test('schedule handoff uses server-derived selected agency and is bounded by remaining mobile lock time',async()=>{
 const f=await run({unlocked:{expiresAt:new Date(NOW+41000)}},request({kind:'schedule',clientId:undefined}));assert.equal(f.res.location,'/my-schedule?mobileHandoff=1&mobileHandoffAgency=2');assert.equal(f.calls.find(c=>c[0]==='sign')[3].expiresIn,41);assert.equal(f.calls.some(c=>c[0]==='client'),false);
});
test('legacy passcode and expired grants never mint a main token',async()=>{
 for(const unlocked of [{mobileDeviceSessionId:null},{expiresAt:new Date(NOW)},{expiresAt:'invalid'}]){const f=await run({unlocked});assert.equal(f.res.statusCode,401);assert.equal(f.calls.some(c=>c[0]==='sign'),false);assert.equal(f.res.cookies.length,0);}
});
test('revoked or locked device denial remains a denial and does not reveal error content',async()=>{
 for(const status of [401,423]){const f=await run({accessError:Object.assign(new Error(TOKEN),{status})});assert.equal(f.res.statusCode,status);assert.equal(f.res.cookies.length,0);assert.equal(JSON.stringify(f.res.body).includes(TOKEN),false);}
});
test('family and missing or invalid primary proofs are not staff handoff credentials',async()=>{
 for(const context of [{surface:'family'},{user:{id:7,role:'client'}},{device:{primary_authentication_json:null}},{device:{primary_authentication_json:{sessionKey:'',issuedAt:1}}},{device:{primary_authentication_json:{sessionKey:'key',issuedAt:Math.floor(NOW/1000)+1000}}}]){
  const f=await run({context});assert.ok([401,403].includes(f.res.statusCode));assert.equal(f.res.cookies.length,0);
 }
});
test('removed agency, changed effective role or product identity cannot be transferred',async()=>{
 for(const options of [{agencies:[{id:8}]},{actor:{role:'client'}},{productError:Object.assign(new Error('Product unavailable'),{status:403})}]){const f=await run(options);assert.equal(f.res.statusCode,403);assert.equal(f.calls.some(c=>c[0]==='sign'),false);}
});
test('QA scope never becomes an unrestricted main token, including an approved QA target',async()=>{
 for(const options of [
  {qaAgencyIds:[450],agencies:[{id:450,name:'Synthetic QA',portal_url:'auricwell-qa-demo'}]},
  {qaAgencyIds:[2]},
  {qaAgencyIds:[]},
  {context:{qaAgencyIds:[2]}},
  {context:{user:{id:7,email:'qa@example.invalid',role:'provider',is_demo:true}}},
  {context:{user:{id:7,email:'qa@example.invalid',role:'provider',is_demo:'1'}}}
 ]){
  const f=await run(options,request({agencyId:String(options.agencies?.[0]?.id||2)}));
  assert.equal(f.res.statusCode,403);assert.equal(f.res.cookies.length,0);assert.equal(f.calls.some(call=>call[0]==='sign'||call[0]==='client'),false);
 }
});
test('full profile requires authorized matching client and full main-chart role',async()=>{
 for(const client of [{fullProfileUrl:null},{client:{id:88}},{agency:{id:8}},{actor:{role:'school_staff'}}]){const f=await run({client});assert.equal(f.res.statusCode,403);assert.equal(f.res.cookies.length,0);}
 const school=await run({actor:{role:'school_admin'}});assert.equal(school.res.statusCode,403);
});
test('untrusted, missing and opaque origins are rejected before looking up any private grant',async()=>{
 for(const origin of ['https://attacker.example','', 'null','https://auricwell.com/forged']){const f=await run({},request({}, {origin}));assert.equal(f.res.statusCode,403);assert.equal(f.calls.length,0);assert.equal(f.req.body.sessionToken,undefined);}
});
test('only top-level form navigation can transfer a session',async()=>{
 for(const headers of [{'content-type':'application/json'},{'sec-fetch-mode':'cors'},{'sec-fetch-dest':'iframe'}]){const f=await run({},request({},headers));assert.ok([400,403].includes(f.res.statusCode));assert.equal(f.calls.length,0);}
 const req=request();req.method='GET';const f=await run({},req);assert.equal(f.res.statusCode,400);
});
test('no return URL, destination host, arbitrary kind, invalid ID or URL grant is accepted',async()=>{
 for(const body of [{returnUrl:'https://attacker.example'},{kind:'admin'},{agencyId:'2x'},{clientId:['55']},{sessionToken:undefined}]){const f=await run({},request(body));assert.ok([400,401].includes(f.res.statusCode));assert.equal(f.calls.some(c=>c[0]==='sign'),false);}
 for(const target of ['https://attacker.example/admin/clients/55','https://app.itsco.health/admin/clients/55?token=bad','http://app.itsco.health/admin/clients/55','https://app.itsco.health/login']){const f=await run({buildUrl:()=>target});assert.equal(f.res.statusCode,403);assert.equal(f.res.cookies.length,0);}
 const wrongHost=await run({},request({}, {host:'auricwell.com'}));assert.equal(wrongHost.res.statusCode,403);
});
test('native local origin is accepted only for an authorized iOS device',async()=>{
 const web=await run({},request({}, {origin:'capacitor://localhost'}));assert.equal(web.res.statusCode,403);
 const native=await run({context:{device:{client_id:'ios',primary_authentication_json:{sessionKey:'primary',issuedAt:Math.floor(NOW/1000)-500}}}},request({}, {origin:'capacitor://localhost'}));assert.equal(native.res.redirectStatus,303);
});
test('unexpected failures return a generic private error without raw database or credential text',async()=>{
 const f=await run({accessError:new Error(`private ${TOKEN}`)});assert.equal(f.res.statusCode,500);assert.equal(JSON.stringify(f.res.body).includes(TOKEN),false);assert.equal(f.res.headers.Pragma,'no-cache');
});
