import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {scopeProviderProfile,scopeProviderRow,agencyFormatAllowed,agencyOfficeAllowed} from '../../utils/providerAgencyAvailability.js';
import {saveAgencyAvailability} from '../providerAgencyAvailability.service.js';
const open={seesClients:true,acceptingNewClients:true,inPerson:true,virtual:true,waitlistEnabled:false,school:true,scheduleAgencyId:1,officeIds:null};
const profile={details:{availabilityByAgency:{1:{...open,virtual:false},2:{...open,inPerson:false,officeIds:[8]}}}};
describe('agency-specific publication',()=>{
 it('allows counseling in person in A and tutoring virtually in B without mutating shared profile',()=>{
  const a=scopeProviderProfile(profile,1),b=scopeProviderProfile(profile,2);
  expect(agencyFormatAllowed(a.agencyAvailability,'IN_PERSON')).toBe(true);expect(agencyFormatAllowed(a.agencyAvailability,'VIRTUAL')).toBe(false);
  expect(agencyFormatAllowed(b.agencyAvailability,'IN_PERSON')).toBe(false);expect(agencyFormatAllowed(b.agencyAvailability,'VIRTUAL')).toBe(true);
  expect(profile.details.virtualEnabled).toBeUndefined();expect(agencyOfficeAllowed(b.agencyAvailability,9)).toBe(false);
 });
 it('keeps participation independent from global status and closure independent from other agencies',()=>{
  const details={availabilityByAgency:{1:{...open,seesClients:false},2:open}};
  expect(scopeProviderRow({sees_clients:1},1,details).sees_clients).toBe(false);
  expect(scopeProviderRow({sees_clients:0},2,details).sees_clients).toBe(true);
  expect(agencyFormatAllowed({...open,acceptingNewClients:false},'VIRTUAL')).toBe(false);
  expect(agencyFormatAllowed({...open,acceptingNewClients:false},'VIRTUAL',{intake:false})).toBe(true);
 });
});
let database,writes;
beforeEach(()=>{writes=[];database={execute:vi.fn(async(sql,args)=>{
 if(sql.includes('SELECT a.id,a.name'))return [[{id:1,name:'A'},{id:2,name:'B'}]];
 if(sql.includes('SELECT agency_id FROM user_agencies'))return [[{agency_id:1}]];
 if(sql.includes('FROM office_standing_assignments'))return [[{provider_id:9,id:8,name:'Shared office',city:'Denver'}]];
 if(sql.includes('INSERT INTO provider_public_profiles'))writes.push(JSON.parse(args[1]));
 return [[]];
})};});
const save=(body,actor={id:9,role:'provider'})=>saveAgencyAvailability(database,{providerId:9,agencyId:1,actor,body:{...open,...body}});
describe('authorized availability edits',()=>{
 it('writes only the selected agency and never erases schedules, reservations, bookings or global participation',async()=>{
 await save({acceptingNewClients:false});expect(Object.keys(writes[0].availabilityByAgency)).toEqual(['1']);
 const sql=database.execute.mock.calls.map(c=>c[0]).join('\n');expect(sql).not.toMatch(/DELETE|UPDATE users|UPDATE office_events|UPDATE provider_(virtual|in_person)/);
 });
 it('shares settings and source schedule across memberships but keeps offices agency-local',async()=>{
 await save({applyToAll:true,officeIds:[8]});expect(writes[0].availabilityByAgency).toMatchObject({1:{scheduleAgencyId:1,officeIds:[8]},2:{scheduleAgencyId:1,officeIds:null}});
 });
 it('rejects a manager updating an unauthorized agency or using its schedule',async()=>{
 const actor={id:10,role:'admin'};
 await expect(save({applyToAll:true},actor)).rejects.toMatchObject({status:403});
 await expect(save({scheduleAgencyId:2},actor)).rejects.toMatchObject({status:403});expect(writes).toHaveLength(0);
 });
 it('rejects an unassigned office and forged boolean values',async()=>{
 await expect(save({officeIds:[999]})).rejects.toMatchObject({status:400});
 await expect(save({virtual:'false'})).rejects.toMatchObject({status:400});expect(writes).toHaveLength(0);
 });
});
