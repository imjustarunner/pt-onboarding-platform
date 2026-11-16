import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));vi.mock('../../services/api',()=>({default:m}));
import { useClientCreationDrafts } from '../useClientCreationDrafts';
beforeEach(()=>{vi.resetAllMocks();m.get.mockResolvedValue({data:{revision:0,value:null}});m.put.mockResolvedValue({data:{revision:1}});});
it('persists PHI only to the agency-scoped server draft and flushes before closing',async()=>{
 const drafts=useClientCreationDrafts();await drafts.load(2);drafts.schedule({form:{demographics:'Synthetic private demographics'}});expect(await drafts.flush()).toBe(true);
 expect(m.put).toHaveBeenCalledWith('/clients/creation-draft',{value:{form:{demographics:'Synthetic private demographics'}},revision:0},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));expect(drafts.state.message).toBe('Private draft saved');drafts.dispose();
});
it('keeps failed drafts pending and blocks leaving until saved',async()=>{
 const drafts=useClientCreationDrafts();await drafts.load(2);m.put.mockRejectedValueOnce(Error('offline'));drafts.schedule({form:{fullName:'Synthetic'}});expect(await drafts.flush()).toBe(false);expect(drafts.state.error).toContain('Keep this window open');expect(await drafts.flush()).toBe(true);drafts.dispose();
});
it('does not overwrite a stored draft when loading failed',async()=>{
 m.get.mockRejectedValue(Error('offline'));const drafts=useClientCreationDrafts();await drafts.load(2);drafts.schedule({form:{fullName:'Do not overwrite'}});expect(await drafts.flush()).toBe(false);expect(m.put).not.toHaveBeenCalled();drafts.dispose();
});
