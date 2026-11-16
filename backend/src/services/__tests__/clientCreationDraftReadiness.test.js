import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {requireClientCreationDraftSchema} from '../clientCreationDraftReadiness.service.js';
it('blocks readiness until the encrypted draft schema is present without reading any records',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[]])};await requireClientCreationDraftSchema(db);expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('LIMIT 0'));db.execute.mockRejectedValue(Error('Missing draft table'));await expect(requireClientCreationDraftSchema(db)).rejects.toThrow('Missing draft table');
});
