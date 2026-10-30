import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import {enrichDocumentTasks} from '../documentTaskEnrichment.service.js';
it('never interprets a countersignature employee-task reference as a template',async()=>{
 const counter={id:2,task_type:'document',document_action_type:'countersignature',reference_id:9};
 const employee={id:3,task_type:'document',reference_id:9};
 pool.execute.mockResolvedValue([[{id:9,document_type:'contract',employee_display_category:'Employment',is_user_specific:1}]]);
 const tasks=await enrichDocumentTasks([counter,employee]);expect(tasks[0]).toEqual(counter);expect(tasks[1].document_type).toBe('contract');
 pool.execute.mockClear();expect(await enrichDocumentTasks([counter])).toEqual([counter]);expect(pool.execute).not.toHaveBeenCalled();
});
