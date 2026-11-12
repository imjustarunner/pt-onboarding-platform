import {beforeEach,expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
const m=vi.hoisted(()=>({authority:vi.fn(),accept:vi.fn(),agency:vi.fn(),insurance:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute},onTableWrite:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../learningGuardianInvitations.service.js',()=>({requireLearningGuardianInvitationAuthority:m.authority,acceptLearningGuardianInvitation:m.accept}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:m.insurance}));
import {maybeCreateFromIntakeGuardian,resolveCoGuardianIntakeBinding,acceptCoGuardianInvite,presentCoGuardianInvite} from '../coGuardianInvite.service.js';
beforeEach(()=>{vi.clearAllMocks();});
it('records no invitation, ticket or transport from tutoring intake custody fields',async()=>{
 expect(await maybeCreateFromIntakeGuardian({agencyId:453,enrollmentChannel:'tutoring',clientIds:[1],intakeData:{guardian:{other_guardian_has_legal_rights:'yes',other_guardian_email:'other@example.com'}}})).toBeNull();
 expect(execute).not.toHaveBeenCalled();
});
const invitation=()=>({id:80,agency_id:453,invited_by_user_id:1759,invited_email:'qa.nlu.coparent@example.com',source:'learning_portal',status:'pending',expires_at:new Date(Date.now()+86400000)});
it('never treats a learning portal invitation as another client enrollment capability',async()=>{
 execute.mockResolvedValueOnce([[invitation()]]);
 await expect(resolveCoGuardianIntakeBinding('synthetic-token',{agencyId:453})).rejects.toMatchObject({status:403});
 expect(execute).toHaveBeenCalledOnce();
});
it('routes delivered learning acceptance into its guarded path before legacy identity or permission updates',async()=>{
 const row=invitation();execute.mockResolvedValueOnce([[row]]);m.accept.mockResolvedValueOnce({accepted:true,source:'learning_portal'});
 await expect(acceptCoGuardianInvite({token:'synthetic-token',contact:{email:row.invited_email}})).resolves.toMatchObject({accepted:true,source:'learning_portal'});
 expect(m.accept).toHaveBeenCalledWith({row,token:'synthetic-token',contact:{email:row.invited_email}});expect(execute).toHaveBeenCalledOnce();
});
it('presents only limited learning names without opening insurance or exposing child birth dates',async()=>{
 const row=invitation();m.agency.mockResolvedValueOnce({id:453,slug:'nlu-qa-demo',name:'NLU QA'});
 execute.mockResolvedValueOnce([[{id:2545,full_name:'Parker QA NLU',date_of_birth:'2016-04-12',insurance_on_file:1}]]);
 const result=await presentCoGuardianInvite(row);expect(result).toMatchObject({source:'learning_portal',paymentCollectionAvailable:false,publicKey:null,dependents:[{id:2545,firstName:'Parker'}]});
 expect(JSON.stringify(result)).not.toContain('2016-04-12');expect(JSON.stringify(result)).not.toContain('insurance');expect(m.insurance).not.toHaveBeenCalled();expect(m.authority).toHaveBeenCalledWith({userId:1759,clientId:2545,agencyId:453});
});
