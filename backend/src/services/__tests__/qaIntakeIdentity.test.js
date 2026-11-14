import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {validateQaIntakeGuardian,markQaIntakeGuardian} from '../qaIntakeIdentity.service.js';
const agency={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}};
const db={execute:vi.fn()};
const childMembership={id:1746,role:'client_guardian',agency_id:451,membership_slug:'auricwell-qa-demo-school',membership_flags:{qaSandbox:{syntheticOnly:true}},membership_active:1,membership_archived:0,root_affiliated:1};
function configure({root=agency,users=[],clients=[]}={}) {
 db.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT id,slug,feature_flags FROM agencies'))return [[root]];
  if(sql.includes('FROM users u LEFT JOIN user_agencies'))return [users];
  if(sql.includes('FROM client_guardians cg JOIN clients'))return [clients];
  if(sql.startsWith('UPDATE users'))return [{affectedRows:1}];
  throw new Error('Unexpected identity-policy query');
 });
}
beforeEach(()=>{db.execute.mockReset();configure();});
describe('isolated QA intake identities',()=>{
 it('leaves live agencies unchanged',async()=>{expect(await validateQaIntakeGuardian({agencyId:2,email:'real@domain.test'},db)).toBe(false);expect(db.execute).not.toHaveBeenCalled();});
 it('rejects the shared delivery inbox before user or client writes',async()=>{await expect(validateQaIntakeGuardian({agencyId:450,email:'testing@itsco.health'},db)).rejects.toMatchObject({status:400});expect(db.execute).toHaveBeenCalledTimes(1);});
 it('rejects any live outside membership',async()=>{configure({users:[{id:5,role:'client_guardian',agency_id:2}]});await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.family@example.com'},db)).rejects.toMatchObject({status:400});expect(db.execute).toHaveBeenCalledTimes(2);});
 it('never adopts an existing staff identity',async()=>{configure({users:[{id:1433,role:'provider',agency_id:450}]});await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.provider.auricwell@example.com'},db)).rejects.toMatchObject({status:400});});
 it('marks a completed isolated guardian only through normal active parent membership',async()=>{configure({users:[{id:9,role:'client_guardian',agency_id:450}]});await markQaIntakeGuardian({agencyId:450,userId:9,email:'qa.family@example.com'},db);expect(db.execute.mock.calls.at(-1)[0]).toContain('ua.agency_id=? AND ua.is_active=1');expect(db.execute.mock.calls.at(-1)[1]).toEqual([450,9,'qa.family@example.com']);});
 it('fails closed when the target synthetic root flag is missing',async()=>{configure({root:{...agency,feature_flags:{}}});await expect(validateQaIntakeGuardian({agencyId:450,email:'qa.family@example.com'},db)).rejects.toMatchObject({status:400});});
 it('accepts a new controlled testing alias',async()=>{expect(await validateQaIntakeGuardian({agencyId:450,email:'testing+1109-parent2@itsco.health'},db)).toBe(true);});
 it.each(['testing+@itsco.health','parent@itsco.health','testing+family@elsewhere.test'])('rejects a nonapproved identity %s',async email=>{await expect(validateQaIntakeGuardian({agencyId:450,email},db)).rejects.toMatchObject({status:400});});
 it('allows a verified synthetic school guardian and checks every linked child without an email-specific exception',async()=>{
  configure({users:[childMembership],clients:[2526,2559,2561,2527].map(id=>({id,agency_id:450,is_demo:1}))});
  expect(await validateQaIntakeGuardian({agencyId:450,email:'testing+retained-family@itsco.health'},db)).toBe(true);
  expect(db.execute.mock.calls[1][0]).toContain('qa_affiliation.organization_id=ua.agency_id');expect(db.execute.mock.calls[1][1]).toEqual([450,'testing+retained-family@itsco.health']);expect(db.execute.mock.calls[2][1]).toEqual([1746]);
 });
 it('also recognizes the retained affiliated synthetic office',async()=>{configure({users:[{...childMembership,id:1790,agency_id:452,membership_slug:'auricwell-qa-demo-office'}],clients:[{id:2560,agency_id:450,is_demo:1}]});expect(await validateQaIntakeGuardian({agencyId:450,email:'testing+office-family@itsco.health'},db)).toBe(true);});
 it.each([{root_affiliated:0},{membership_active:0},{membership_archived:1},{membership_slug:'real-school'},{membership_flags:{}},{membership_flags:{qaSandbox:{syntheticOnly:'true'}}},{agency_id:999},{role:'support'}])('rejects an unverified nested membership %j',async patch=>{configure({users:[{...childMembership,...patch}]});await expect(validateQaIntakeGuardian({agencyId:450,email:'testing+retained@itsco.health'},db)).rejects.toMatchObject({status:400});});
 it('does not let a valid school membership hide another live membership',async()=>{configure({users:[childMembership,{id:1746,role:'client_guardian',agency_id:2}]});await expect(validateQaIntakeGuardian({agencyId:450,email:'testing+retained@itsco.health'},db)).rejects.toMatchObject({status:400});});
 it.each([{agency_id:2,is_demo:1},{agency_id:450,is_demo:0},{agency_id:453,is_demo:1}])('rejects a linked child outside the verified synthetic family scope %j',async client=>{configure({users:[childMembership],clients:[{id:100,...client}]});await expect(validateQaIntakeGuardian({agencyId:450,email:'testing+retained@itsco.health'},db)).rejects.toMatchObject({status:400});});
 it('checks links even when the only membership is the QA root',async()=>{configure({users:[{id:9,role:'client_guardian',agency_id:450}],clients:[{id:101,agency_id:2,is_demo:0}]});await expect(validateQaIntakeGuardian({agencyId:450,email:'testing+root-family@itsco.health'},db)).rejects.toMatchObject({status:400});});
});
describe('NLU QA enrollment identity markers',()=>{
 const nlu=id=>({id,slug:id===453?'nlu-qa-demo':'nlu-qa-learning',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}});
 it.each([453,454])('marks the exact verified NLU family in scope %s',async agencyId=>{configure({root:nlu(agencyId),users:[{id:1759,role:'client_guardian',agency_id:453},{id:1759,role:'client_guardian',agency_id:454}],clients:[{id:77,agency_id:453,is_demo:1}]});await markQaIntakeGuardian({agencyId,userId:1759,email:'qa.nlu.parent@example.com'},db);expect(db.execute.mock.calls.at(-1)[1]).toEqual([agencyId,1759,'qa.nlu.parent@example.com']);});
 it.each([6,450,451,999])('rejects an NLU guardian with outside membership %s',async outside=>{configure({root:nlu(453),users:[{id:1759,role:'client_guardian',agency_id:outside}]});await expect(markQaIntakeGuardian({agencyId:453,userId:1759,email:'qa.nlu.parent@example.com'},db)).rejects.toHaveProperty('status',400);expect(db.execute).toHaveBeenCalledTimes(2);});
 it('also rejects a live NLU linked child under a QA-only membership',async()=>{configure({root:nlu(453),users:[{id:1759,role:'client_guardian',agency_id:453}],clients:[{id:6,agency_id:6,is_demo:0}]});await expect(validateQaIntakeGuardian({agencyId:453,email:'qa.nlu.parent@example.com'},db)).rejects.toHaveProperty('status',400);});
 it('leaves live NLU outside QA identity mutation',async()=>{expect(await validateQaIntakeGuardian({agencyId:6,email:'parent@live.example'},db)).toBe(false);expect(db.execute).not.toHaveBeenCalled();});
 it('rejects a reserved ID without its exact synthetic agency markers',async()=>{configure({root:{id:453,slug:'nlu',feature_flags:{}}});await expect(markQaIntakeGuardian({agencyId:453,userId:1759,email:'qa.nlu.parent@example.com'},db)).rejects.toHaveProperty('status',400);});
});
