import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access:vi.fn(), read:vi.fn(), save:vi.fn(), importSection:vi.fn(), insurance:vi.fn(), audit:vi.fn() }));
vi.mock('../../services/clientChartImportAccess.service.js', () => ({ requireClientChartImportAccess:m.access }));
vi.mock('../../services/clientChartImport.service.js', () => ({ chartSections:['demographics','intake','plan','insurance','contacts','comments','payer','billingComments'], readChartRecord:m.read, saveChartRecord:m.save, importSupplementaryChartSection:m.importSection }));
vi.mock('../../services/clientInsurance.service.js', () => ({ readClientInsurance:m.insurance }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent:m.audit }));
import { getChartImportDrafts, saveChartImportDraft, importChartSection, getChartSupplementaryRecords } from '../clientChartImport.controller.js';
const req = () => ({ user:{ id:10, role:'support' }, params:{ id:12, section:'comments' }, query:{}, body:{ text:'Patient Comments\nSynthetic comment', revision:0, agencyId:999, userId:999 }, get:()=>'2' });
const res = () => ({ set:vi.fn().mockReturnThis(), json:vi.fn() });
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ clientId:12, agencyId:2 }); m.read.mockResolvedValue({ value:null, revision:0 }); m.save.mockResolvedValue({ revision:1 }); m.importSection.mockResolvedValue({ message:'Synthetic comment' }); m.insurance.mockResolvedValue(null); });
it('loads drafts only for the authenticated user and authorized chart', async () => {
  const response=res(); await getChartImportDrafts(req(),response,vi.fn());
  expect(m.read).toHaveBeenCalledTimes(8);
  expect(m.read).toHaveBeenCalledWith({ clientId:12, agencyId:2 },'comments',10);
  expect(response.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('saves revisioned drafts without accepting caller-selected owners or agencies', async () => {
  const request=req(); request.body.metadata={ sourceDate:'2025-01-02', sourceAuthor:'Source Author', imported:true };
  await saveChartImportDraft(request,res(),vi.fn());
  expect(m.save).toHaveBeenCalledWith({ clientId:12, agencyId:2 }, 'comments',10,{ text:request.body.text, sourceDate:'2025-01-02', sourceAuthor:'Source Author', imported:true, needsReview:false },10,0);
});
it('records the actual actor and section without including patient comments in audit metadata', async () => {
  await importChartSection(req(),res(),vi.fn());
  expect(m.importSection).toHaveBeenCalledWith({ clientId:12, agencyId:2 },'comments','Patient Comments\nSynthetic comment',10,{ position:'primary' });
  expect(m.audit.mock.calls[0][1]).toEqual({ actionType:'client_chart_section_imported', agencyId:2, targetType:'client', targetId:12, metadata:{ section:'comments' } });
});
it.each([getChartImportDrafts,saveChartImportDraft,importChartSection,getChartSupplementaryRecords])('checks access before any private read or write (%#)', async handler => {
  m.access.mockRejectedValue(Object.assign(new Error('Denied'),{ status:403 })); const next=vi.fn();
  await handler(req(),res(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status:403 }));
  expect(m.read).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled(); expect(m.insurance).not.toHaveBeenCalled(); expect(m.importSection).not.toHaveBeenCalled();
});
it('rejects oversized drafts and invalid revisions', async () => {
  for (const body of [{ text:'x'.repeat(200001), revision:0 }, { text:'text', revision:-1 }, { text:'text' }]) {
    const request=req(); request.body=body; const next=vi.fn(); await saveChartImportDraft(request,res(),next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status:400 }));
  }
  expect(m.save).not.toHaveBeenCalled();
});
