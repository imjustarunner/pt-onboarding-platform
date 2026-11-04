import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {readAssignedClientCare} from '../auricwellClientPreview.service.js';
import {createAuricwellDirectory} from '../auricwellDirectory.service.js';
import {previewRouteAllowed} from '../auricwellPreviewPolicy.js';
it('rechecks the actor assignment and QA boundary before allowing a personal preview',async()=>{
 const database={execute:vi.fn().mockResolvedValueOnce([[{id:9,agency_id:3}]]).mockResolvedValueOnce([[]])},directory=createAuricwellDirectory({database});
 expect(await directory.assignedClient({actor:{id:7},clientId:9})).toEqual({id:9,agency_id:3});
 expect(database.execute.mock.calls[0][1]).toEqual([9,7,7]);
 await expect(directory.assignedClient({actor:{id:7},clientId:9,qaAgencyId:2})).rejects.toMatchObject({status:404});
 expect(database.execute.mock.calls[1][1]).toEqual([9,7,7,2]);
 expect(previewRouteAllowed('GET','/auricwell-preview/my-clients/9/preview')).toBe(true);
 expect(previewRouteAllowed('POST','/auricwell-preview/my-clients/9/preview')).toBe(false);
});
it('uses chart precedence and projects care details without clinical note bodies or unrelated plan fields',async()=>{
 const plans={listByClient:vi.fn().mockResolvedValue([{id:4,status:'draft',title:'Intake Treatment Plan'},{id:5,status:'active',title:'Existing care plan'}]),findById:vi.fn().mockResolvedValue({id:5,agency_id:3,client_id:9,title:'Existing care plan',status:'active',prescribedFrequency:'Weekly',privateField:'omit',goals:[{id:6,goal_text:'Care goal',objectives:[{id:7,objective_text:'Objective',scale_current:4,scale_target:8,interventions:['omit']}]}]})};
 const database={execute:vi.fn().mockResolvedValue([[{id:8,name:'Parent One'},{id:10,name:'Parent Two'}]])};
 const result=await readAssignedClientCare({id:9,agency_id:3},{database,plans});
 expect(plans.listByClient).toHaveBeenCalledWith({clientId:9,agencyId:3});expect(plans.findById).toHaveBeenCalledWith(5);
 expect(result.guardians).toHaveLength(2);expect(result.plan.frequency).toBe('Weekly');expect(result.plan.goals[0].objectives[0]).toEqual({id:7,text:'Objective',current:4,target:8});expect(JSON.stringify(result)).not.toContain('omit');
});
it('fails closed when the selected plan belongs to another client or agency',async()=>{
 const plans={listByClient:vi.fn().mockResolvedValue([{id:5,status:'active',title:'Plan'}]),findById:vi.fn().mockResolvedValue({agency_id:99,client_id:9})},database={execute:vi.fn()};
 await expect(readAssignedClientCare({id:9,agency_id:3},{plans,database})).rejects.toMatchObject({status:404});expect(database.execute).not.toHaveBeenCalled();
});
