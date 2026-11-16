import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get:vi.fn(), put:vi.fn() }));
vi.mock('../../services/api', () => ({ default:m }));
import { useChartImportDrafts } from '../useChartImportDrafts.js';
beforeEach(() => { vi.resetAllMocks(); m.get.mockResolvedValue({ data:{ drafts:{} } }); m.put.mockResolvedValue({ data:{ revision:1 } }); });
function deferred() { let resolve; const promise=new Promise(done=>{resolve=done;}); return {promise,resolve}; }
it('serializes edits to a section and uses the returned revision for the next save', async () => {
  const drafts=useChartImportDrafts(); await drafts.load(12,2);
  const first=deferred(); m.put.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ data:{ revision:2 } });
  drafts.schedule('comments',{ text:'First private draft' }); const saving=drafts.flush('comments');
  drafts.schedule('comments',{ text:'Latest private draft' });
  first.resolve({ data:{ revision:1 } }); await saving;
  expect(m.put.mock.calls.map(([url,body])=>[url,body.text,body.revision])).toEqual([
    ['/clients/12/chart-import/drafts/comments','First private draft',0], ['/clients/12/chart-import/drafts/comments','Latest private draft',1]
  ]);
  expect(drafts.state.sections.comments.message).toBe('Draft saved'); drafts.detach();
});
it('keeps saves bound to their original chart while switching client and agency', async () => {
  const drafts=useChartImportDrafts(); await drafts.load(12,2);
  const old=deferred(); m.put.mockReturnValueOnce(old.promise);
  drafts.schedule('insurance',{ text:'Previous chart' }); const saving=drafts.flush();
  await drafts.load(13,3); drafts.schedule('insurance',{ text:'Current chart' }); await drafts.flush();
  old.resolve({ data:{ revision:1 } }); await saving;
  expect(m.put.mock.calls.map(([url,,config])=>[url,config.headers['X-Agency-Id']])).toEqual([
    ['/clients/12/chart-import/drafts/insurance','2'], ['/clients/13/chart-import/drafts/insurance','3']
  ]); drafts.detach();
});
it('retains the latest text after a conflict and reports that it has not been saved', async () => {
  const drafts=useChartImportDrafts(); await drafts.load(12,2);
  m.put.mockRejectedValue({ response:{ status:409, data:{ error:{ message:'Changed in another window' } } } });
  drafts.schedule('contacts',{ text:'Preserve this paste' }); await drafts.flush();
  expect(drafts.state.sections.contacts.error).toBe('Changed in another window');
  expect(drafts.state.sections.contacts.pending.text).toBe('Preserve this paste');
  expect(drafts.state.sections.contacts.message).toBe('Draft not saved'); drafts.detach();
});
it('lets the user explicitly save their paste as the latest draft after a conflict',async()=>{
 const drafts=useChartImportDrafts();await drafts.load(12,2);m.put.mockRejectedValueOnce({response:{status:409}});drafts.schedule('comments',{text:'Keep my edited paste'});await drafts.flush();
 m.get.mockResolvedValue({data:{drafts:{comments:{revision:7,value:{text:'Another window'}}}}});m.put.mockResolvedValue({data:{revision:8}});await drafts.retry('comments');
 expect(m.put).toHaveBeenLastCalledWith('/clients/12/chart-import/drafts/comments',expect.objectContaining({text:'Keep my edited paste',revision:7}),expect.anything());expect(drafts.state.sections.comments.error).toBe('');drafts.detach();
});
it('does not rewrite an unchanged restored draft or cause needless version conflicts',async()=>{
 m.get.mockResolvedValue({data:{drafts:{comments:{revision:4,value:{text:'Saved note',imported:true}}}}});const drafts=useChartImportDrafts();await drafts.load(12,2);
 drafts.schedule('comments',{text:'Saved note',metadata:{imported:true}});await drafts.flush();expect(m.put).not.toHaveBeenCalled();drafts.detach();
});
