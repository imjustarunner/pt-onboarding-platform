import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),create:vi.fn(),assign:vi.fn(),getLink:vi.fn(),link:vi.fn(),deliver:vi.fn(),origin:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findByEmail:m.find,create:m.create,assignToAgency:m.assign}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:2,name:'Example',slug:'example'})}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{getLink:m.getLink,upsertLink:m.link}}));
vi.mock('../coGuardianDelivery.service.js',()=>({deliverCoGuardianInvite:m.deliver}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:m.send}));
vi.mock('../coGuardianRequestOrigin.service.js',()=>({requestingGuardianContext:m.origin}));
vi.mock('../intakeSummaryPdfEmail.service.js',()=>({emailSummaryPdfCopy:vi.fn()}));
import {createCoGuardianInvite,acceptCoGuardianInvite,maybeCreateFromIntakeGuardian,emailCoGuardianInvite} from '../coGuardianInvite.service.js';
const user={id:11,role:'client_guardian',email:'other@example.test'};
const invite={id:7,agency_id:2,public_key:'packet',source:'office',status:'pending',expires_at:new Date(Date.now()+86400000),invited_email:user.email,invited_first_name:'Other',invited_last_name:'Parent'};
beforeEach(()=>{vi.resetAllMocks();delete process.env.GUARDIAN_PORTAL_INVITATIONS_ENABLED;m.deliver.mockResolvedValue({sent:true,queued:false,deliveryStatus:'sent',communicationId:90});m.create.mockResolvedValue(user);m.execute.mockImplementation(async sql=>{
 if(sql.includes('FROM co_guardian_invites WHERE token_hash'))return [[invite]];
 if(sql.startsWith('SELECT id FROM clients'))return [[{id:22}]];
 if(sql.includes('FROM co_guardian_invite_clients'))return [[{id:22,agency_id:2,full_name:'Synthetic Child'}]];
 return [{insertId:7,affectedRows:1}];
});});
it('sends requested enrollment without the portal provisioning flag, while keeping account access restricted',async()=>{
 const result=await createCoGuardianInvite({agencyId:2,clientIds:[22],publicKey:'packet',otherGuardian:{email:user.email,firstName:'Other',lastName:'Parent',sendInvite:true}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({status:'PENDING_SETUP',passwordHash:null}));
 expect(m.link).toHaveBeenCalledWith(expect.objectContaining({guardianUserId:11,permissionsJson:expect.objectContaining({noView:true,canViewDocs:false})}));
 expect(result.emailed).toBe(true);expect(m.deliver).toHaveBeenCalledWith(expect.objectContaining({to:user.email,inviteId:7}));
});
it.each(['office','school'])('sends the requested %s second-parent enrollment and reports actual transport state',async source=>{
 const result=await maybeCreateFromIntakeGuardian({agencyId:2,clientIds:[22],publicKey:'packet',source,intakeData:{guardian:{other_guardian_has_legal_rights:'shared',other_guardian_email:user.email}}});
 expect(m.deliver).toHaveBeenCalledWith(expect.objectContaining({school:source==='school',to:user.email}));
 expect(result).toMatchObject({emailed:true,queued:false,deliveryStatus:'sent'});
});
it.each(['no',false])('preserves explicit do-not-send choice %j',async selection=>{
 await maybeCreateFromIntakeGuardian({agencyId:2,clientIds:[22],publicKey:'packet',source:'school',intakeData:{guardian:{other_guardian_has_legal_rights:'shared',other_guardian_email:user.email,other_guardian_send_intake_link:selection}}});
 expect(m.deliver).not.toHaveBeenCalled();
});
it('does not invite a contact without shared or stated legal rights',async()=>{
 expect(await maybeCreateFromIntakeGuardian({agencyId:2,clientIds:[22],publicKey:'packet',intakeData:{guardian:{other_guardian_has_legal_rights:'no',other_guardian_email:user.email}}})).toBeNull();
 expect(m.deliver).not.toHaveBeenCalled();
});
it('does not invite a child’s other guardian into the adult’s own care',async()=>{
 const result=await maybeCreateFromIntakeGuardian({agencyId:2,clientIds:[22],publicKey:'packet',intakeData:{intakeForSelf:true,guardian:{other_guardian_has_legal_rights:'shared',other_guardian_email:user.email}}});
 expect(result).toBeNull();expect(m.deliver).not.toHaveBeenCalled();expect(m.link).not.toHaveBeenCalled();
});
it('reuses the existing second-parent login for both siblings without replacing prior children or permissions',async()=>{
 m.find.mockResolvedValue(user);m.getLink.mockResolvedValue({access_enabled:1,relationship_type:'guardian',permissions_json:{canMessage:false}});
 const execute=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,...args)=>sql.includes('FROM co_guardian_invite_clients')
  ? [[{id:22,agency_id:2,full_name:'First Child'},{id:23,agency_id:2,full_name:'Second Child'}]] : execute(sql,...args));
 const result=await acceptCoGuardianInvite({token:'synthetic',enrollmentCompleted:true});
 expect(result.acceptedUserId).toBe(11);expect(m.create).not.toHaveBeenCalled();
 expect(m.link.mock.calls.map(([row])=>row.clientId)).toEqual([22,23]);
 for(const [row] of m.link.mock.calls) expect(row).toMatchObject({guardianUserId:11,permissionsJson:{canMessage:false}});
 expect(m.execute.mock.calls.some(([sql])=>/DELETE FROM client_guardians/i.test(sql))).toBe(false);
});
it('keeps queued mail distinguishable from successful transmission',async()=>{
 m.deliver.mockResolvedValue({sent:false,queued:true,deliveryStatus:'pending'});
 expect(await maybeCreateFromIntakeGuardian({agencyId:2,clientIds:[22],publicKey:'packet',intakeData:{guardian:{other_guardian_has_legal_rights:'yes',other_guardian_email:user.email}}})).toMatchObject({emailed:false,queued:true,deliveryStatus:'pending'});
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
it('addresses the invite to the second parent with inviter name, email, and child initials only',async()=>{
 m.origin.mockResolvedValue({name:'Robin Parent',email:'robin@example.test',clientInitials:'EQ'});
 m.send.mockResolvedValue({sent:true});
 await emailCoGuardianInvite({inviteId:7,agency:{id:2,name:'Example'},to:user.email,firstName:'Jamie',inviteUrl:'https://agency.test/intake/packet?coGuardian=token',clientId:22});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to:user.email,text:expect.stringContaining('Robin Parent (robin@example.test)')}));
 expect(m.send.mock.calls[0][0].text).toContain('child with initials EQ');
 expect(m.send.mock.calls[0][0].text).toContain('will not see the other guardian');
});
