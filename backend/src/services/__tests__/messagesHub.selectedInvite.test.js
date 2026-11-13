import fs from 'node:fs';
import {beforeEach,expect,it,vi} from 'vitest';

// Exercise the actual transport entrypoint without importing unrelated Hub
// integrations. Every model/transport is an in-memory synthetic boundary.
const source=fs.readFileSync(new URL('../messagesHub.service.js',import.meta.url),'utf8');
const start=source.indexOf('export async function sendHubPortalInvitation(');
const end=source.indexOf('\n/**',start);
const handlerSource=source.slice(start,end).replace('export async function','async function')
 .replaceAll(/await import\('([^']+)'\)/g,(_match,path)=>`await load(${JSON.stringify(path)})`);
let m,send;
beforeEach(()=>{
 const child=id=>({id,agency_id:4,guardian_portal_enabled:1,initials:`C${id}`});
 m={user:vi.fn(async()=>({id:10,email:'testing+selected@example.com',role:'client_guardian',is_active:1,status:'ACTIVE'})),
  clients:vi.fn(async id=>child(id)),links:vi.fn(async()=>[{guardian_user_id:10,access_enabled:1,permissions_json:{}}]),
  access:vi.fn(async()=>({ok:true})),prepare:vi.fn(async()=>({existingAccount:true})),email:vi.fn(async()=>({id:42})),
  build:vi.fn(args=>({subject:'Synthetic',text:args.clients.map(c=>c.initials).join(',')})),upsert:vi.fn(),create:vi.fn()};
 const models={
  '../models/Client.model.js':{default:{findById:m.clients,update:vi.fn()}},
  '../models/ClientGuardian.model.js':{default:{listForClient:m.links,upsertLink:m.upsert,parsePermissions:p=>p||{}}},
  '../models/User.model.js':{default:{findById:m.user,findByEmail:m.user,create:m.create,assignToAgency:vi.fn(async()=>{})}},
  './clientRecordAccess.service.js':{resolveClientRecordAccess:m.access},
  './clientPortalContext.service.js':{resolveClientPortalContext:async()=>({tenant:{id:4,name:'Synthetic agency'},portal:{id:4},learning:false}),clientPortalInviteUrl:()=> 'https://synthetic.test/guardian'},
  './portalInvitationAccess.service.js':{preparePortalInvitationAccess:m.prepare},
  './clientPortalEmail.service.js':{clientEmailContext:async()=>({}),sendClientPortalEmail:m.email},
  './clientPortalEmailContent.js':{buildClientEnrollmentEmail:m.build}
 };
 const pool={execute:async sql=>sql.includes('SELECT role')?[[{role:'support'}]]:[[child(5),child(6),child(7)]]};
 send=new Function('load','pool','formatPersonKey',`${handlerSource}; return sendHubPortalInvitation;`)(async path=>{
  if(!models[path])throw new Error(`Unexpected boundary ${path}`);return models[path];
 },pool,()=> 'synthetic-person');
});
const args=()=>({agencyId:4,actorUserId:501,clientId:5,guardianUserId:10,existingLinkOnly:true,expectedRecipientEmail:'testing+selected@example.com',selectedClientIds:[5,6]});
it('includes only the explicitly selected authorized siblings in a generic portal invitation',async()=>{
 const result=await send(args());expect(result.delivery).toEqual({id:42});
 expect(m.build).toHaveBeenCalledWith(expect.objectContaining({clients:[expect.objectContaining({id:5}),expect.objectContaining({id:6})]}));
 expect(m.email).toHaveBeenCalledWith(expect.objectContaining({to:args().expectedRecipientEmail,text:'C5,C6'}));
 expect(m.upsert).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it('refuses a changed account email before preparing access or sending',async()=>{
 m.user.mockResolvedValue({id:10,email:'changed@example.com',role:'client_guardian',status:'ACTIVE'});
 await expect(send(args())).rejects.toMatchObject({status:409,code:'PORTAL_INVITATION_PREVIEW_CHANGED'});
 expect(m.prepare).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
});
it.each([{noView:true},{noViewOtherGuardian:true},{noContact:true},{revoked:true},'{',[]])('rechecks every selected child’s current contact restriction %j',async permissions=>{
 m.links.mockImplementation(async id=>[{guardian_user_id:10,access_enabled:1,permissions_json:id===6?permissions:{}}]);
 await expect(send(args())).rejects.toMatchObject({status:409,code:'PORTAL_INVITATION_PREVIEW_CHANGED'});
 expect(m.email).not.toHaveBeenCalled();expect(m.prepare).not.toHaveBeenCalled();
});
it('refuses another tenant or revoked staff access on a selected sibling',async()=>{
 m.clients.mockImplementation(async id=>({id,agency_id:id===6?99:4}));
 await expect(send(args())).rejects.toHaveProperty('status',409);
 m.clients.mockImplementation(async id=>({id,agency_id:4}));m.access.mockImplementation(async({clientId})=>({ok:clientId!==6}));
 await expect(send(args())).rejects.toHaveProperty('status',409);expect(m.email).not.toHaveBeenCalled();
});
it('never replaces a deleted or suspended existing contact with a new account',async()=>{
 for(const account of [null,{id:10,email:args().expectedRecipientEmail,role:'client_guardian',status:'SUSPENDED'}]){
  m.user.mockResolvedValue(account);await expect(send(args())).rejects.toHaveProperty('status',409);
 }
 expect(m.create).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
});
