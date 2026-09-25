import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import { noteReviewContent, formatNoteEntriesForExport } from '../clinicalReviewDocument.service.js';
import { appendClinicalNoteAmendment } from '../clinicalNoteAmendment.service.js';
describe('mandatory amendment sign-off',()=>{
  it('includes corrections and their attribution in treatment-summary exports',()=>{
    const text=formatNoteEntriesForExport([{entry_kind:'correction',body:'Corrected context',entry_reason:'Original error',created_by_user_id:5,created_at:new Date('2026-09-24T12:00:00Z'),author_signed_at:new Date('2026-09-24T12:00:00Z')}]);
    for(const value of ['Amendment / correction','Corrected context','Reason: Original error','user #5','Author signed: 2026-09-24T12:00:00.000Z'])expect(text).toContain(value);
    expect(formatNoteEntriesForExport([{body:'Legacy',created_by_user_id:5,created_at:'2024-01-01'}])).not.toContain('Author signed:');
  });
  const setup=(note)=>{
    const db={execute:vi.fn().mockResolvedValue([{insertId:7}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
    db.execute.mockResolvedValueOnce([[note]]);
    return {db,source:{getConnection:async()=>db}};
  };
  const args={noteId:4,agencyId:1,body:'Clarifies the original documentation.',actorUserId:5,entryKind:'addendum',reason:'New context became available',authorAttested:true};
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
  it.each(['addendum','correction','late_entry'])('stores %s with a new server-dated author signature',async entryKind=>{
    const {db,source}=setup({provider_signed_at:'2026-09-22',client_id:3});
    await appendClinicalNoteAmendment({...args,entryKind},source);
    const [sql,values]=db.execute.mock.calls[1];
    expect(sql).toContain('author_signed_at');expect(sql).toContain('CURRENT_TIMESTAMP(6)');
    expect(values).toEqual([4,1,3,args.body,5,entryKind,args.reason]);
    expect(db.execute.mock.calls[2][0]).toContain('supervisor_cosigned_at=NULL');
  });
  it.each([{entryKind:undefined},{entryKind:'replace'},{authorAttested:false},{authorAttested:'true'},{reason:' '},{reason:'x'.repeat(2001)},{body:'x'.repeat(20001)},{body:''},{actorUserId:0},{serviceLines:[{procedureCode:'90834',units:1}]}])('rejects invalid or unattested entries before starting a transaction: %j',async overrides=>{
    const {db,source}=setup({provider_signed_at:'2026-09-22'});
    await expect(appendClinicalNoteAmendment({...args,...overrides},source)).rejects.toMatchObject({status:400});
    expect(db.beginTransaction).not.toHaveBeenCalled();expect(db.execute).not.toHaveBeenCalled();
  });
  it('binds review to type, reason and author signature, preserving unclassified historical hashes',()=>{
    const old={id:1,body:'Text',created_at:'2026-09-22'};
    expect(noteReviewContent('Original',[{...old,entry_kind:null,entry_reason:null,author_signed_at:null,created_by_user_id:5}])).toBe(JSON.stringify({note:'Original',addenda:[old]}));
    const entry={...old,entry_kind:'addendum',entry_reason:'New context',author_signed_at:'2026-09-24',created_by_user_id:5};
    const content=noteReviewContent('Original',[entry]);
    for(const change of [{entry_kind:'correction'},{entry_reason:'Corrected error'},{author_signed_at:'2026-09-25'},{created_by_user_id:6}])expect(noteReviewContent('Original',[{...entry,...change}])).not.toBe(content);
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
