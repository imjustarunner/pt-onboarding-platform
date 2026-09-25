import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import { appendClinicalNoteAmendment } from '../clinicalNoteAmendment.service.js';
describe('mandatory amendment sign-off',()=>{
  const setup=(note)=>{
    const db={execute:vi.fn().mockResolvedValue([{insertId:7}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
    db.execute.mockResolvedValueOnce([[note]]);
    return {db,source:{getConnection:async()=>db}};
  };
  const args={noteId:4,agencyId:1,body:'Clarifies the original documentation.',actorUserId:5};
  it('retains the original signed narrative and archives cosign while making renewed approval necessary',async()=>{
    const old={contentHash:'original',cosignedByUserId:9,cosignedAt:'2026-09-23'};
    const {db,source}=setup({provider_signed_at:'2026-09-22',client_id:3,note_payload:'Original signed narrative',metadata_json:{supervisorCosign:old,supervisorCosignHistory:[{contentHash:'older'}]}});
    await appendClinicalNoteAmendment(args,source);
    expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(db.execute.mock.calls[0][1]).toEqual([4,1]);
    const [sql,values]=db.execute.mock.calls[2];
    expect(sql).toContain('supervisor_cosigned_at=NULL');expect(sql).not.toContain('note_payload=');
    expect(JSON.parse(values[0])).toEqual({supervisorCosignHistory:[{contentHash:'older'},old]});
    expect(db.commit).toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
  });
  it('rolls back both amendment and signature invalidation on failure',async()=>{
    const {db,source}=setup({provider_signed_at:'2026-09-22',client_id:3});
    db.execute.mockRejectedValueOnce(new Error('write failed'));
    await expect(appendClinicalNoteAmendment(args,source)).rejects.toThrow('write failed');
    expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
  });
  it.each([null,{is_deleted:1},{provider_signed_at:null}])('rejects missing, deleted and unsigned originals',async note=>{
    const {db,source}=setup(note);
    await expect(appendClinicalNoteAmendment(args,source)).rejects.toHaveProperty('status');
    expect(db.execute).toHaveBeenCalledTimes(1);expect(db.commit).not.toHaveBeenCalled();
  });
});
