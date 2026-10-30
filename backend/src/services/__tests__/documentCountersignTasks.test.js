import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {listDocumentCountersignTasks,assertCountersignTaskCompletion} from '../documentCountersignTasks.service.js';
const actor={id:3,role:'super_admin'};
const row=(extra={})=>({id:1907,document_task_id:1906,title:'Countersign — Agreement',assigned_to_user_id:506,assigned_to_agency_id:2,employee_name:'Test Employee',agency_name:'Test Agency',metadata:{requiredCountersignerUserId:3},signed_user_id:506,signed_pdf_path:'private.pdf',signed_at:'2026-10-16 13:37:12',audit_trail:{},...extra});
it('uses only the actor’s assigned countersignatures and returns a minimal review link payload',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[row()]])};
 const items=await listDocumentCountersignTasks(actor,2,db);
 expect(db.execute.mock.calls[0][1]).toEqual([3,3,2,2,'super_admin',3]);
 expect(db.execute.mock.calls[0][0]).toContain('t.countersign_signer_user_id=?');
 expect(items).toEqual([expect.objectContaining({id:1907,documentTaskId:1906,state:'ready',employeeName:'Test Employee'})]);
 expect(items[0]).not.toHaveProperty('signed_pdf_path');expect(items[0]).not.toHaveProperty('metadata');
});
it('separates waiting and mismatched records and excludes signed or superseded documents',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[row({signed_user_id:null,signed_pdf_path:null}),row({signed_user_id:3}),row({audit_trail:{adminCountersign:{signedAt:'2026-10-29'}}}),row({metadata:{signatureRequestSupersededAt:'2026-10-29'}})]])};
 expect((await listDocumentCountersignTasks(actor,null,db)).map(i=>i.state)).toEqual(['waiting','needs_review']);
});
it('does not expose the queue to an employee or accept an invalid agency',async()=>{
 const db={execute:vi.fn()};expect(await listDocumentCountersignTasks({id:506,role:'provider'},2,db)).toEqual([]);
 await expect(listDocumentCountersignTasks(actor,'bad',db)).rejects.toMatchObject({status:400});expect(db.execute).not.toHaveBeenCalled();
});
it('cannot complete a countersignature with a generic task checkbox',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{document_action_type:'countersignature'}]])};
 await expect(assertCountersignTaskCompletion(1907,db)).rejects.toMatchObject({status:409});
 db.execute.mockResolvedValue([[{document_action_type:'signature'}]]);await expect(assertCountersignTaskCompletion(1906,db)).resolves.toBeUndefined();
});

import Task from '../../models/Task.model.js';
import pool from '../../config/database.js';
it.each(['markComplete','updateStatus'])('protects countersignatures through the %s task mutation',async method=>{
 pool.execute.mockReset();pool.execute.mockResolvedValue([[{document_action_type:'countersignature'}]]);
 await expect(Task[method](1907,'completed')).rejects.toMatchObject({status:409});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
