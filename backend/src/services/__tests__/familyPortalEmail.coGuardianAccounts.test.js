import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),create:vi.fn(),assign:vi.fn(),getLink:vi.fn(),link:vi.fn(),deliver:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findByEmail:m.find,create:m.create,assignToAgency:m.assign}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:2,name:'Example',slug:'example'})}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{getLink:m.getLink,upsertLink:m.link}}));
vi.mock('../coGuardianDelivery.service.js',()=>({deliverCoGuardianInvite:m.deliver}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:vi.fn()}));
vi.mock('../intakeSummaryPdfEmail.service.js',()=>({emailSummaryPdfCopy:vi.fn()}));
import {createCoGuardianInvite,acceptCoGuardianInvite} from '../coGuardianInvite.service.js';
const user={id:11,role:'client_guardian',email:'other@example.test'};
const invite={id:7,agency_id:2,public_key:'packet',source:'office',status:'pending',expires_at:new Date(Date.now()+86400000),invited_email:user.email,invited_first_name:'Other',invited_last_name:'Parent'};
beforeEach(()=>{vi.resetAllMocks();delete process.env.GUARDIAN_PORTAL_INVITATIONS_ENABLED;m.create.mockResolvedValue(user);m.execute.mockImplementation(async sql=>{
 if(sql.includes('FROM co_guardian_invites WHERE token_hash'))return [[invite]];
 if(sql.startsWith('SELECT id FROM clients'))return [[{id:22}]];
 if(sql.includes('FROM co_guardian_invite_clients'))return [[{id:22,agency_id:2,full_name:'Synthetic Child'}]];
 return [{insertId:7,affectedRows:1}];
});});
it('prepares the second guardian identity with no password or outgoing invitation',async()=>{
 const result=await createCoGuardianInvite({agencyId:2,clientIds:[22],publicKey:'packet',otherGuardian:{email:user.email,firstName:'Other',lastName:'Parent',sendInvite:true}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({status:'PENDING_SETUP',passwordHash:null}));
 expect(m.link).toHaveBeenCalledWith(expect.objectContaining({guardianUserId:11,permissionsJson:expect.objectContaining({noView:true,canViewDocs:false})}));
 expect(result.emailed).toBe(false);expect(m.deliver).not.toHaveBeenCalled();
});
it('keeps a manually disabled existing guardian link disabled',async()=>{
 m.find.mockResolvedValue({...user,role:'client'});m.getLink.mockResolvedValue({access_enabled:0,permissions_json:{noView:true}});
 await createCoGuardianInvite({agencyId:2,clientIds:[22],publicKey:'packet',otherGuardian:{email:user.email}});
 expect(m.create).not.toHaveBeenCalled();expect(m.link).toHaveBeenCalledWith(expect.objectContaining({accessEnabled:false,permissionsJson:expect.objectContaining({noView:true})}));
});
it('completed enrollment prepares the account even without a portal-invite selection',async()=>{
 const result=await acceptCoGuardianInvite({token:'synthetic',enrollmentCompleted:true,createPortal:false});
 expect(result).toMatchObject({accepted:true,acceptedUserId:11,portalAccess:null});expect(m.create).toHaveBeenCalledWith(expect.objectContaining({status:'PENDING_SETUP'}));expect(m.deliver).not.toHaveBeenCalled();
});
it('reuses a parent’s own client account on co-guardian completion',async()=>{
 m.find.mockResolvedValue({...user,role:'client'});m.getLink.mockResolvedValue({access_enabled:1,permissions_json:{canMessage:false}});
 const result=await acceptCoGuardianInvite({token:'synthetic',enrollmentCompleted:true});
 expect(result.acceptedUserId).toBe(11);expect(m.create).not.toHaveBeenCalled();expect(m.link).toHaveBeenCalledWith(expect.objectContaining({permissionsJson:expect.objectContaining({canMessage:false})}));
});
