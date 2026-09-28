import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {enrichAvailabilityRoster} from '../providerAvailabilityRoster.service.js';
import {providerServiceSettings} from '../../utils/providerServiceOfferings.js';
const types=[{service_type:'counseling',display_name:'Counseling'}];
describe('provider management roster',()=>{
 it('preserves explicit tenant choices despite published hours and limits every provider query to authorized IDs',async()=>{
  const person={id:9,role:'provider',status:'ACTIVE_EMPLOYEE',sees_clients:1,provider_accepting_new_clients:1,published_virtual:1,public_details_json:{availabilityByAgency:{'2':{seesClients:true,acceptingNewClients:false,virtual:false,inPerson:true,school:false,waitlistEnabled:true}},serviceOfferingsByAgency:{'2':['counseling']}}};
  const db={execute:vi.fn(async(sql,args)=>{
   if(sql.includes('FROM users u'))return [[person]];
   if(sql.includes('FROM agency_public_service_types'))return [types];
   if(sql.includes('FROM provider_public_service_enrollments'))return [[{user_id:9,service_type:'counseling',is_active:1}]];
   if(sql.includes('FROM office_standing_assignments'))return [[{provider_id:9,id:7,name:'Windchime'}]];
   throw Error('Unexpected query');
  })};
  const [row]=await enrichAvailabilityRoster([{id:9,first_name:'Example'}],2,db);
  expect(row.preferences).toMatchObject({acceptingNewClients:false,virtual:false,inPerson:true,school:false,waitlistEnabled:true});
  expect(row.services).toEqual([{serviceType:'counseling',displayName:'Counseling',offered:true,onlineScheduling:true}]);
  expect(row.offices[0].name).toBe('Windchime');
  for(const [sql,args] of db.execute.mock.calls){expect(args[0]).toBe(2);if(!sql.includes('FROM agency_public_service_types'))expect(args.at(-1)).toBe(9);expect(sql).not.toMatch(/UPDATE|INSERT/);}
 });
 it('does not query an unscoped roster when no providers are authorized',async()=>{const db={execute:vi.fn()};expect(await enrichAvailabilityRoster([],2,db)).toEqual([]);expect(db.execute).not.toHaveBeenCalled();});
 it('uses agency roles and legacy coaching defaults consistently without enabling online booking',()=>{
  expect(providerServiceSettings({role:'staff',agency_role:'provider',status:'ACTIVE_EMPLOYEE'},2,types,[])[0]).toMatchObject({offered:true,onlineScheduling:false});
  expect(providerServiceSettings({role:'staff',organization_type:'life_coach',status:'ACTIVE_EMPLOYEE'},3,[{service_type:'coaching'}],[])[0]).toMatchObject({offered:true,onlineScheduling:false});
 });
});
