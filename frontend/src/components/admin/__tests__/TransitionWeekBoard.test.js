import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: m }));
import Board from '../TransitionWeekBoard.vue';
const result = () => ({ revision: 0, catalog: [{ id: 'one', day: '16', role: 'Records', category: 'Records', title: 'Verify archives', requires: [] }], state: { tasks: { one: { status: 'unverified', owner: '', backup: '', evidence: '', nextAction: '' } }, metrics: { source_charts: { total: null, completed: 0, blocked: 0 } }, ranking: null, cohorts: {} } });
beforeEach(() => { vi.clearAllMocks(); m.get.mockResolvedValue({ data: result() }); m.put.mockImplementation(async (_, body) => ({ data: { ...result(), revision: 1, state: body.state } })); });
it('keeps totals unknown, saves revisioned practice evidence, and blocks navigation while dirty', async () => {
  const w = mount(Board, { props: { agencyId: 6 } }); await flushPromises();
  expect(w.get('input[type=number]').element.value).toBe('');
  await w.get('.transition-task input').setValue('Assigned reviewer'); expect(w.vm.beforeNavigate()).toBe(false);
  await w.findAll('button').find(b => b.text() === 'Save evidence').trigger('click'); await flushPromises();
  expect(m.put).toHaveBeenCalledWith('/provider-scheduling/transition-week', expect.objectContaining({ agencyId: 6, revision: 0, action: 'save' }));
  expect(w.vm.beforeNavigate()).toBe(true); expect(w.text()).toContain('Saved revision 1'); w.unmount();
});
it('retains local evidence after a conflicting save and never claims success', async () => {
  const w = mount(Board, { props: { agencyId: 6 } }); await flushPromises();
  await w.get('.transition-task input').setValue('Keep this review'); m.put.mockRejectedValue({ response: { data: { error: { message: 'Board changed. Refresh before saving.' } } } });
  await w.findAll('button').find(b => b.text() === 'Save evidence').trigger('click'); await flushPromises();
  expect(w.get('.transition-task input').element.value).toBe('Keep this review'); expect(w.text()).toContain('Unsaved changes'); expect(w.find('[role=status]').exists()).toBe(false); w.unmount();
});
it('rejects stale reads after switching practices and clears former evidence immediately', async () => {
  let finish;
  m.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ data: result() });
  const w = mount(Board, { props: { agencyId: 6 } }); await w.setProps({ agencyId: 377 }); await flushPromises();
  finish({ data: { ...result(), revision: 99 } }); await flushPromises();
  expect(w.text()).not.toContain('revision 99'); expect(m.get).toHaveBeenLastCalledWith('/provider-scheduling/transition-week', { params: { agencyId: 377 } }); w.unmount();
});
it('keeps missing CSV counts as null instead of silently ranking them as zero', async () => {
  m.get.mockImplementation(async url => ({ data: url.endsWith('/providers') ? [{ id: 4, name: 'Synthetic provider' }] : result() }));
  const w = mount(Board, { props: { agencyId: 2 } }); await flushPromises();
  await w.get('.cohort-section > label input').setValue('Verified report');
  await w.get('.cohort-section > label textarea').setValue('providerId,completedFourWeeks,upcomingWeek\n4,,2');
  m.put.mockRejectedValue(new Error('Missing counts'));
  await w.findAll('button').find(b => b.text() === 'Freeze ranking and create groups').trigger('click'); await flushPromises();
  expect(m.put.mock.calls[0][1].rows).toEqual([{ providerId: 4, completedFourWeeks: null, upcomingWeek: 2 }]); w.unmount();
});
it('shows all workstreams by default and clearly identifies the selected practice', async () => {
  const data=result(); data.catalog.push({id:'training',day:'17',role:'Training',category:'Training videos',title:'Publish training videos',requires:[]}); data.state.tasks.training={...data.state.tasks.one};
  m.get.mockResolvedValue({data});
  const w=mount(Board,{props:{agencyId:377}});await flushPromises();
  expect(w.get('#transition-week-title').text()).toContain('Inner Strength');
  expect(w.get('select').element.value).toBe('');
  expect(w.text()).toContain('Verify archives');expect(w.text()).toContain('Publish training videos');w.unmount();
});
it('tracks a video creator, due date, production status, reviewer and watch link', async () => {
  const data=result();data.videoCatalog=[{id:'sample',title:'Record scheduling walkthrough',role:'Clinical',minutes:6,outcome:'Show one occurrence change'}];
  data.state.videos={sample:{status:'not_started',owner:'',reviewer:'',dueDate:'2026-11-17',url:'',evidence:'',nextAction:'',completedAt:null}};
  m.get.mockResolvedValue({data});const w=mount(Board,{props:{agencyId:6}});await flushPromises();
  await w.get('.transition-video input').setValue('Assigned trainer');
  await w.get('.transition-video select').setValue('recording');
  await w.findAll('button').find(b=>b.text()==='Save evidence').trigger('click');await flushPromises();
  expect(m.put.mock.calls[0][1].state.videos.sample).toMatchObject({owner:'Assigned trainer',status:'recording',dueDate:'2026-11-17'});w.unmount();
});
