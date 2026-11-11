import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import axios from 'axios';
import QuickView from '../../../views/QuickViewAccessView.vue';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: vi.fn(() => ({ href: '/quick-view/email-compose' })) }),
  useRoute: () => ({ name: 'QuickViewApp', params: {}, query: {}, meta: { quickViewSessionOnly: true } })
}));

let wrapper;

const buttonName = (button) => button.attributes('aria-label') || button.text().trim();
const navigation = () => wrapper.get('[aria-label="Primary navigation"]');
const navButton = (name) => navigation().findAll('button').find((button) => buttonName(button) === name);
const moreTools = () => wrapper.find('#qv-more-tools');
const expectMoreClosed = () => {
  expect(navButton('More').attributes('aria-expanded')).toBe('false');
  expect(!moreTools().exists() || !moreTools().isVisible()).toBe(true);
};

beforeEach(async () => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  axios.post.mockResolvedValue({ data: { userId: 5, agencyId: 2, expiresAt: '2099-01-01T00:00:00Z' } });
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith('/tenant')) return { data: { agencyName: 'Mountain Practice', agencyId: 2 } };
    if (url.endsWith('/home')) return {
      data: {
        mailboxEmail: 'staff@example.org',
        conversations: [{ id: 10, channel: 'email', subject: 'Schedule check-in', last_message_preview: 'Can we confirm tomorrow?' }]
      }
    };
    if (url.endsWith('/calendar/day')) return { data: { items: [] } };
    if (url.endsWith('/tasks')) return { data: { tasks: [{ id: 20, title: 'Review scheduling request' }] } };
    if (url.endsWith('/directory')) return { data: { providers: [], schoolStaff: [] } };
    if (url.endsWith('/note-aid/tools')) return { data: { tools: [] } };
    if (url.endsWith('/conversations/10')) return { data: { conversation: { id: 10, channel: 'email', subject: 'Schedule check-in' }, messages: [] } };
    return { data: {} };
  });
  wrapper = shallowMount(QuickView, { attachTo: document.body });
  await flushPromises();
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('Quick View mobile navigation', () => {
  it('loads the selected daily workflow and exposes its current destination', async () => {
    await navButton('Today').trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/calendar/day', expect.objectContaining({
      withCredentials: true,
      params: expect.objectContaining({ day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), timeZone: expect.any(String) })
    }));
    expect(navButton('Today').attributes('aria-current')).toBe('page');
    expect(navButton('Messages').attributes('aria-current')).toBeUndefined();

    await navButton('Tasks').trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/tasks', expect.objectContaining({ withCredentials: true, params: { view: 'assigned' } }));
    expect(wrapper.text()).toContain('Review scheduling request');
    expect(navButton('Tasks').attributes('aria-current')).toBe('page');
    expect(navButton('Today').attributes('aria-current')).toBeUndefined();
  });

  it('opens accessible secondary tools and closes them after loading Contacts', async () => {
    expectMoreClosed();
    expect(navButton('More').attributes('aria-controls')).toBe('qv-more-tools');

    await navButton('More').trigger('click');
    expect(navButton('More').attributes('aria-expanded')).toBe('true');
    expect(navButton('More').attributes('aria-current')).toBe('page');
    expect(moreTools().attributes('aria-label')).toBe('More tools');

    const contacts = moreTools().findAll('button').find((button) => buttonName(button) === 'Contacts');
    await contacts.trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/directory', expect.objectContaining({ withCredentials: true }));
    expectMoreClosed();
    expect(navButton('More').attributes('aria-current')).toBe('page');
    expect(navButton('Messages').attributes('aria-current')).toBeUndefined();
    expect(document.activeElement).toBe(wrapper.get('#qv-workspace').element);
  });

  it('keeps Note Workspace and Presence reachable without adding primary tabs', async () => {
    await navButton('More').trigger('click');
    await moreTools().findAll('button').find((button) => buttonName(button) === 'Note Workspace').trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/note-aid/tools', expect.objectContaining({ withCredentials: true, params: { agencyId: 2 } }));
    expectMoreClosed();
    expect(navButton('More').attributes('aria-current')).toBe('page');

    await navButton('More').trigger('click');
    await moreTools().findAll('button').find((button) => buttonName(button) === 'Presence').trigger('click');
    await flushPromises();

    expect(wrapper.findComponent({ name: 'QuickViewPresence' }).exists()).toBe(true);
    expectMoreClosed();
    expect(navButton('More').attributes('aria-current')).toBe('page');
    expect(navigation().findAll('button')).toHaveLength(4);
  });

  it('dismisses More with Escape and returns keyboard focus to its button', async () => {
    await navButton('More').trigger('click');
    const contacts = moreTools().findAll('button').find((button) => buttonName(button) === 'Contacts');
    contacts.element.focus();
    await contacts.trigger('keydown', { key: 'Escape' });

    expectMoreClosed();
    expect(document.activeElement).toBe(navButton('More').element);
  });

  it('removes the open tools and private inbox immediately when the workspace locks', async () => {
    await navButton('More').trigger('click');
    await wrapper.get('[aria-label="Lock Quick View"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[aria-label="Primary navigation"]').exists()).toBe(false);
    expect(moreTools().exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Schedule check-in');
    expect(wrapper.find('.qv-gate').exists()).toBe(true);
    expect(axios.post).toHaveBeenCalledWith('/api/quick-view/session/logout', {}, expect.objectContaining({ withCredentials: true }));
  });

  it('clears task and event details plus note drafts so another session cannot reopen them', async () => {
    const state = wrapper.vm.$.setupState;
    state.tab = 'noteaid';
    state.noteAidInput = 'Private session draft';
    state.noteAidOutput = 'Private generated note';
    state.noteAidInitials = 'P.R.';
    state.noteAidSections = [{ id: 'session', title: 'Session', text: 'Private session excerpt' }];
    state.noteAidDrawer = [{ id: 'draft', initials: 'P.R.', dos: '2026-11-03', toolName: 'Progress note', output: 'Private saved draft' }];
    state.taskDetail = { task: { id: 20, title: 'Private follow-up task', description: 'Confidential follow-up' }, comments: [] };
    state.calEvent = { title: 'Private appointment', kind: 'TEAM_MEETING', startAt: '2026-11-03T16:00:00Z', endAt: '2026-11-03T17:00:00Z' };
    state.newTaskTitle = 'Unsubmitted private task';
    state.newContactName = 'Private contact';
    state.newContactEmail = 'private@example.org';
    await flushPromises();

    expect(wrapper.get('[aria-label="Task details"]').text()).toContain('Private follow-up task');
    expect(wrapper.get('[aria-label="Event details"]').text()).toContain('Private appointment');
    expect(wrapper.get('textarea[placeholder="Type or paste session notes…"]').element.value).toBe('Private session draft');

    await wrapper.get('[aria-label="Lock Quick View"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('Private');
    expect(state.newTaskTitle).toBe('');
    expect(state.newContactName).toBe('');
    expect(state.newContactEmail).toBe('');

    state.session = 'another-session';
    state.tab = 'noteaid';
    await flushPromises();

    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0);
    expect(wrapper.get('textarea[placeholder="Type or paste session notes…"]').element.value).toBe('');
    expect(wrapper.get('#qv-na-initials').element.value).toBe('');
    expect(wrapper.text()).not.toContain('Private');
    expect(state.noteAidOutput).toBe('');
    expect(state.noteAidSections).toEqual([]);
    expect(state.noteAidDrawer).toEqual([]);
  });

  it('retries a failed SMS inbox without changing back to email', async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { error: { message: 'Text conversations are temporarily unavailable.' } } } });
    await wrapper.findAll('.qv-suite button').find((button) => button.text() === 'SMS').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Text conversations are temporarily unavailable.');

    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenLastCalledWith('/api/quick-view/home', expect.objectContaining({
      params: { channel: 'sms', filter: 'all' }, withCredentials: true
    }));
    expect(wrapper.vm.$.setupState.msgSuite).toBe('sms');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('retries the selected office view and office filter without loading the personal calendar', async () => {
    const state = wrapper.vm.$.setupState;
    state.tab = 'calendar';
    state.showOffice = true;
    state.officeFilterId = 4;
    state.error = 'Office bookings could not be loaded.';
    await flushPromises();
    axios.get.mockClear();

    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/office', expect.objectContaining({
      params: { day: state.day, officeId: 4 }, withCredentials: true
    }));
    expect(state.showOffice).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Who’s in today');
  });

  it('keeps Tasks selected when loading assignee options and opening a task', async () => {
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, config) => url.endsWith('/tasks/20')
      ? Promise.resolve({ data: { task: { id: 20, title: 'Review scheduling request' }, comments: [] } })
      : get(url, config));
    await navButton('Tasks').trigger('click');
    await flushPromises();
    await wrapper.findAll('.qv-row').find((row) => row.text().includes('Review scheduling request')).trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/directory', expect.objectContaining({ withCredentials: true }));
    expect(wrapper.get('[aria-label="Task details"]').text()).toContain('Review scheduling request');
    expect(navButton('Tasks').attributes('aria-current')).toBe('page');
    expect(navButton('More').attributes('aria-current')).toBeUndefined();
  });

  it('discards task details that arrive after Lock even when the cookie session is reused', async () => {
    let resolveDetail;
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, config) => url.endsWith('/tasks/20')
      ? new Promise((resolve) => { resolveDetail = resolve; })
      : get(url, config));
    await navButton('Tasks').trigger('click');
    await flushPromises();
    await wrapper.findAll('.qv-row').find((row) => row.text().includes('Review scheduling request')).trigger('click');
    await flushPromises();
    expect(resolveDetail).toBeTypeOf('function');
    expect(navButton('Tasks').attributes('aria-current')).toBe('page');

    await wrapper.get('[aria-label="Lock Quick View"]').trigger('click');
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.session = 'cookie';
    state.sessionUserId = 99;
    state.tab = 'tasks';
    resolveDetail({ data: { task: { id: 20, title: 'Private delayed task details' }, comments: [] } });
    await flushPromises();

    expect(wrapper.find('[aria-label="Task details"]').exists()).toBe(false);
    expect(state.taskDetail).toBeNull();
    expect(wrapper.text()).not.toContain('Private delayed task details');
  });

  it('discards a generated note arriving after Lock without restoring drafts or writing drawer storage', async () => {
    let resolveGeneration;
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, config) => url.endsWith('/note-aid/tools')
      ? Promise.resolve({ data: { tools: [{ id: 'progress-note', name: 'Progress note' }] } })
      : get(url, config));
    axios.post.mockImplementation((url) => url.endsWith('/note-aid/execute')
      ? new Promise((resolve) => { resolveGeneration = resolve; })
      : Promise.resolve({ data: {} }));
    await navButton('More').trigger('click');
    await moreTools().findAll('button').find((button) => buttonName(button) === 'Note Workspace').trigger('click');
    await flushPromises();
    await wrapper.get('#qv-na-initials').setValue('P.R.');
    await wrapper.get('textarea[placeholder="Type or paste session notes…"]').setValue('Private pending session note');
    await wrapper.findAll('button').find((button) => button.text() === 'Generate').trigger('click');
    expect(resolveGeneration).toBeTypeOf('function');
    expect(wrapper.vm.$.setupState.noteAidBusy).toBe(true);

    await wrapper.get('[aria-label="Lock Quick View"]').trigger('click');
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.session = 'cookie';
    state.sessionUserId = 99;
    state.tab = 'noteaid';
    resolveGeneration({ data: { outputText: 'Private delayed clinical note' } });
    await flushPromises();

    expect(state.noteAidBusy).toBe(false);
    expect(state.noteAidOutput).toBe('');
    expect(state.noteAidSections).toEqual([]);
    expect(state.noteAidDrawer).toEqual([]);
    expect(wrapper.get('textarea[placeholder="Type or paste session notes…"]').element.value).toBe('');
    expect(wrapper.text()).not.toContain('Private delayed clinical note');
    expect(Object.keys(localStorage).filter((key) => key.startsWith('qvNoteAidDrawer:'))).toEqual([]);
  });

  it('keeps Messages current while reading a conversation and can return to the inbox', async () => {
    await navButton('Messages').trigger('click');
    await flushPromises();
    const conversation = wrapper.findAll('.qv-row').find((row) => row.text().includes('Schedule check-in'));
    await conversation.trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/conversations/10', expect.objectContaining({ withCredentials: true }));
    expect(navButton('Messages').attributes('aria-current')).toBe('page');

    await navButton('Messages').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.qv-row').some((row) => row.text().includes('Schedule check-in'))).toBe(true);
    expect(navButton('Messages').attributes('aria-current')).toBe('page');
  });

  it('reports a failed task navigation instead of leaving an unhandled request', async () => {
    const get = axios.get.getMockImplementation();
    axios.get.mockImplementation((url, config) => url.endsWith('/tasks')
      ? Promise.reject({ response: { data: { error: { message: 'Tasks are temporarily unavailable.' } } } })
      : get(url, config));

    await navButton('Tasks').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Tasks are temporarily unavailable.');
    expect(navButton('Tasks').attributes('aria-current')).toBe('page');
    expect(navButton('Messages').attributes('aria-current')).toBeUndefined();
  });
});

it('opens the full navigation from the brand shortcut, including tools already pinned below',async()=>{
 await wrapper.get('[aria-label="All workspace options"]').trigger('click');expect(moreTools().isVisible()).toBe(true);const labels=moreTools().findAll('.qv-tool-card').map(buttonName);expect(labels).toEqual(expect.arrayContaining(['Today','Messages','Tasks','My Work','Note Workspace','Presence','Contacts']));
});

async function mobileWorkspace(notificationUnread=760){
 wrapper.unmount();
 wrapper=shallowMount(QuickView,{attachTo:document.body,props:{notificationUnread,mobileSession:{sessionToken:'synthetic-device',userId:5,agencyId:2,expiresAt:'2099-01-01T00:00:00Z',profile:{workspace:{name:'Synthetic agency'},appLock:{method:'code'}}}}});
 await flushPromises();
 const state=wrapper.vm.$.setupState;
 state.workspacePreferences={...state.workspacePreferences,navigationSlots:4,pinnedNavigation:['calendar','home','tasks','mywork']};
 state.mobileCounts={all:{unread:313}};state.workspaceBadges={tasks:20,mywork:15};
 await flushPromises();return state;
}

it('explains the More total with individual unread and to-do card counts without double-counting pinned views',async()=>{
 const state=await mobileWorkspace();await navButton('More').trigger('click');
 expect(moreTools().get('[data-count-for="notifications"]').text()).toBe('760 unread');
 expect(moreTools().get('[data-count-for="home"]').text()).toBe('313 unread');
 expect(moreTools().get('[data-count-for="tasks"]').text()).toBe('20 to do');
 expect(moreTools().get('[data-count-for="mywork"]').text()).toBe('15 to do');
 expect(navButton('More').get('.qv-nav-badge').text()).toBe('760');
 expect(moreTools().get('.qv-more-count-note').text()).toContain('760');
 await wrapper.setProps({notificationUnread:759});state.workspaceBadges={tasks:19,mywork:15};
 state.workspacePreferences={...state.workspacePreferences,navigationSlots:3};await flushPromises();
 expect(navButton('More').get('.qv-nav-badge').text()).toBe('774');
 expect(moreTools().get('[data-count-for="tasks"]').text()).toBe('19 to do');
});

it('shows unknown hidden counts as updating and preserves known work counts after a failed refresh',async()=>{
 const state=await mobileWorkspace(null);await navButton('More').trigger('click');
 expect(navButton('More').get('.qv-nav-badge').text()).toBe('…');
 expect(moreTools().get('.qv-more-count-note').text()).toContain('Updating counts');
 expect(moreTools().get('[data-count-for="notifications"]').text()).toBe('… unread');
 axios.get.mockRejectedValueOnce(new Error('Temporary network failure'));
 await state.loadWorkspaceBadges(true);await flushPromises();
 expect(state.workspaceBadges).toEqual({tasks:20,mywork:15});
 await wrapper.setProps({notificationUnread:0});
 expect(navButton('More').find('.qv-nav-badge').exists()).toBe(false);
 expect(moreTools().get('.qv-more-count-note').text()).toContain('0 unread or to do');
});

it('lets Today own the viewport without an outer heading, and releases it for More',async()=>{
 const state=await mobileWorkspace();state.tab='calendar';await flushPromises();
 expect(wrapper.get('.qv').classes()).toContain('qv-mobile-calendar');
 expect(wrapper.find('.qv-page-heading').exists()).toBe(false);
 expect(wrapper.findComponent({name:'MobileCalendar'}).props('showIntro')).toBe(true);
 await navButton('More').trigger('click');expect(wrapper.get('.qv').classes()).not.toContain('qv-mobile-calendar');
});

it('synchronizes the server inactivity deadline with the parent after activity and extension',async()=>{
 const state=await mobileWorkspace();const deadline='2099-01-01T00:10:00Z';
 axios.post.mockResolvedValue({data:{expiresAt:deadline}});
 await wrapper.get('[aria-label="Extend session by 10 minutes"]').trigger('click');await flushPromises();
 expect(state.expiresAt).toBe(deadline);expect(wrapper.emitted('session-expiry').at(-1)).toEqual([deadline]);
});
