import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({main:{execute:vi.fn()},clinical:{getConnection:vi.fn()},context:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m.main}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:m.clinical}));
vi.mock('../h0002ScreeningWorkflow.service.js',()=>({screeningReviewContext:m.context}));
import { closeRoiScreening } from '../h0002ScreeningDisposition.service.js';
let db,context;
beforeEach(()=>{
 vi.resetAllMocks();context={note:{id:7},source:{roiOnly:true,sourceHash:'v1',task:{id:10}}};m.context.mockResolvedValue(context);
 m.main.execute.mockResolvedValue([[{schemaName:'app',serverId:'same'}]]);
 db={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('server_uuid')?[[{serverId:'same'}]]:sql.includes('FOR UPDATE')?[[{created_by_user_id:8}]]:sql.includes('FROM clinical_claims')?[[]]:[{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.clinical.getConnection.mockResolvedValue(db);
});
const close=()=>closeRoiScreening({sessionId:12,user:{id:8},sourceHash:'v1'});
describe('nonclinical ROI task disposition',()=>{
 it('closes the task transactionally while retaining the unsigned note, source and actor',async()=>{
  expect(await close()).toMatchObject({disposition:'roi_only'});expect(db.commit).toHaveBeenCalledOnce();
  const updates=db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'));
  expect(updates).toHaveLength(4);expect(updates.find(([sql])=>sql.includes('UPDATE clinical_notes'))[0]).toContain('is_billable=0');
  expect(updates.some(([sql])=>/SET.*provider_signed_at|INSERT|DELETE/.test(sql))).toBe(false);
  expect(updates.find(([sql])=>sql.includes('UPDATE clinical_notes'))[1][0]).toContain('"actorUserId":8');
  expect(db.release).toHaveBeenCalled();
 });
 it.each(['clinical','stale','signed'])('blocks %s records before changing anything',async kind=>{
  if(kind==='clinical')context.source.roiOnly=false;if(kind==='stale')context.source.sourceHash='v2';if(kind==='signed')context.note.provider_signed_at='2026-10-22';
  await expect(close()).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
 it('rejects a record with a claim',async()=>{const run=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.includes('FROM clinical_claims')?[[{id:9}]]:run(sql,args));await expect(close()).rejects.toThrow('claim');expect(db.commit).not.toHaveBeenCalled();});
 it('rolls back task closure if a clinical or queue write fails',async()=>{const run=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.startsWith('UPDATE clinical_notes')?Promise.reject(new Error('write failed')):run(sql,args));await expect(close()).rejects.toThrow('write failed');expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();});
 it('does not bypass reviewer access checks',async()=>{m.context.mockRejectedValue(Object.assign(new Error('Access denied'),{status:403}));await expect(close()).rejects.toMatchObject({status:403});expect(db.beginTransaction).not.toHaveBeenCalled();});
});
