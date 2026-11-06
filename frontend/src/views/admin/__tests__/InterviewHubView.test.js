import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 11, role: 'admin', agencyId: 2 } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, userAgencies: [{ id: 2, name: 'Agency', organization_type: 'agency' }] }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
vi.mock('../HiringCandidatesView.vue', () => ({ default: { template: '<div />' } }));
import InterviewHub from '../InterviewHubView.vue';

let wrapper, staff, wrapped;
const dayana = { id: 476, first_name: 'Dayana', last_name: 'Example', role: 'provider', has_hiring_access: 1 };
const candidate = { user_id: 30, first_name: 'Jordan', last_name: 'Applicant' };
const button = text => wrapper.findAll('button').find(b => b.text() === text);

beforeEach(() => {
  vi.clearAllMocks(); staff = [dayana]; wrapped = false;
  api.get.mockImplementation(async url => {
    let data;
    if (url === '/hiring/assignees') data = staff;
    else if (url === '/hiring/candidates') data = [candidate];
    else if (url === '/hiring/job-descriptions') data = [{ id: 7, title: 'Counselor' }];
    else return { data: { data: [] } };
    return { data: wrapped ? { data } : data };
  });
  api.post.mockResolvedValue({ data: { data: { interview: { id: 5 } } } });
});
afterEach(() => wrapper?.unmount());

async function open() {
  wrapper = mount(InterviewHub);
  await flushPromises();
  await button('Schedule interview').trigger('click');
  await flushPromises();
}

describe('Interview Hub scheduling options', () => {
  it.each([false, true])('shows the granted interviewer and candidates from hiring lists (wrapped: %s)', async useWrapper => {
    wrapped = useWrapper;
    await open();
    expect(wrapper.get('.ih-interviewer-list').text()).toContain('Dayana Example');
    expect(wrapper.get('[role="dialog"] select option[value="30"]').text()).toContain('Jordan Applicant');
    expect(api.get).toHaveBeenCalledWith('/hiring/assignees', { params: { agencyId: 2 } });
  });

  it('reloads interviewers when scheduling opens after hiring permissions change', async () => {
    staff = [];
    wrapper = mount(InterviewHub); await flushPromises();
    staff = [dayana];
    await button('Schedule interview').trigger('click'); await flushPromises();
    expect(wrapper.get('.ih-interviewer-list input[value="476"]').exists()).toBe(true);
  });

  it('sends the selected interviewer when scheduling from the visible form', async () => {
    await open();
    await wrapper.get('[role="dialog"] select').setValue('30');
    await wrapper.get('input[type="datetime-local"]').setValue('2026-11-10T10:00');
    await wrapper.get('.ih-interviewer-list input[value="476"]').setValue(true);
    await wrapper.findAll('.ih-modal-footer button').at(-1).trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/hiring/interview-hub/interviews', expect.objectContaining({ agencyId: 2, candidateUserId: 30, interviewerUserIds: [476] }));
  });

  it('loads job choices for interview question sets from the same hiring API', async () => {
    wrapper = mount(InterviewHub); await flushPromises();
    await button('Templates').trigger('click'); await flushPromises();
    await button('New set').trigger('click');
    expect(wrapper.findAll('option').some(option => option.attributes('value') === '7' && option.text() === 'Counselor')).toBe(true);
  });
});
