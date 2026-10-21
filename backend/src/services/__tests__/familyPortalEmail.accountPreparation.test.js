import {it,expect,vi} from 'vitest';
const batch=vi.hoisted(()=>({execute:vi.fn(),client:vi.fn(),profile:vi.fn(),access:vi.fn(),find:vi.fn(),create:vi.fn(),assign:vi.fn(),getLink:vi.fn(),link:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:batch.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findByEmail:batch.find,create:batch.create,assignToAgency:batch.assign}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{getLink:batch.getLink,upsertLink:batch.link}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:batch.client}}));
vi.mock('../../models/ClientGuardianIntakeProfile.model.js',()=>({default:{findByClientId:batch.profile}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:batch.access}));
import {prepareGuardianAccount,prepareGuardianAccountsForClients} from '../guardianAccountPreparation.service.js';
const profile={email:'Parent@Example.test',firstName:'Pat',lastName:'Example'};
const client={id:12,agency_id:2};
function deps(user=null,link=null){return {User:{findByEmail:vi.fn().mockResolvedValue(user),create:vi.fn().mockResolvedValue({id:5,role:'client_guardian'}),assignToAgency:vi.fn()},ClientGuardian:{getLink:vi.fn().mockResolvedValue(link),upsertLink:vi.fn()}};}
it('prepares a passwordless account and pending link without mail or access grant',async()=>{const d=deps();const result=await prepareGuardianAccount({client,profile},d);expect(result).toMatchObject({created:true,requiresAccessReview:true,invitationSent:false});expect(d.User.create).toHaveBeenCalledWith(expect.objectContaining({passwordHash:null,status:'PENDING_SETUP'}));expect(d.ClientGuardian.upsertLink).toHaveBeenCalledWith(expect.objectContaining({accessEnabled:false}));});
it.each(['client','client_guardian'])('reuses an existing %s identity without changing password or role',async role=>{const d=deps({id:5,role},{access_enabled:1});const result=await prepareGuardianAccount({client,profile},d);expect(result.accessEnabled).toBe(true);expect(d.User.create).not.toHaveBeenCalled();expect(d.ClientGuardian.upsertLink).not.toHaveBeenCalled();});
it('retains a disabled or restricted link',async()=>{const d=deps({id:5,role:'client_guardian'},{access_enabled:0,permissions_json:{noView:true}});expect((await prepareGuardianAccount({client,profile},d)).requiresAccessReview).toBe(true);expect(d.ClientGuardian.upsertLink).not.toHaveBeenCalled();});
it('does not repurpose a staff identity',async()=>{const d=deps({id:5,role:'provider'});expect((await prepareGuardianAccount({client,profile},d)).prepared).toBe(false);expect(d.User.assignToAgency).not.toHaveBeenCalled();});
it('requires a usable email',async()=>{const d=deps();expect((await prepareGuardianAccount({client,profile:{email:'bad'}},d)).prepared).toBe(false);expect(d.User.create).not.toHaveBeenCalled();});

it('validates every client in a batch before preparing any account',async()=>{
 vi.resetAllMocks();batch.access.mockResolvedValue({ok:true});batch.client.mockImplementation(async id=>({id,agency_id:id===12?2:3}));
 await expect(prepareGuardianAccountsForClients({actor:{id:1,role:'admin'},agencyId:2,clientIds:[12,13],dryRun:false})).rejects.toMatchObject({status:403});
 expect(batch.profile).not.toHaveBeenCalled();expect(batch.create).not.toHaveBeenCalled();
});
it('prepares both saved guardians and deduplicates their email within the selected client',async()=>{
 vi.resetAllMocks();batch.access.mockResolvedValue({ok:true});batch.client.mockResolvedValue(client);batch.profile.mockResolvedValue(profile);batch.execute.mockResolvedValue([[{email:'other@example.test',firstName:'Other'},profile]]);batch.create.mockResolvedValue({id:5,role:'client_guardian'});
 const result=await prepareGuardianAccountsForClients({actor:{id:1,role:'admin'},agencyId:2,clientIds:[12],dryRun:false});
 expect(result.results).toHaveLength(2);expect(batch.create).toHaveBeenCalledTimes(2);expect(result.invitationSent).toBe(false);
});
