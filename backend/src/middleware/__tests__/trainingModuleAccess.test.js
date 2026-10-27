import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../models/Module.model.js',()=>({default:{findById:vi.fn(),findShared:vi.fn(),findByAgency:vi.fn(),findAll:vi.fn()}}));
vi.mock('../../models/ModuleContent.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(),findById:vi.fn()}}));
vi.mock('../../models/AgencyPublicTraining.model.js',()=>({default:{getModuleAssignment:vi.fn()}}));
vi.mock('../../services/moduleCopy.service.js',()=>({default:{}}));
vi.mock('../../services/taskAssignment.service.js',()=>({default:{}}));
import Module from '../../models/Module.model.js';
import Content from '../../models/ModuleContent.model.js';
import User from '../../models/User.model.js';
import PublicTraining from '../../models/AgencyPublicTraining.model.js';
import {canReadTrainingModule,requireTrainingModuleAccess} from '../trainingModuleAccess.middleware.js';
import {getAllModules} from '../../controllers/module.controller.js';
const user={id:1433,role:'provider'},module={id:10,agency_id:450,is_active:1,publish_status:'published'};
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();User.getAgencies.mockResolvedValue([{id:450}]);User.findById.mockResolvedValue({status:'ACTIVE_EMPLOYEE'});Module.findById.mockResolvedValue(module);PublicTraining.getModuleAssignment.mockResolvedValue(null);});
it.each(['provider','support'])('keeps %s module content and quiz attempts in the assigned tenant',async role=>{
 const req={user:{...user,role},params:{moduleId:'10'},method:'GET'},res=response(),next=vi.fn();
 await requireTrainingModuleAccess(req,res,next);expect(next).toHaveBeenCalledWith();
 next.mockClear();Module.findById.mockResolvedValue({...module,agency_id:2});
 await requireTrainingModuleAccess(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
it('preserves published shared and explicitly assigned on-demand training without exposing drafts',async()=>{
 expect(await canReadTrainingModule(user,{...module,agency_id:null,is_shared:1})).toBe(true);
 expect(await canReadTrainingModule(user,{...module,agency_id:null,is_shared:1,publish_status:'draft'})).toBe(false);
 PublicTraining.getModuleAssignment.mockResolvedValue({agency_id:450,module_id:10});
 expect(await canReadTrainingModule(user,{...module,agency_id:2})).toBe(true);
 expect(PublicTraining.getModuleAssignment).toHaveBeenCalledWith(450,10);
});
it('does not permit content edits just because another agency shared the course for reading',async()=>{
 Module.findById.mockResolvedValue({...module,agency_id:2});PublicTraining.getModuleAssignment.mockResolvedValue({module_id:10});
 const res=response(),next=vi.fn();
 await requireTrainingModuleAccess({user:{...user,role:'admin'},params:{id:10},method:'POST',path:'/10/content'},res,next);
 expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
it('rejects another module content ID even when the URL module belongs to the user agency',async()=>{
 Content.findById.mockResolvedValue({id:20,module_id:11});const res=response(),next=vi.fn();
 await requireTrainingModuleAccess({user:{...user,role:'admin'},params:{id:10,contentId:20},method:'PUT',path:'/10/content/20'},res,next);
 expect(res.status).toHaveBeenCalledWith(404);expect(next).not.toHaveBeenCalled();
});
it('limits the learner catalog to agency and published shared courses',async()=>{
 Module.findShared.mockResolvedValue([{...module,id:11,agency_id:null,is_shared:1},{...module,id:12,agency_id:null,is_shared:1,publish_status:'draft'}]);Module.findByAgency.mockResolvedValue([module]);
 const res=response(),next=vi.fn();await getAllModules({user},res,next);
 expect(next).not.toHaveBeenCalled();expect(Module.findByAgency).toHaveBeenCalledWith(450,false);expect(Module.findAll).not.toHaveBeenCalled();
 expect(res.json.mock.calls[0][0].map(m=>m.id)).toEqual([11,10]);
});
it('propagates database failure without granting access',async()=>{
 Module.findById.mockRejectedValue(new Error('DB unavailable'));const next=vi.fn();
 await requireTrainingModuleAccess({user,params:{id:10}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'DB unavailable'}));
});
