import {it,expect,vi} from 'vitest';
import {openWaitlistedPublication} from '../availabilityPublicationStatus.service.js';
const policy={seesClients:true,virtual:true,inPerson:true,school:true,scheduleAgencyId:2,acceptingNewClients:false,waitlistEnabled:true,intakeStatusByFormat:{VIRTUAL:'waitlist',IN_PERSON:'waitlist',SCHOOL:'unavailable'}};
function fixture(p=policy){const details={availabilityByAgency:{2:p,3:{virtual:false}},publicBlurb:'Keep me'};const db={execute:vi.fn(async sql=>sql.includes('FROM users')?[[{id:9,sees_clients:1}]]:sql.includes('FROM provider_public_profiles')?[[{public_details_json:details}]]:[{}])};return db;}
it('opens only the published format, preserving the other format and agency',async()=>{
 const db=fixture();expect(await openWaitlistedPublication(db,{providerId:9,agencyId:2,formats:['VIRTUAL']})).toBe(true);
 const write=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'));
 const patch=JSON.parse(write[1][1]);expect(Object.keys(patch.availabilityByAgency)).toEqual(['2']);
 expect(patch.availabilityByAgency[2]).toMatchObject({seesClients:true,acceptingNewClients:true,waitlistEnabled:true,intakeStatusByFormat:{VIRTUAL:'accepting',IN_PERSON:'waitlist',SCHOOL:'unavailable'}});
 expect(write[0]).toContain('JSON_MERGE_PATCH');
});
it('clears the remaining waitlist flag when both formats are opened',async()=>{
 const db=fixture();await openWaitlistedPublication(db,{providerId:9,agencyId:2,formats:['IN_PERSON','VIRTUAL']});
 expect(JSON.parse(db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'))[1][1]).availabilityByAgency[2].waitlistEnabled).toBe(false);
});
it.each([{...policy,seesClients:false},{...policy,intakeStatusByFormat:{VIRTUAL:'unavailable'}},{...policy,intakeStatusByFormat:{VIRTUAL:'accepting'}}])('does not grant care access or change a non-waitlisted format',async p=>{
 const db=fixture(p);expect(await openWaitlistedPublication(db,{providerId:9,agencyId:2,formats:['VIRTUAL']})).toBe(false);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('private/current-client-only publications do not change intake',async()=>{const db=fixture();await openWaitlistedPublication(db,{providerId:9,agencyId:2,formats:[]});expect(db.execute).not.toHaveBeenCalled();});
it('a failed status update propagates so the caller can roll back the publication',async()=>{
 const db=fixture(),read=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.startsWith('INSERT')?Promise.reject(Error('write failed')):read(sql,args));
 await expect(openWaitlistedPublication(db,{providerId:9,agencyId:2,formats:['VIRTUAL']})).rejects.toThrow('write failed');
});
