import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), find: vi.fn(), create: vi.fn(), token: vi.fn(), assign: vi.fn(), link: vi.fn(), client: vi.fn(), update: vi.fn(), agency: vi.fn(), email: vi.fn(), getLink:vi.fn(), portalInvite:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute:m.execute }, onTableWrite:vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findByEmail:m.find, create:m.create, generatePasswordlessToken:m.token, assignToAgency:m.assign } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById:m.agency } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { upsertLink:m.link,getLink:m.getLink } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById:m.client, update:m.update } }));
vi.mock('../guardianNotificationEmail.service.js', () => ({ sendGuardianNotificationEmail:m.email }));
vi.mock('../messagesHub.service.js',()=>({sendHubPortalInvitation:m.portalInvite}));
import PublicIntakeClientService from '../publicIntakeClient.service.js';
import { upsertClientGuardian } from '../../controllers/clientGuardian.controller.js';
const guardian = { id:8, email:'parent@example.test', first_name:'Pat', last_name:'Example', role:'client_guardian' };
beforeEach(() => { vi.resetAllMocks(); m.execute.mockResolvedValue([[]]); m.create.mockResolvedValue(guardian); m.token.mockResolvedValue({token:'setup-secret'}); m.email.mockResolvedValue({sent:true});
  m.agency.mockImplementation(async id => Number(id) === 20 ? {id:20,organization_type:'school'} : {id:2,slug:'example',name:'Example Agency'});
  m.client.mockResolvedValue({ id:22,agency_id:2,organization_id:20,client_type:'school' });
});
it.each([false,true])('links a %s existing school guardian without generating or rotating login credentials', async existing => {
  m.find.mockResolvedValue(existing ? guardian : null);
  const result = await PublicIntakeClientService.provisionGuardianForIntakeClients({ link:{id:1,scope_type:'school',create_guardian:1},agencyId:2,clients:[{id:22},{id:23}],payload:{guardian:{email:guardian.email,firstName:'Pat',lastName:'Example'}} });
  expect(result.guardianUser.id).toBe(8); expect(m.link).toHaveBeenCalledTimes(2);
  expect(m.token).not.toHaveBeenCalled(); expect(m.email).not.toHaveBeenCalled(); expect(result.newGuardianPasswordlessLoginUrl).toBeFalsy();
});
it('retains password setup for office intake',async()=>{
  const result=await PublicIntakeClientService.provisionGuardianForIntakeClients({link:{id:1,scope_type:'agency',create_guardian:1},agencyId:2,clients:[{id:22,client_type:'clinical'}],payload:{guardian:{email:guardian.email}}});
  expect(m.token).toHaveBeenCalled();expect(result.newGuardianPasswordlessLoginUrl).toContain('setup-secret');
});
it('staff can create and link a school guardian without sending an invitation',async()=>{
  const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
  await upsertClientGuardian({params:{id:'22'},body:{email:guardian.email,firstName:'Pat',lastName:'Example'},user:{id:501}},res,next);
  expect(next).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalled();expect(m.link).toHaveBeenCalled();
  expect(m.token).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();expect(m.portalInvite).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({invitationDeferred:true,setupEmailSent:false,passwordlessTokenLink:null}));
});

it('adds public office enrollment to an existing AuricWell account without rotating its credentials',async()=>{
 m.find.mockResolvedValue({...guardian,password_hash:'existing-hash'});
 const result=await PublicIntakeClientService.provisionGuardianForIntakeClients({link:{id:1,scope_type:'agency',create_guardian:1},agencyId:2,clients:[{id:22,client_type:'clinical'}],payload:{guardian:{email:guardian.email}}});
 expect(m.token).not.toHaveBeenCalled();expect(result.newGuardianPasswordlessLoginUrl).toContain('https://auricwell.com/example/login');
});
it('retains the valid setup link across subsequent enrollments',async()=>{
 m.find.mockResolvedValue({...guardian,passwordless_token:'still-valid',passwordless_token_purpose:'setup',passwordless_token_expires_at:'2030-01-01'});
 const result=await PublicIntakeClientService.provisionGuardianForIntakeClients({link:{id:1,scope_type:'agency',create_guardian:1},agencyId:2,clients:[{id:22,client_type:'clinical'}],payload:{guardian:{email:guardian.email}}});
 expect(m.token).not.toHaveBeenCalled();expect(result.newGuardianPasswordlessLoginUrl).toContain('https://auricwell.com/example/new_account/still-valid');
});
