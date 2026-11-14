import fs from'node:fs';import crypto from'node:crypto';import{beforeEach,expect,it,vi}from'vitest';
import{guardianServiceAllowed}from'../../utils/guardianServiceRestrictions.js';import{terminalProfile}from'../../utils/clientServiceLifecycle.js';import{shouldDefaultToSecureMessage}from'../secureMessagingPolicy.service.js';
// Connect the actual Hub method/context/resolver functions to the actual read-only
// currentAudience implementation. Only models, SQL reads and external integrations
// are synthetic boundaries; no conversation-opening or provisioning function exists.
const source=fs.readFileSync(new URL('../messagesHub.service.js',import.meta.url),'utf8');
const sharedSource=fs.readFileSync(new URL('../familySharedConversations.service.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const code=[section('function method(','async function actorHasAppInbox('),section('async function currentSharedClientMessaging(','export async function buildClientThreadContext('),section('export async function buildClientThreadContext(','async function enrichPeopleWithTalkingTo('),section('export async function resolveHubPerson(','async function loadClientMessagingContext('),section('async function loadClientMessagingContext(','export async function loadChatTimeline(')].join('\n').replaceAll('export async function','async function').replaceAll(/await import\('([^']+)'\)/g,(_,path)=>`await load(${JSON.stringify(path)})`);
const audienceDefinitions=sharedSource.slice(sharedSource.indexOf('const FAMILY ='),sharedSource.indexOf('export function assertReviewedFamilyRecipients'));
const audienceSource=sharedSource.slice(sharedSource.indexOf('  async function currentAudience('),sharedSource.indexOf('  async function find('));
const policy=sharedSource.match(/FAMILY_CONVERSATION_POLICY_VERSION = '([^']+)'/)[1];
let m,hub;
const active=id=>({id,is_active:1,is_archived:0,status:'ACTIVE',role:id===1433?'provider':'client_guardian'});
const guardian=(id=1790,changes={})=>({...active(id),client_id:2560,guardian_user_id:id,first_name:'QA',last_name:`Guardian${id}`,email:`testing+guardian${id}@example.com`,relationship_type:'guardian',access_enabled:1,permissions_json:{},...changes});
beforeEach(()=>{
 m={client:{id:2560,agency_id:450,provider_id:1433,client_type:'clinical',guardian_portal_enabled:1,status:'ACTIVE',client_status_key:'active',full_name:'Pip QA',initials:'PipQA',email:null,user_id:null},links:[guardian()],providers:[active(1433)],clinical:vi.fn(async()=>({scopes:['clinical_messages']})),services:vi.fn(async()=>[]),membership:vi.fn(async(cid,aid)=>Number(cid)===2560&&Number(aid)===450),read:vi.fn(),open:vi.fn(()=>{throw Error('Must not open/create a conversation in a directory read.');})};
 const sharedDb={execute:vi.fn(async(sql,args)=>{if(!/^\s*SELECT\b/i.test(sql))throw Error('Read-only fixture rejected a mutation.');if(sql.includes('JOIN agencies a'))return[[Number(args[0])===450?m.client:null]];if(sql.includes('SELECT DISTINCT u.id,u.role'))return[m.providers];if(sql.includes('FROM client_guardians cg JOIN users'))return[m.links.filter(link=>Number(link.access_enabled)===1).map(link=>({...link,id:link.guardian_user_id}))];throw Error('Unexpected family audience read.');})};m.sharedDb=sharedDb;
 const d={db:sharedDb,membership:m.membership,services:m.services,clinical:m.clinical};
 const actualAudience=new Function('d','crypto','terminalProfile','guardianServiceAllowed','utcMysqlToIso','FAMILY_CONVERSATION_POLICY_VERSION',`${audienceDefinitions};return ${audienceSource};`)(d,crypto,terminalProfile,guardianServiceAllowed,value=>value,policy);m.currentAudience=vi.fn(actualAudience);
 const pool={execute:vi.fn(async(sql,args)=>{if(!/^\s*SELECT\b/i.test(sql))throw Error('Read-only fixture rejected a mutation.');if(sql.includes('SELECT role FROM users'))return[[{role:'provider'}]];if(sql.includes('FROM clients c'))return[[Number(args[0])===2560&&Number(args[1])===450?m.client:null].filter(Boolean)];throw Error('Unexpected Hub resolver read.');})};m.pool=pool;
 const boundaries={'../models/ClientGuardian.model.js':{default:{listForClient:async()=>m.links,normalizeRelationshipType:value=>value==='self'?'self':'guardian'}},'../utils/uploads.js':{publicUploadsUrlFromStoredPath:()=>null},'./familySharedConversations.service.js':{familySharedConversations:{currentAudience:m.currentAudience,open:m.open}},'./hubRecipientDelivery.service.js':{resolveSenderDeliveryGate:async()=>null}};
 const env={pool,HUB_SMS_PLATFORM_READY:false,shouldDefaultToSecureMessage,actorHasAppInbox:async()=>false,parsePersonKey:key=>{const found=/^(client|user):(\d+)@(\d+)$/.exec(key);return found?{type:found[1],id:Number(found[2]),agencyId:Number(found[3])}:null;},formatPersonKey:(type,id,agency)=>`${type}:${id}@${agency}`,loadAgencyNameMap:async()=>new Map(),agencyDisplayName:()=> 'QA agency',agencyIconUrl:()=>null,clientDisplayName:client=>client.full_name,clientMeta:()=> 'QA client',clientGuardianAccessLabel:()=> 'Linked contacts',CLIENT_SELECT_ONE:'c.*',CLIENT_FROM_JOIN:'FROM clients c',scopeHubPeople:async rows=>rows,ownEmailCorrespondent:async()=>null,enrichHubSchoolStaff:async rows=>rows};
 hub=new Function('load','env',`const {${Object.keys(env).join(',')}}=env;${code};return{buildClientThreadContext,resolveHubPerson,loadClientMessagingContext};`)(async path=>{if(!boundaries[path])throw Error('Unexpected module boundary.');return boundaries[path];},env);
});
const context=actorUserId=>hub.buildClientThreadContext({clientId:2560,agencyId:450,actorUserId,clientSeed:{displayName:'Pip QA',userId:null,email:null,clientType:'clinical',clientStatusKey:'active'}});
const card=actor=>hub.resolveHubPerson({agencyId:450,userId:actor,personKey:'client:2560@450'});
const secure=person=>person.methods.find(method=>method.id==='secure');
it('enables the no-own-email client participant only through its actual eligible shared audience',async()=>{const result=await context(1433);expect(result.sharedSecureAvailable).toBe(true);expect(secure(result.clientParticipant).available).toBe(true);expect(result.clientParticipant).toMatchObject({email:null,userId:null,portalAccess:false,canInviteToPortal:false,sharedSecureAvailable:true});expect(result.clientHasPortal).toBe(false);expect(result.defaultTalkingToPersonKey).toBe('user:1790@450');expect(m.currentAudience).toHaveBeenCalledWith({clientId:2560,agencyId:450});expect(m.open).not.toHaveBeenCalled();});
it('connects resolveHubPerson through the current actor while preserving unavailable regular Email and absent own account',async()=>{const result=await card(1433);expect(secure(result)).toMatchObject({available:true,recommended:true});expect(secure(result).reason).toContain('all eligible family');expect(secure(result).reason).not.toMatch(/set a password|portal invite/i);expect(result.methods.find(method=>method.id==='email').available).toBe(false);expect(result).toMatchObject({email:null,userId:null,portalAccess:false,portalReady:false,canInviteToPortal:false,preferredMethod:'secure',clientMessaging:{sharedSecureAvailable:true,clientHasPortal:false,talkingToUserId:1790,clientParticipant:{email:null,portalAccess:false,canInviteToPortal:false}}});expect(m.client.email).toBeNull();expect(m.open).not.toHaveBeenCalled();expect([...m.sharedDb.execute.mock.calls,...m.pool.execute.mock.calls].every(([sql])=>/^\s*SELECT\b/i.test(sql))).toBe(true);});
it.each([{canMessage:false},{noView:true},{noViewOtherGuardian:true},{coGuardianInviteRestricted:true}])('does not derive secure availability from a restricted guardian link %j',async permissions=>{m.links=[guardian(1790,{permissions_json:permissions})];const result=await card(1433);expect(secure(result).available).toBe(false);expect(result.clientMessaging.sharedSecureAvailable).toBe(false);expect(result.clientMessaging.talkingToUserId).toBeNull();expect(result.clientMessaging.defaultTalkingToPersonKey).toBeNull();});
it('does not use a revoked or inactive link even if an email remains on the contact',async()=>{for(const patch of[{access_enabled:0},{is_active:0},{status:'PENDING_SETUP'}]){m.links=[guardian(1790,patch)];const result=await card(1433);expect(secure(result).available).toBe(false);expect(result.clientMessaging.talkingToUserId).toBeNull();}});
it('requires the actor to be part of the current audience and does not infer it from staff agency membership',async()=>{const result=await card(1434);expect(secure(result).available).toBe(false);expect(result.clientMessaging.sharedSecureAvailable).toBe(false);expect(result.clientMessaging.talkingToUserId).toBeNull();});
it('fails closed without an actor before making a currentAudience request',async()=>{const result=await context(null);expect(result.sharedSecureAvailable).toBe(false);expect(secure(result.clientParticipant).available).toBe(false);expect(result.defaultTalkingToPersonKey).toBeNull();expect(m.currentAudience).not.toHaveBeenCalled();});
it('does not select disabled or wrong-practice contacts before the eligible guardian',async()=>{m.links=[guardian(1798,{permissions_json:{learningOnly:true,serviceKinds:['tutoring'],serviceAgencyIds:[999]}}),guardian(1799,{access_enabled:0}),guardian(1790)];const result=await card(1433);expect(secure(result).available).toBe(true);expect(result.clientMessaging.talkingToUserId).toBe(1790);expect(result.clientMessaging.guardians.filter(g=>g.sharedSecureEligible).map(g=>g.userId)).toEqual([1790]);});
it('does not enable shared availability when current client/practice membership is absent or the returned context differs',async()=>{m.membership.mockResolvedValue(false);expect((await context(1433)).sharedSecureAvailable).toBe(false);m.membership.mockResolvedValue(true);m.currentAudience.mockResolvedValue({clientId:2560,agencyId:999,audienceIds:[1433,1790],participants:[active(1433),active(1790)]});expect((await context(1433)).sharedSecureAvailable).toBe(false);expect(await hub.resolveHubPerson({agencyId:999,userId:1433,personKey:'client:2560@999'})).toBeNull();});
it('keeps secure unavailable after clinical messaging is revoked or the current audience cannot be resolved',async()=>{m.clinical.mockResolvedValue({scopes:[]});expect(secure(await card(1433)).available).toBe(false);m.currentAudience.mockRejectedValue(Error('Audience unavailable'));expect(secure(await card(1433)).available).toBe(false);expect(m.open).not.toHaveBeenCalled();});

it('reports unexpected availability failures without leaking an internal error or claiming that email is missing', async () => {
  m.currentAudience.mockRejectedValue(Error('SQL internal diagnostic must not appear'));
  const result = await card(1433);
  expect(secure(result)).toMatchObject({
    available: false,
    reason: 'Secure messaging availability could not be checked. Refresh and try again.'
  });
  expect(secure(result.clientMessaging.clientParticipant).reason).toBe(secure(result).reason);
  expect(secure(result).reason).not.toMatch(/SQL|Add an email/i);
  expect(result.clientMessaging.talkingToUserId).toBeNull();
  expect(m.open).not.toHaveBeenCalled();
});
it('preserves a real service-selection boundary as the reason instead of recommending a child email', async () => {
  m.services.mockResolvedValue([
    { id: 101, is_active: 1, service_kind: 'counseling', provider_user_id: 1433 },
    { id: 102, is_active: 1, service_kind: 'tutoring', provider_user_id: 1438 }
  ]);
  const result = await card(1433);
  expect(secure(result)).toMatchObject({
    available: false,
    reason: 'Choose the client’s service before opening shared secure messages.'
  });
  expect(secure(result.clientMessaging.clientParticipant).reason).toBe(secure(result).reason);
  expect(secure(result).reason).not.toMatch(/Add an email/i);
  expect(result.clientMessaging.talkingToUserId).toBeNull();
  expect(m.open).not.toHaveBeenCalled();
});
