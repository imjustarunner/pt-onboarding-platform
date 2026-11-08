import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import Master from '../AgencyOfficeIntakeMaster.model.js';
it('uses the same office questions and step order in Spanish including guardian DOB and emergency contact',async()=>{
 vi.spyOn(Master,'getOrCreateForAgency').mockResolvedValue({id:1,version:1,intake_steps:[{id:'legacy',type:'questions',fields:[{key:'physical_abuse',label:''}]},{id:'consent',type:'packet_informed_group_consent'},{id:'insurance',type:'insurance_info'},{id:'communications',type:'communications'}]});
 const results=[];
 for(const language_code of ['en','es'])results.push(await Master.applyMasterToLink({id:4,inherits_office_master:1,organization_id:450,master_channel:'counseling',language_code}));
 expect(results[1].intake_steps).toEqual(results[0].intake_steps);
 const fields=results[1].intake_steps.flatMap(s=>s.fields||[]);
 for(const key of ['guardian_dob','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone'])expect(fields.some(f=>f.key===key)).toBe(true);
 expect(results[1].intake_steps.findIndex(s=>s.type==='insurance_info')).toBeLessThan(results[1].intake_steps.findIndex(s=>s.type==='packet_informed_group_consent'));
});
