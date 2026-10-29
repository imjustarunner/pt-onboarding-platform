import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, inject, onMounted, onUnmounted, ref } from 'vue';
import { createMemoryHistory, createRouter, useRoute, RouterView } from 'vue-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MeetingRouteHost from '../MeetingRouteHost.vue';
import { meetingViewportKey } from '../../../utils/meetingMiniMode';
import { useActiveMeeting } from '../../../composables/useActiveMeeting';

let wrapper, router, viewport, mounts, stops, ticks;
const Meeting = defineComponent({
  setup() {
    const route = useRoute();
    viewport = inject(meetingViewportKey);
    const note = ref('');
    onMounted(() => { mounts++; });
    const timer = setInterval(() => ticks.push(route.params.id), 10000);
    onUnmounted(() => { stops++; clearInterval(timer); });
    return () => h('article', [h('span', { class: 'meeting-id' }, `${route.params.id}:${route.query.access}`),
      h('input', { value: note.value, onInput: e => { note.value = e.target.value; } }),
      h('button', { onClick: viewport.minimize }, 'Mini')]);
  }
});
beforeEach(() => { vi.useFakeTimers(); mounts = 0; stops = 0; ticks = []; });
afterEach(() => { wrapper?.unmount(); useActiveMeeting().clearMiniMode(); vi.useRealTimers(); });
async function render(kind = 'Supervision') {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/join/supervision/:id', name: 'JoinSupervision', component: Meeting },
    { path: '/join/team-meeting/:id', name: 'JoinTeamMeeting', component: Meeting },
    { path: '/dashboard', component: { template: '<div>Dashboard</div>' } },
    { path: '/notes', component: { template: '<div>App notes</div>' } }
  ] });
  const path = kind === 'Supervision' ? '/join/supervision/9?access=invitation' : '/join/team-meeting/9?access=invitation';
  await router.push(path); await router.isReady();
  wrapper = mount(MeetingRouteHost, { props: { canMinimize: true }, global: { plugins: [router] } });
  await flushPromises(); return path;
}
it.each(['Supervision', 'TeamMeeting'])('retains %s identity, timers and drafts through mini, app navigation and restoration', async kind => {
  const path = await render(kind);
  const instance = wrapper.findComponent(Meeting).vm;
  await wrapper.get('input').setValue('Keep my notes');
  for (let cycle = 0; cycle < 2; cycle++) {
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.path).toBe('/dashboard');
    expect(wrapper.text()).toContain('Dashboard');
    await router.push('/notes'); await flushPromises();
    expect(wrapper.get('.meeting-id').text()).toBe('9:invitation');
    await vi.advanceTimersByTimeAsync(30000);
    expect(ticks.every(id => id === '9')).toBe(true);
    await viewport.restore(); await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(path);
    expect(wrapper.findComponent(Meeting).vm).toBe(instance);
    expect(wrapper.get('input').element.value).toBe('Keep my notes');
    expect(useActiveMeeting().state.active).toBe(false);
  }
  expect(mounts).toBe(1); expect(stops).toBe(0); expect(ticks).toHaveLength(6);
  await router.push('/dashboard'); await flushPromises();
  expect(stops).toBe(1); expect(wrapper.findComponent(Meeting).exists()).toBe(false);
});
it('restores via browser back without creating another meeting', async () => {
  await render(); await viewport.minimize(); await flushPromises();
  router.back(); await flushPromises();
  expect(useActiveMeeting().state.active).toBe(false);
  expect(mounts).toBe(1); expect(stops).toBe(0);
});
it('keeps a second meeting from starting over the retained one', async () => {
  await render(); await viewport.minimize(); await router.push('/join/team-meeting/22'); await flushPromises();
  expect(wrapper.text()).toContain('Leave that meeting before joining another');
  expect(mounts).toBe(1); expect(stops).toBe(0);
  await viewport.restore(); await flushPromises();
  expect(router.currentRoute.value.path).toBe('/join/supervision/9');
});
it('does not retain a meeting after authentication is removed', async () => {
  await render(); await viewport.minimize(); await flushPromises();
  await wrapper.setProps({ canMinimize: false });
  expect(stops).toBe(1); expect(useActiveMeeting().state.active).toBe(false);
});
it('keeps the full meeting connected when navigation is refused', async () => {
  await render(); router.beforeEach(to => to.path === '/dashboard' ? false : undefined);
  await viewport.minimize(); await flushPromises();
  expect(useActiveMeeting().state.active).toBe(false);
  expect(mounts).toBe(1); expect(stops).toBe(0);
});

it('preserves normal nested routing and query updates outside a meeting', async () => {
  await render();
  let ordinaryMounts = 0;
  const Notes = defineComponent({ setup() {
    ordinaryMounts++;
    const current = useRoute();
    return () => h('p', { class: 'nested-note' }, current.query.tab || 'notes');
  } });
  router.addRoute({ path: '/workspace', component: { render: () => h(RouterView) }, children: [{ path: 'notes', component: Notes }] });
  await router.push('/workspace/notes?tab=first'); await flushPromises();
  expect(wrapper.get('.nested-note').text()).toBe('first');
  await router.push('/workspace/notes?tab=second'); await flushPromises();
  expect(wrapper.get('.nested-note').text()).toBe('second');
  expect(ordinaryMounts).toBe(1); expect(stops).toBe(1);
});
