import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({task:vi.fn(),template:vi.fn(),ack:vi.fn(),read:vi.fn()}));
vi.mock('../../models/Task.model.js',()=>({default:{findById:m.task}}));
vi.mock('../../models/DocumentTemplate.model.js',()=>({default:{findById:m.template}}));
vi.mock('../../models/DocumentAcknowledgment.model.js',()=>({default:{findByTaskAndUser:m.ack}}));
vi.mock('fs/promises',()=>({default:{readFile:m.read}}));
import {downloadAcknowledgedDocument} from '../documentAcknowledgment.controller.js';
const pdf=Buffer.from('%PDF-reference-original');
const task={task_type:'document',document_action_type:'review',status:'completed',assigned_to_user_id:8,reference_id:99,metadata:{referenceOnly:true}};
function response(){return {status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),send:vi.fn(),setHeader:vi.fn()};}
beforeEach(()=>{vi.clearAllMocks();m.task.mockResolvedValue({...task});m.template.mockResolvedValue({name:'Compensation reference',template_type:'pdf',file_path:'templates/reference.pdf',is_user_specific:1,user_id:8});m.read.mockResolvedValue(pdf);m.ack.mockResolvedValue(null);});
it('lets the employee download their filed reference unchanged without inventing acknowledgment',async()=>{const res=response(),next=vi.fn();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,next);expect(res.send).toHaveBeenCalledWith(pdf);expect(m.ack).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();});
it('does not expose another employee’s reference',async()=>{const res=response();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:9,role:'provider'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.read).not.toHaveBeenCalled();});
it.each([{metadata:{}},{status:'pending'}])('retains acknowledgment requirement for ordinary or unfinished review documents: %j',async patch=>{m.task.mockResolvedValue({...task,...patch});const res=response();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(res.send).not.toHaveBeenCalled();});
it('requires a matching employee-specific document',async()=>{m.template.mockResolvedValue({template_type:'pdf',file_path:'templates/reference.pdf',is_user_specific:1,user_id:9});const res=response();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(res.send).not.toHaveBeenCalled();});
