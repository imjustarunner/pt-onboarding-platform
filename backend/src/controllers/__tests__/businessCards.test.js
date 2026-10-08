import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),contact:vi.fn(),voice:vi.fn(),sms:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/staffHtmlEmailSignature.service.js',()=>({resolveStaffSignatureContext:m.contact}));
vi.mock('../../services/staffPhoneAvailability.service.js',()=>({isVoiceCallingConfigured:m.voice,isStaffTextingAvailable:m.sms}));
import {getBusinessCardTemplate,putBusinessCardTemplate,getEmployeeBusinessCard} from '../businessCards.controller.js';
import {normalizeBusinessCardSettings} from '../../services/businessCardSettings.service.js';
const template=()=>({version:1,organization:{organization:'ITSCO',primary:'#a1dce1',accent:'#b9d84e',primaryText:'#ffffff',accentText:'#ffffff',logo:'',website:'ITSCO.health',phone:'719-657-7444',extension:'',address:'Windchime',qrUrl:'https://itsco.health/',backCaption:'Explore our website'},print:{offsetX:0,offsetY:0,topRowOffsetY:.0625,backOffsetX:0,backOffsetY:0,bleed:.0625,bottomBleed:.09375}});
const req=(extra={})=>({params:{id:'2',userId:'7'},user:{id:7,role:'staff'},query:{},body:template(),...extra});
const res=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
let role,member,people,assignments;
beforeEach(()=>{vi.clearAllMocks();role='staff';member=true;assignments=[];m.voice.mockReturnValue(false);m.sms.mockReturnValue(true);people=[{id:7,first_name:'Sam',last_name:'Jones',role:'staff',status:'ACTIVE_EMPLOYEE',is_active:1}];m.contact.mockResolvedValue({email:'sam@tenant.example',phone:{display:'555-0100'},website:{display:'tenant.example'},logoUrl:''});m.execute.mockImplementation(async(sql,args)=>{
if(sql.startsWith('SELECT id, role'))return[[{id:7,role,status:'ACTIVE_EMPLOYEE',is_active:1}]];
if(sql.startsWith('SELECT user_id FROM user_agencies'))return[member?[{user_id:7}]:[]];
if(sql.includes('FROM agencies WHERE'))return[[{id:2,name:'ITSCO',feature_flags:{unrelated_flag:true,business_card_template:template()}}]];
if(sql.includes('FROM users u JOIN user_agencies'))return[people];
if(sql.includes('FROM user_office_locations'))return[[{id:1,name:'Windchime',isActive:1,isPrimary:1}]];
if(sql.includes('FROM twilio_number_assignments'))return[assignments];
if(sql.startsWith('UPDATE agencies'))return[{affectedRows:1}];
if(sql.includes('FROM email_sender_identities'))return[[{id:10,identity_key:'people_operations',display_name:'People Operations',from_email:'po@tenant.example'}, {id:11,identity_key:'technology',display_name:'Technology Support',from_email:'outbound@tenant.example',reply_to:'tech@tenant.example'}, {id:12,identity_key:'personal_7',display_name:'Personal',from_email:'personal@tenant.example'}]];
if(sql.includes('FROM agency_departments'))return[[{id:10,name:'Development'}]];
throw Error('Unexpected SQL '+sql);
});});
describe('business card tenant and employee boundaries',()=>{
 it('returns active tenant group contacts and departments for the admin picker',async()=>{
  role='admin';const r=res(),next=vi.fn();await getBusinessCardTemplate(req(),r,next);
  expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0].groups).toEqual([
   {id:'group:10',kind:'group',name:'People Operations',email:'po@tenant.example'},
   {id:'group:11',kind:'group',name:'Technology Support',email:'tech@tenant.example'},
   {id:'department:10',kind:'department',name:'Development',email:''}
  ]);
  for(const table of ['email_sender_identities','agency_departments']){
   const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.includes(`FROM ${table}`));
   expect(sql).toContain('agency_id = ? AND is_active = TRUE');expect(args).toEqual([2]);
  }
 });
 it.each([{role:'staff',query:{}},{role:'admin',query:{self:'true'}},{role:'admin',query:{userId:'7'}}])('omits group contacts from individual card requests: %j',async scenario=>{
  role=scenario.role;const r=res(),next=vi.fn();await getBusinessCardTemplate(req({query:scenario.query}),r,next);
  expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0].groups).toEqual([]);
  expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM email_sender_identities')||sql.includes('FROM agency_departments'))).toBe(false);
 });
 it('loads only the profile being printed by an administrator',async()=>{role='admin';const r=res();await getBusinessCardTemplate(req({query:{userId:'538'}}),r,vi.fn());expect(m.execute.mock.calls.find(([s])=>s.includes('SELECT DISTINCT u.id'))[1]).toEqual([2,538]);});
 it('cannot use target-user selection to bypass self-service access',async()=>{const r=res();await getBusinessCardTemplate(req({query:{userId:'538'}}),r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);});
 it('limits staff directory to the actor and returns only the card template flag',async()=>{const r=res(),next=vi.fn();await getBusinessCardTemplate(req(),r,next);expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0]).toMatchObject({canManage:false,template:template(),people:[{id:7}]});expect(r.json.mock.calls[0][0].agency).not.toHaveProperty('feature_flags');const call=m.execute.mock.calls.find(([sql])=>sql.includes('SELECT DISTINCT u.id'));expect(call[0]).toContain('AND u.id = ?');expect(call[1]).toEqual([2,7]);});
 it.each([getBusinessCardTemplate,putBusinessCardTemplate,getEmployeeBusinessCard])('rejects a different tenant before returning or modifying data',async handler=>{member=false;const r=res();await handler(req(),r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.contact).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([s])=>s.startsWith('UPDATE'))).toBe(false);});
 it('rejects another employee even if the requester forges an admin role',async()=>{const r=res();await getEmployeeBusinessCard(req({params:{id:'2',userId:'8'},user:{id:7,role:'admin'}}),r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.contact).not.toHaveBeenCalled();});
 it('prevents staff from saving shared templates',async()=>{const r=res();await putBusinessCardTemplate(req(),r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.execute.mock.calls.some(([s])=>s.startsWith('UPDATE'))).toBe(false);});
 it('lets members print their own scoped work contact and offices',async()=>{const r=res();await getEmployeeBusinessCard(req(),r,vi.fn());expect(r.json.mock.calls[0][0]).toMatchObject({user:{id:7},offices:[{agencyIds:[2]}],contact:{email:'sam@tenant.example'}});const office=m.execute.mock.calls.find(([s])=>s.includes('FROM user_office_locations'));expect(office[0]).toContain('ola.agency_id = ?');expect(office[1]).toEqual([7,2]);expect(m.contact).toHaveBeenCalledWith({userId:7,agencyId:2});});
 it('rejects employees outside an administrator’s selected tenant',async()=>{role='admin';people=[];const r=res();await getEmployeeBusinessCard(req({params:{id:'2',userId:'88'}}),r,vi.fn());expect(r.status).toHaveBeenCalledWith(404);expect(m.contact).not.toHaveBeenCalled();});
 it('saves only the card key without replacing unrelated organization flags',async()=>{role='admin';const r=res(),next=vi.fn();await putBusinessCardTemplate(req(),r,next);expect(next).not.toHaveBeenCalled();const [sql,args]=m.execute.mock.calls.find(([s])=>s.startsWith('UPDATE'));expect(sql).toContain('JSON_SET(COALESCE(feature_flags, JSON_OBJECT())');expect(sql).toContain("'$.business_card_template'");expect(JSON.parse(args[0])).toEqual(template());expect(args[1]).toBe(2);});
 it('honors self-only mode for administrators',async()=>{role='admin';const r=res();await getBusinessCardTemplate(req({query:{self:'true'}}),r,vi.fn());expect(r.json.mock.calls[0][0].canManage).toBe(false);expect(m.execute.mock.calls.find(([s])=>s.includes('SELECT DISTINCT u.id'))[1]).toEqual([2,7]);});
 it('rejects executable logo/QR destinations and out-of-range print settings',()=>{for(const patch of [{qrUrl:'javascript:alert(1)'},{logo:'data:image/svg+xml,<svg onload="bad"/>'}])expect(()=>normalizeBusinessCardSettings({...template(),organization:{...template().organization,...patch}})).toThrow();expect(()=>normalizeBusinessCardSettings({...template(),print:{offsetY:2}})).toThrow();});
});

describe('care numbers remain private on provider cards',()=>{
 it.each([false,true])('keeps the main contact but omits texting numbers when transport availability is %s',async available=>{
  m.voice.mockReturnValue(available);m.sms.mockReturnValue(available);
  assignments=[{phone_number:'+17195550123',capabilities:{sms:true,voice:true},sms_access_enabled:1}];
  const r=res(),next=vi.fn();await getEmployeeBusinessCard(req(),r,next);
  expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0].contact).toMatchObject({phone:{display:'555-0100'},workLine:null});
 });
});

describe('card artwork settings',()=>{
 it('preserves separate watermark artwork and safe logo framing',()=>{
  const draft=template();Object.assign(draft.organization,{watermarkLogo:'/assets/nlu/icon.png',logoCrop:'25 5 700 300 2172 724'});
  expect(normalizeBusinessCardSettings(draft).organization).toMatchObject({watermarkLogo:'/assets/nlu/icon.png',logoCrop:'25 5 700 300 2172 724'});
  for(const patch of [{watermarkLogo:'javascript:bad'},{logoCrop:'0 0 500 500 100 100'},{logoCrop:'0 0 100 100 100 100" onload="bad'}])expect(()=>normalizeBusinessCardSettings({...draft,organization:{...draft.organization,...patch}})).toThrow();
 });
});
