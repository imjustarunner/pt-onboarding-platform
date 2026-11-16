import {beforeEach,expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());vi.mock('../../config/database.js',()=>({default:{execute}}));
import Documents from '../ClientPhiDocument.model.js';
beforeEach(()=>{vi.resetAllMocks();execute.mockResolvedValue([[]]);});
it('excludes private medical history from generic ID, client-list and storage lookups',async()=>{
 await Documents.findById(9);await Documents.findByClientId(12);await Documents.findByStoragePath('private/path');
 for(const[sql]of execute.mock.calls)expect(sql).toContain("COALESCE(document_type,'') <> 'private_client_medical_history'");
});
it('lets only an explicit internal private-history lookup include encrypted medical files',async()=>{
 await Documents.findById(9,{includePrivateHistory:true});await Documents.findByClientId(12,{includePrivateHistory:true});
 for(const[sql]of execute.mock.calls)expect(sql).not.toContain("<> 'private_client_medical_history'");
});
