import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({getConnection:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{getConnection:m.getConnection,execute:m.execute}}));
import Plan from '../clinical/ClinicalTreatmentPlan.model.js';
let conn,source;
beforeEach(()=>{
 vi.restoreAllMocks();source={status:'draft',source_tool_id:'client_records_import:synthetic'};
 conn={execute:vi.fn(async sql=>sql.startsWith('SELECT status')?[[source]]:sql.startsWith('INSERT')?[{insertId:55}]:[{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(conn);vi.spyOn(Plan,'findById').mockResolvedValue({id:55,status:'active'});
});
it('archives the imported source draft in the same transaction as its provider-finalized replacement',async()=>{
 await Plan.create({agencyId:2,clientId:42,createdByUserId:10,status:'active',supersedesImportedDraftId:44,goals:[]});
 expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'),[44,2,42]]);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'superseded'"),[44,2,42]);expect(conn.commit).toHaveBeenCalledOnce();expect(conn.rollback).not.toHaveBeenCalled();
});
it.each([null,{status:'active',source_tool_id:'client_records_import:source'},{status:'draft',source_tool_id:'other'}])('preserves a missing, already finalized or unrelated source (%j)',async value=>{
 source=value;await expect(Plan.create({agencyId:2,clientId:42,createdByUserId:10,supersedesImportedDraftId:44})).rejects.toHaveProperty('status',409);
 expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(conn.commit).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalledOnce();
});
