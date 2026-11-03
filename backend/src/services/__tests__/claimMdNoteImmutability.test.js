import { beforeEach,describe,it,expect,vi } from 'vitest';
const {execute,locked,begin,commit,rollback,release}=vi.hoisted(()=>({execute:vi.fn(),locked:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute,getConnection:async()=>({execute:locked,beginTransaction:begin,commit,rollback,release})}}));
import ClinicalNote from '../../models/clinical/ClinicalNote.model.js';
beforeEach(()=>vi.clearAllMocks());
describe('signed content survives metadata and correction workflows',()=>{
  it('rejects the former separate-copy amendment path before writing',async()=>{
    await expect(ClinicalNote.create({metadataJson:{amendmentOfNoteId:4}})).rejects.toMatchObject({status:409});
    await expect(ClinicalNote.updatePayload({noteId:6,notePayload:'Copy',metadataJson:{amendmentOfNoteId:4}})).rejects.toMatchObject({status:409});
    expect(execute).not.toHaveBeenCalled();
  });
  it('does not erase note content when attaching metadata such as a print-upload reference',async()=>{
    const original={id:4,note_payload:'Original signed content',provider_signed_at:'2026-11-03',metadata_json:{clinicalValue:'preserve',supervisorQueue:{status:'signed'}}};
    locked.mockResolvedValueOnce([[original]]).mockResolvedValueOnce([{affectedRows:1}]);
    execute.mockResolvedValueOnce([[original]]);
    expect(await ClinicalNote.updatePayload({noteId:4,metadataJson:{printUpload:{phiDocumentId:9}}})).toMatchObject({note_payload:'Original signed content'});
    expect(locked.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(locked.mock.calls[1][0]).not.toContain('note_payload =');
    expect(JSON.parse(locked.mock.calls[1][1][0])).toEqual({...original.metadata_json,printUpload:{phiDocumentId:9}});
    expect(commit).toHaveBeenCalled();expect(release).toHaveBeenCalled();
  });
  it('rejects clinical metadata changes before touching the signed original and rolls back',async()=>{
    locked.mockResolvedValueOnce([[{id:4,provider_signed_at:'2026-11-03',metadata_json:{serviceCode:'90834'}}]]);
    await expect(ClinicalNote.updatePayload({noteId:4,metadataJson:{serviceCode:'90837',printUpload:{phiDocumentId:9}}})).rejects.toMatchObject({status:409});
    expect(locked).toHaveBeenCalledTimes(1);expect(rollback).toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
  });
  it('guards signed narrative/title against a racing editor',async()=>{
    execute.mockResolvedValue([{affectedRows:0}]);await expect(ClinicalNote.updatePayload({noteId:4,notePayload:'Replacement'})).rejects.toMatchObject({status:409});expect(execute.mock.calls[0][0]).toContain('AND provider_signed_at IS NULL');
  });
});
