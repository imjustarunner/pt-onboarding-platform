import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../referralUpload.controller.js', import.meta.url), 'utf8');
const handlerBody = source.slice(source.indexOf('export const getReferralPacketForProcessing =')).replace('export const ', 'const ');
function setup(change = {}) {
  const draft = { id: 20, agency_id: 450, organization_id: 451, phi_document_id: 30, uploaded_by_user_id: 40, created_client_id: 55, status: 'submitted', ...change.draft };
  const deps = {
    ReferralPacketDraft: { findById: vi.fn(async () => draft) },
    authorizeReferralPacket: vi.fn(async () => { if (change.denied) throw Object.assign(new Error('denied'), { status: 403 }); }),
    Agency: { findById: vi.fn(async () => ({ slug: 'qa-school', name: 'QA school' })) },
    ClientPhiDocument: { findSchoolPaperPacketsForClient:vi.fn(async()=>[{id:30,client_id:55,agency_id:450}]), findById: vi.fn(async () => ({ id: 30, agency_id: 450, client_id: 55, scan_status: 'clean', ...change.doc })) },
    Client: { findById: vi.fn(async () => ({ id: 55, agency_id: 450, organization_id: 451, onboarding_docs_json: JSON.stringify({ paperPacketSource: { documentId: change.current || 30 } }), ...change.client })) }
  };
  const handler = new Function(...Object.keys(deps), handlerBody + '; return getReferralPacketForProcessing;')(...Object.values(deps));
  const res = { json: vi.fn(), status: vi.fn(function () { return this; }) }, next = vi.fn();
  return { deps, res, next, run: () => handler({ params: { draftId: '20' }, user: { id: 7, role: 'support' } }, res, next) };
}
it('authorizes the saved draft before reading any client or document', async () => {
  const t = setup({ denied: true }); await t.run();
  expect(t.next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(t.deps.ClientPhiDocument.findById).not.toHaveBeenCalled();
});
it('opens the exact saved draft without choosing a different latest upload', async () => {
  const t = setup({ draft: { created_client_id: null, status: 'draft' }, doc: { client_id: null } }); await t.run();
  expect(t.res.json).toHaveBeenCalledWith({ draft: expect.objectContaining({ id: 20, phiDocumentId: 30, clientId: null, organizationSlug: 'qa-school' }) });
});
it('opens a processor only for the same attached source, child and agency', async () => {
  const t = setup(); await t.run(); expect(t.res.json).toHaveBeenCalledWith({ draft: expect.objectContaining({ clientId: 55, phiDocumentId: 30 }) });
});
it.each([{ current: 31 }, { doc: { agency_id: 2 } }, { doc: { client_id: 56 } }, { client: { organization_id: 452 } }, { draft: { status: 'submitting' } }])('refuses a replaced or mismatched source %o', async change => {
  const t = setup(change); await t.run(); expect(t.res.status).toHaveBeenCalledWith(409);
});

it('opens a legacy matched source using the saved draft and document linkage without inventing a source',async()=>{
 const t=setup({client:{onboarding_docs_json:null}});await t.run();
 expect(t.res.json).toHaveBeenCalledWith({draft:expect.objectContaining({clientId:55,phiDocumentId:30})});
});

it('does not turn a historical source task into the current replacement when a legacy client lacks source metadata',async()=>{
 const t=setup({client:{onboarding_docs_json:null}});t.deps.ClientPhiDocument.findSchoolPaperPacketsForClient.mockResolvedValue([{id:31,client_id:55,agency_id:450},{id:30,client_id:55,agency_id:450}]);
 await t.run();expect(t.res.status).toHaveBeenCalledWith(409);
});
