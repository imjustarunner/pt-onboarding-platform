import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Workspace from '../admin/ClinicalNoteGeneratorView.vue';
import api from '../../services/api';
import { clearAllWorkQueues, loadWorkQueue } from '../../utils/noteAidWorkQueue.js';
import { buildLeftLibraryRows } from '../../utils/noteAidDocumentationStatus.js';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 501, role: 'provider' } }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 7, name: 'Synthetic tenant' }, userAgencies: [{ id: 7, name: 'Synthetic tenant' }], agencies: [] }) }));
vi.mock('../../utils/noteAidIndirectSession.js', () => ({ ensureHourlySessionForNoteAid: vi.fn(async () => ({ fromIndirectSession: false })) }));
vi.mock('../../utils/privateSpeechRecognition.js', () => ({ privateSpeechRecognition: () => null }));

const queued = { id: 'import_one', clientKey: 'import_one', serverId: 1, clientName: 'Synthetic Client', agencyId: 7, date: '2026-10-14', serviceCode: '90837', status: 'not_started', docStatus: 'not_started' };
let serverItems;
let drafts;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
  clearAllWorkQueues(501);
  serverItems = [queued];
  drafts = [];
  api.get.mockImplementation(async (url) => {
    if (url === '/clinical-notes/work-queue') return { data: { items: serverItems.map((i) => ({ ...i })) } };
    if (url === '/clinical-notes/recent') return { data: { drafts, signedSessions: [] } };
    if (url === '/me/notes-to-sign/count') return { data: { isSupervisor: true } };
    if (url === '/me/notes-to-sign') return { data: { isSupervisor: true, notes: [] } };
    if (url === '/medical-billing/notes/77') return { data: { note: { id: 77, agencyId: 7, status: 'SIGNED', noteType: 'PROGRESS_NOTE', sections: { Subjective: 'Synthetic note' } } } };
    return { data: [] };
  });
  api.put.mockImplementation(async (url, body) => {
    if (url === '/clinical-notes/work-queue') {
      serverItems = body.items.map((i) => ({ ...i }));
      return { data: { items: serverItems } };
    }
    return { data: {} };
  });
  api.post.mockImplementation(async (url, body) => {
    if (url === '/clinical-notes/drafts') {
      const draft = { id: 22, agency_id: 7, date_of_service: body.dateOfService, service_code: body.serviceCode, initials: body.initials, created_at: '2026-10-14T10:00:00Z' };
      drafts = [draft];
      return { data: { draft } };
    }
    return { data: {} };
  });
});

async function workspace(query) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:organizationSlug/note-aid', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
  ] });
  await router.push({ path: '/clinic/note-aid', query });
  const wrapper = shallowMount(Workspace, { global: { plugins: [router], stubs: { RouterLink: false, ClinicalWorkspaceFrame: { template: '<div><slot /></div>' } } } });
  await flushPromises();
  await flushPromises();
  return { wrapper, router, state: wrapper.vm.$.setupState };
}

describe('Note Workspace queue deep links', () => {
  it('opens the selected ToDo, persists Started, and includes it in the In progress library', async () => {
    const { wrapper, state } = await workspace({ workQueueId: 'import_one', agencyId: '7', launchIntent: 'work_queue' });
    expect(state.activeWorkQueueItemId).toBe('import_one');
    expect(state.sidebarTab).toBe('started');
    expect(state.draftId).toBe(22);
    expect(loadWorkQueue(501)[0]).toMatchObject({ status: 'started', docStatus: 'started', draftId: 22 });
    expect(serverItems[0]).toMatchObject({ status: 'started', draftId: 22 });
    expect(buildLeftLibraryRows({ drafts, workQueueItems: loadWorkQueue(501) })).toEqual(expect.arrayContaining([
      expect.objectContaining({ docStatus: 'started', draftId: 22, workQueueId: 'import_one' })
    ]));
    expect(wrapper.text()).toContain('Note Workspace');
    expect(wrapper.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual(expect.arrayContaining([
      ['My Dashboard', '/clinic/dashboard'], ['Tasks', '/clinic/tasks']
    ]));
    wrapper.unmount();
  });

  it('reads the noteId used by Tasks co-sign links and opens the signed chart note', async () => {
    const { wrapper, router, state } = await workspace({ noteId: '77', agencyId: '7', launchIntent: 'cosign' });
    expect(state.signedNoteViewerId).toBe(77);
    expect(api.get).toHaveBeenCalledWith('/medical-billing/notes/77', expect.objectContaining({ params: { agencyId: 7 } }));
    expect(api.post.mock.calls.some(([url]) => url === '/clinical-notes/drafts')).toBe(false);
    expect(loadWorkQueue(501)[0].status).toBe('not_started');
    state.startNewNote();
    await flushPromises();
    expect(router.currentRoute.value.query.noteId).toBeUndefined();
    expect(state.signedNoteViewerId).toBeNull();
    expect(api.get.mock.calls.filter(([url]) => url === '/medical-billing/notes/77')).toHaveLength(1);
    wrapper.unmount();
  });

  it('reopens a linked draft without creating a duplicate', async () => {
    serverItems = [{ ...queued, draftId: 22, status: 'started', docStatus: 'started' }];
    drafts = [{ id: 22, agency_id: 7, date_of_service: '2026-10-14', service_code: '90837', initials: 'SYNCLI', input_text: 'Saved draft text' }];
    const { wrapper, state } = await workspace({ workQueueId: 'import_one', launchIntent: 'work_queue' });
    expect(state.activeWorkQueueItemId).toBe('import_one');
    expect(state.draftId).toBe(22);
    expect(state.inputText).toBe('Saved draft text');
    expect(api.post.mock.calls.some(([url]) => url === '/clinical-notes/drafts')).toBe(false);
    wrapper.unmount();
  });

  it('does not start a different note when a stale queue link is opened', async () => {
    const { wrapper, state } = await workspace({ workQueueId: 'removed_item', launchIntent: 'work_queue' });
    expect(state.activeWorkQueueItemId).toBeNull();
    expect(state.approvalError).toContain('no longer available');
    expect(api.post.mock.calls.some(([url]) => url === '/clinical-notes/drafts')).toBe(false);
    expect(serverItems[0].status).toBe('not_started');
    wrapper.unmount();
  });
});

describe('screening sign-and-next queue navigation',()=>{
 const current={id:'screening_12',clientKey:'screening_12',serverId:12,agencyId:7,clinicalSessionId:12,noteKind:'h0002_screening',status:'started',docStatus:'started'};
 const next={...current,id:'screening_13',clientKey:'screening_13',serverId:13,clinicalSessionId:13};
 it('refreshes the queue and opens the next screening, excluding a stale copy of the signed item',async()=>{
  serverItems=[current,next];const {wrapper,state,router}=await workspace({workQueueId:current.id,agencyId:'7'});
  expect(state.activeScreeningReview.clinicalSessionId).toBe(12);expect(state.nextAfterScreening.clinicalSessionId).toBe(13);
  await state.onScreeningReviewSigned({}, {openNext:true});await flushPromises();
  expect(state.activeScreeningReview.clinicalSessionId).toBe(13);expect(state.activeWorkQueueItemId).toBe(next.id);expect(router.currentRoute.value.query.workQueueId).toBeUndefined();wrapper.unmount();
 });
 it('finishes cleanly if the refreshed queue no longer has another item',async()=>{
  serverItems=[current,next];const {wrapper,state}=await workspace({workQueueId:current.id,agencyId:'7'});serverItems=[];
  await state.onScreeningReviewSigned({}, {openNext:true});await flushPromises();expect(state.activeScreeningReview).toBeNull();expect(state.approvalMessage).toContain('No unfinished items');wrapper.unmount();
 });
 it('reports refresh failure without reopening or resigning the completed screening',async()=>{
  serverItems=[current,next];const {wrapper,state}=await workspace({workQueueId:current.id,agencyId:'7'});const original=api.get.getMockImplementation();api.get.mockImplementation((url,...args)=>url==='/clinical-notes/work-queue'?Promise.reject(new Error('offline')):original(url,...args));
  await state.onScreeningReviewSigned({}, {openNext:true});await flushPromises();expect(state.activeScreeningReview).toBeNull();expect(state.approvalError).toContain('screening was signed');expect(api.post.mock.calls.some(([url])=>url.endsWith('/sign'))).toBe(false);wrapper.unmount();
 });
});
