import { beforeEach,describe,it,expect,vi } from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute}}));
import ClinicalNote from '../../models/clinical/ClinicalNote.model.js';
beforeEach(()=>vi.clearAllMocks());
describe('signed content survives metadata and correction workflows',()=>{
  it('does not erase note content when attaching metadata such as a print-upload reference',async()=>{
    execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:4,note_payload:'Original signed content'}]]);
    expect(await ClinicalNote.updatePayload({noteId:4,metadataJson:{printUpload:{phiDocumentId:9}}})).toMatchObject({note_payload:'Original signed content'});
    expect(execute.mock.calls[0][0]).not.toContain('note_payload =');
  });
  it('guards signed narrative/title against a racing editor',async()=>{
    execute.mockResolvedValue([{affectedRows:0}]);await expect(ClinicalNote.updatePayload({noteId:4,notePayload:'Replacement'})).rejects.toMatchObject({status:409});expect(execute.mock.calls[0][0]).toContain('AND provider_signed_at IS NULL');
  });
});
