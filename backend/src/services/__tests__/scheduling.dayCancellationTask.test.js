import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Task.model.js',()=>({default:{create:vi.fn()}}));
import pool from '../../config/database.js';
import Task from '../../models/Task.model.js';
import {ensureDayCancellationTask} from '../dayCancellationFollowupTask.service.js';
const plan={dates:['2026-10-27'],date:'2026-10-27',providerId:8,scopes:[{agencyId:2}]};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[]]);Task.create.mockResolvedValue({id:9});});
it('assigns the provider a durable review task linked to the original cancellation',async()=>{
 expect(await ensureDayCancellationTask('original',plan,{id:5})).toBe(9);
 expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({assignedToUserId:8,sourceRefId:'original',metadata:expect.objectContaining({cancellationToken:'original'})}));
});
it('supports a support-team to-do and finds the existing task on retry',async()=>{
 await ensureDayCancellationTask('original',{...plan,followupOwner:'support'},{id:5});expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({assignedToRole:'support',assignedToUserId:null,assignedToAgencyId:2}));
 pool.execute.mockResolvedValue([[{id:9}]]);expect(await ensureDayCancellationTask('original',plan,{id:5})).toBe(9);expect(Task.create).toHaveBeenCalledTimes(1);
});
