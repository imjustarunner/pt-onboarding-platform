import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../smsRequestedSupport.service.js',()=>({alertRequestedSupport:vi.fn()}));
import pool from '../../config/database.js';
import { alertRequestedSupport } from '../smsRequestedSupport.service.js';
import { requestRelaySupport } from '../providerRelaySupport.service.js';
const input={enrollment:{agency_id:450,provider_user_id:501,number_id:6},route:{id:1,client_id:2271,family_phone:'+12025550100'},inboundLogId:80};
let db,existing;
beforeEach(()=>{vi.clearAllMocks();existing=[];db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT')?[existing]:[{insertId:90,affectedRows:1}])};pool.getConnection.mockResolvedValue(db);alertRequestedSupport.mockResolvedValue();});
it('persists a scoped actionable ticket and exact thread before alerting Support',async()=>{
 expect(await requestRelaySupport(input)).toBe(90);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("support_access='respond'"),[90,450,2271,6]);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('supportRequestedByProvider'),[90,1,80,450]);
 expect(db.commit.mock.invocationCallOrder[0]).toBeLessThan(alertRequestedSupport.mock.invocationCallOrder[0]);
 expect(alertRequestedSupport).toHaveBeenCalledWith(80);
});
it('reuses an existing open request for the same provider and client',async()=>{
 existing=[{id:89}];expect(await requestRelaySupport(input)).toBe(89);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('rolls back failures and retains committed tickets when alert delivery fails',async()=>{
 db.execute.mockRejectedValueOnce(new Error('db unavailable'));
 await expect(requestRelaySupport(input)).rejects.toThrow('db unavailable');expect(db.rollback).toHaveBeenCalled();expect(alertRequestedSupport).not.toHaveBeenCalled();
 alertRequestedSupport.mockRejectedValue(new Error('dispatch unavailable'));
 expect(await requestRelaySupport(input)).toBe(90);expect(db.commit).toHaveBeenCalled();
});
