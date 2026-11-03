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
  it('rejects legacy inline correction before opening a transaction or changing original signatures',async()=>{
    const source={getConnection:vi.fn()};
    await expect(appendClinicalNoteAmendment({entryKind:'correction',authorAttested:true},source)).rejects.toMatchObject({status:409});
    await expect(appendClinicalNoteAmendment({entryKind:'addendum',serviceLines:[{procedureCode:'90834',units:1}]},source)).rejects.toMatchObject({status:409});
    expect(source.getConnection).not.toHaveBeenCalled();
  });
  it('binds review to type, reason and author signature, preserving unclassified historical hashes',()=>{
    const old={id:1,body:'Text',created_at:'2026-09-22'};
    expect(noteReviewContent('Original',[{...old,entry_kind:null,entry_reason:null,author_signed_at:null,created_by_user_id:5}])).toBe(JSON.stringify({note:'Original',addenda:[old]}));
    const entry={...old,entry_kind:'addendum',entry_reason:'New context',author_signed_at:'2026-09-24',created_by_user_id:5};
    const content=noteReviewContent('Original',[entry]);
    for(const change of [{entry_kind:'correction'},{entry_reason:'Corrected error'},{author_signed_at:'2026-09-25'},{created_by_user_id:6}])expect(noteReviewContent('Original',[{...entry,...change}])).not.toBe(content);
  });
});
