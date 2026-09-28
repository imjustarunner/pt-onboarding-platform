import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{getForProvider:vi.fn()}}));
import pool from '../../config/database.js';
import Profile from '../../models/ProviderPublicProfile.model.js';
import {listOfficeIntakeProviders} from '../officeIntakeProviders.service.js';
const profiles={
 1:{seesClients:true,acceptingNewClients:true,inPerson:true,virtual:false,waitlistEnabled:false},
 2:{seesClients:true,acceptingNewClients:false,inPerson:true,virtual:false,waitlistEnabled:true},
 3:{seesClients:true,acceptingNewClients:false,inPerson:true,virtual:false,waitlistEnabled:false}
};
beforeEach(()=>{vi.resetAllMocks();Profile.getForProvider.mockImplementation(async({providerUserId})=>({agencyAvailability:profiles[providerUserId],details:{}}));pool.execute.mockImplementation(async sql=>{
 if(sql.includes('SELECT u.id'))return [[1,2,3].map(id=>({id,first_name:'Provider',last_name:String(id),accepting:0,in_office_available:0,open_slots:0}))];
 if(sql.includes('user_info_values')&&!sql.includes('age_specialty'))return [[{user_id:1,value:'["Couples"]'},{user_id:2,value:'["Individuals"]'}]];
 return [[]];
});});
describe('full enrollment provider requests',()=>{
 it('includes in-person providers without posted slots or global in-office flags',async()=>{const people=await listOfficeIntakeProviders(2,{includeNotAccepting:false,programType:'IN_PERSON'});expect(people.map(p=>p.id)).toEqual([1]);expect(people[0].openSlots).toBe(0);expect(people[0].inOfficeAvailable).toBe(true);});
 it('allows clearly labeled waitlist preferences while excluding closed providers',async()=>{const people=await listOfficeIntakeProviders(2,{includeNotAccepting:false,includeWaitlist:true,programType:'IN_PERSON'});expect(people.map(p=>p.id)).toEqual([1,2]);expect(people[1].waitlist).toBe(true);});
 it('does not offer in-person-only providers for virtual requests',async()=>expect(await listOfficeIntakeProviders(2,{includeNotAccepting:false,programType:'VIRTUAL'})).toEqual([]));
 it('requires a matching couples service even without a posted opening',async()=>{const people=await listOfficeIntakeProviders(2,{includeNotAccepting:false,includeWaitlist:true,serviceMode:'couple',programType:'IN_PERSON'});expect(people.map(p=>p.id)).toEqual([1]);});
});
