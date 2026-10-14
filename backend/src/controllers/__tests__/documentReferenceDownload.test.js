import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({task:vi.fn(),template:vi.fn(),ack:vi.fn(),read:vi.fn()}));
vi.mock('../../models/Task.model.js',()=>({default:{findById:m.task}}));
vi.mock('../../models/DocumentTemplate.model.js',()=>({default:{findById:m.template}}));
vi.mock('../../models/DocumentAcknowledgment.model.js',()=>({default:{findByTaskAndUser:m.ack}}));
vi.mock('../../services/storage.service.js',()=>({default:{getGCSBucket:async()=>({file:()=>({download:async()=>[await m.read()]})})}}));
import {downloadAcknowledgedDocument,viewAcknowledgedDocument} from '../documentAcknowledgment.controller.js';
const pdf=Buffer.from('%PDF-reference-original');
const task={task_type:'document',document_action_type:'review',status:'completed',assigned_to_user_id:8,assigned_to_agency_id:2,reference_id:99,metadata:{referenceOnly:true}};
function response(){return {status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),send:vi.fn(),setHeader:vi.fn()};}
beforeEach(()=>{vi.clearAllMocks();m.task.mockResolvedValue({...task});m.template.mockResolvedValue({name:'Compensation reference',template_type:'pdf',file_path:'secure-messages/employee-references/2/8/reference.pdf',is_user_specific:1,user_id:8});m.read.mockResolvedValue(pdf);m.ack.mockResolvedValue(null);});
it('lets the employee download their filed reference unchanged without inventing acknowledgment',async()=>{const res=response(),next=vi.fn();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,next);expect(res.send).toHaveBeenCalledWith(pdf);expect(m.ack).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();});
it('does not expose another employee’s reference',async()=>{const res=response();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:9,role:'provider'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(m.read).not.toHaveBeenCalled();});
it.each([{metadata:{}},{status:'pending'}])('retains acknowledgment requirement for ordinary or unfinished review documents: %j',async patch=>{m.task.mockResolvedValue({...task,...patch});const res=response();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(res.send).not.toHaveBeenCalled();});
it('requires a matching employee-specific document',async()=>{m.template.mockResolvedValue({template_type:'pdf',file_path:'secure-messages/employee-references/2/8/reference.pdf',is_user_specific:1,user_id:9});const res=response();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(res.send).not.toHaveBeenCalled();});

it('rejects a reference path outside the assigned employee’s private folder',async()=>{m.template.mockResolvedValue({template_type:'pdf',file_path:'secure-messages/employee-references/2/9/reference.pdf',is_user_specific:1,user_id:8});const res=response(),next=vi.fn();await downloadAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,next);expect(next).toHaveBeenCalledWith(expect.any(Error));expect(m.read).not.toHaveBeenCalled();});
it('views the same private PDF for its employee without caching',async()=>{const res=response(),next=vi.fn();await viewAcknowledgedDocument({params:{taskId:1},user:{id:8,role:'provider'}},res,next);expect(res.send).toHaveBeenCalledWith(pdf);expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');expect(next).not.toHaveBeenCalled();});
