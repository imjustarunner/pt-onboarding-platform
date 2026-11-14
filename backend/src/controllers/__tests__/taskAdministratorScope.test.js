import{beforeEach,expect,it,vi}from'vitest';
const m=vi.hoisted(()=>({findById:vi.fn(),findByUser:vi.fn(),getAll:vi.fn(),override:vi.fn(),updateDueDate:vi.fn(),deleteTask:vi.fn(),getAgencies:vi.fn(),logAction:vi.fn(),sendReminder:vi.fn()}));
vi.mock('../../models/Task.model.js',()=>({default:m}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.getAgencies}}));
vi.mock('../../models/TaskAuditLog.model.js',()=>({default:{logAction:m.logAction}}));
vi.mock('../../models/TaskDeletionLog.model.js',()=>({default:{}}));
vi.mock('../../models/TaskDependency.model.js',()=>({default:{}}));
vi.mock('../../services/taskAssignment.service.js',()=>({default:{sendReminder:m.sendReminder}}));
vi.mock('../../services/storage.service.js',()=>({default:{}}));
vi.mock('../../services/documentVariable.service.js',()=>({default:{}}));
vi.mock('../../services/providerUpdateTasks.service.js',()=>({providerUpdateTasks:vi.fn()}));
import*as controller from'../task.controller.js';
let req,res,next;
beforeEach(()=>{vi.clearAllMocks();req={user:{id:1807,role:'admin',scopedAgencyId:453},params:{id:'77'},headers:{'x-agency-id':'453'},query:{},body:{dueDate:'2099-01-01'}};res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();m.getAgencies.mockResolvedValue([{id:453,is_active:1},{id:454,is_active:1}]);m.findByUser.mockResolvedValue([]);m.findById.mockResolvedValue({id:77,assigned_to_agency_id:6,assigned_to_user_id:90,task_type:'document'});});
it.each(['getTask','renderTaskDocumentHtml','overrideTask','updateDueDate','deleteTask','sendReminder'])('denies a foreign task in %s even with an authorized QA header',async name=>{
 await controller[name](req,res,next);
 expect(res.status.mock.calls.some(([code])=>code===403)||next.mock.calls.some(([error])=>error?.status===403)).toBe(true);
 expect(m.override).not.toHaveBeenCalled();expect(m.updateDueDate).not.toHaveBeenCalled();expect(m.deleteTask).not.toHaveBeenCalled();expect(m.sendReminder).not.toHaveBeenCalled();expect(m.logAction).not.toHaveBeenCalled();
});
it('does not fetch another agency’s task list',async()=>{
 req.query.assignedToAgencyId=6;await controller.getAllTasks(req,res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.getAll).not.toHaveBeenCalled();
});
it('still permits an authorized same-agency override and attributes its audit',async()=>{
 m.findById.mockResolvedValue({id:77,assigned_to_agency_id:453,assigned_to_user_id:1496});
 m.override.mockResolvedValue({id:77,status:'overridden'});
 await controller.overrideTask(req,res,next);expect(next).not.toHaveBeenCalled();expect(m.override).toHaveBeenCalledWith('77',1807);
 expect(m.logAction).toHaveBeenCalledWith(expect.objectContaining({actorUserId:1807,targetUserId:1496}));
});
