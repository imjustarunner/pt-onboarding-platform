import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import TasksHub from '../TasksHub.vue';
import NoteAidWorkQueuePanel from '../../clinical/NoteAidWorkQueuePanel.vue';
import api from '../../../services/api';
import { clearAllWorkQueues, saveWorkQueue } from '../../../utils/noteAidWorkQueue.js';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 501, role: 'provider' } },
  agency: { currentAgency: { id: 7, name: 'Synthetic tenant', organization_type: 'agency' }, userAgencies: [] },
  tasks: { tasks: [], taskCounts: {}, fetchTasks: vi.fn(), fetchTaskCounts: vi.fn() }
}));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('../../../store/tasks', () => ({ useTasksStore: () => mocks.tasks }));

const queued = { id: 'import_one', clientKey: 'import_one', serverId: 1, clientName: 'Synthetic Client', agencyId: 7, date: '2026-10-14', serviceCode: '90837', status: 'not_started', docStatus: 'not_started' };
const started = { ...queued, id: 'import_two', clientKey: 'import_two', serverId: 2, clientName: 'Second Synthetic Client', status: 'started', docStatus: 'started', draftId: 22 };
let serverItems;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearAllWorkQueues(501);
  serverItems = [queued, started];
  mocks.tasks.tasks = [{ id: 88, title: 'Different legacy task', task_type: 'session_note', status: 'pending' }];
  api.get.mockImplementation(async (url) => {
    if (url === '/clinical-notes/work-queue') return { data: { items: serverItems } };
    if (url === '/me/notes-to-sign') return { data: { isSupervisor: true, notes: [{ id: 3, clinical_note_id: 77, agency_id: 7, client_name: 'Synthetic Co-sign Client', provider_first_name: 'Test', provider_last_name: 'Provider' }] } };
    return { data: [] };
  });
  api.post.mockResolvedValue({ data: {} });
});

async function hub(props = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:organizationSlug/tasks', component: { template: '<div />' } },
    { path: '/:organizationSlug/note-aid', component: { template: '<div />' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
  ] });
  await router.push('/clinic/tasks');
  const wrapper = shallowMount(TasksHub, {
    props: { hideTimeline: true, ...props },
    global: { plugins: [router], stubs: { NoteAidWorkQueuePanel: false, RouterLink: false } }
  });
  await flushPromises();
  return { wrapper, router, state: wrapper.vm.$.setupState };
}

describe('Tasks and Note Workspace share the ToDo Queue', () => {
  it('shows shared work items in the right rail without task-interface note filters', async () => {
    const { wrapper, state } = await hub();
    state.notesTodoOpen = true;
    await flushPromises();
    let panels = wrapper.findAllComponents(NoteAidWorkQueuePanel);
    expect(panels).toHaveLength(1);
    expect(wrapper.find('[data-tour=notes-scope]').exists()).toBe(false);
    for (const panel of panels) {
      expect(panel.findAll('.na-wq-item')).toHaveLength(2);
      expect(panel.get('.na-wq-chip--pending').text()).toBe('1 Not started');
      expect(panel.get('.na-wq-chip--started').text()).toBe('1 In progress');
      expect(panel.text()).not.toContain('Different legacy task');
    }
    saveWorkQueue(501, [{ ...queued, status: 'started', docStatus: 'started' }, { ...started, status: 'signed', docStatus: 'signed' }]);
    await flushPromises();
    for (const panel of panels) {
      expect(panel.findAll('.na-wq-item')).toHaveLength(1);
      expect(panel.get('.na-wq-chip--pending').text()).toBe('0 Not started');
      expect(panel.get('.na-wq-chip--started').text()).toBe('1 In progress');
    }
    await panels[0].find('select').setValue('client');
    expect(panels[0].find('select').element.value).toBe('client');
    expect(wrapper.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual(expect.arrayContaining([
      ['My Dashboard', '/clinic/dashboard'], ['Note Workspace', '/clinic/note-aid']
    ]));
    wrapper.unmount();
  });

  it('opens the exact selected queue item from Work', async () => {
    const { wrapper, state, router } = await hub();
    state.notesTodoOpen = true;
    await flushPromises();
    await wrapper.findAll('.na-wq-item-btn').find((b) => b.text().includes('Second Synthetic Client')).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/clinic/note-aid');
    expect(router.currentRoute.value.query).toMatchObject({ workQueueId: 'import_two', agencyId: '7', launchIntent: 'work_queue' });
    expect(api.post.mock.calls.some(([url]) => url === '/clinical-notes/work-queue')).toBe(false);
    wrapper.unmount();
  });

  it('uses the workspace co-sign presentation and links to the clinical note', async () => {
    const { wrapper, state, router } = await hub();
    state.notesTodoOpen = true;
    state.noteQueueMode = 'cosign';
    await flushPromises();
    expect(wrapper.text()).toContain('Synthetic Co-sign Client');
    await wrapper.find('.na-wq-item-btn').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ noteId: '77', agencyId: '7', launchIntent: 'cosign' });
    wrapper.unmount();
  });

  it('reuses the existing task note without replacing its draft or adding it again', async () => {
    serverItems = [{ ...started, taskId: 88 }];
    const { wrapper, state, router } = await hub();
    await state.openNotesTasksInNoteAid(mocks.tasks.tasks);
    await flushPromises();
    expect(router.currentRoute.value.query.workQueueId).toBe('import_two');
    expect(state.workQueueItems[0]).toMatchObject({ status: 'started', draftId: 22 });
    expect(api.post.mock.calls.some(([url]) => url === '/clinical-notes/work-queue')).toBe(false);
    wrapper.unmount();
  });

  it('does not present the signed-in user’s queue as another staff member’s queue', async () => {
    const { wrapper } = await hub({ embedded: true, focusUserId: 999 });
    expect(api.get.mock.calls.some(([url]) => url === '/clinical-notes/work-queue')).toBe(false);
    expect(wrapper.find('.notes-scope-pills').exists()).toBe(false);
    wrapper.unmount();
  });

  it('matches a task to an imported session even after that session has a draft', async () => {
    serverItems = [{ ...started, officeEventId: 42 }];
    mocks.tasks.tasks[0].metadata = { officeEventId: 42 };
    const { wrapper, state, router } = await hub();
    await state.openNotesTasksInNoteAid(mocks.tasks.tasks);
    expect(router.currentRoute.value.query.workQueueId).toBe('import_two');
    expect(api.post.mock.calls.some(([url]) => url === '/clinical-notes/work-queue')).toBe(false);
    wrapper.unmount();
  });
});
