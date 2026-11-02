import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WorkspaceNavigation from '../WorkspaceNavigation.vue';
import { auricwellAppBase } from '../../auricwell/paths';
const actor = { id: 1, role: 'super_admin' };
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
it('offers the platform dashboard, canonical tenant app and practice picker without changing the session', () => {
  localStorage.setItem('authToken', 'retained-session');
  wrapper = mount(WorkspaceNavigation, { props: { actor, slug: 'innerstrength', interfaceName: 'auricwell' } });
  const links = Object.fromEntries(wrapper.findAll('a').map(a => [a.text(), a.attributes('href')]));
  expect(links).toEqual({ 'Superadmin dashboard': '/admin', 'Main app': '/tisi/dashboard', 'Switch tenant': '/auricwell/app' });
  expect(localStorage.getItem('authToken')).toBe('retained-session');
});
it('returns from the main app to the selected AuricWell tenant', () => {
  wrapper = mount(WorkspaceNavigation, { props: { actor, slug: 'tisi', interfaceName: 'main' } });
  expect(wrapper.findAll('a').find(a => a.text() === 'AuricWell').attributes('href')).toBe('/auricwell/app/tisi');
});
it('uses the dedicated AuricWell host entry without changing origin', () => {
  vi.stubGlobal('location', new URL('https://auricwell.com/app/tisi'));
  expect(auricwellAppBase('auricwell.com')).toBe('/app');
  expect(auricwellAppBase('app.itsco.health')).toBe('/auricwell/app');
});
it('never exposes platform admin navigation to a provider', () => {
  wrapper = mount(WorkspaceNavigation, { props: { actor: { id: 1433, role: 'provider' }, slug: 'auricwell-qa-demo', interfaceName: 'auricwell' } });
  expect(wrapper.text()).not.toContain('Superadmin');
  expect(wrapper.get('a').attributes('href')).toBe('/auricwell-qa-demo/dashboard');
});
it('keeps fictional demos and unauthenticated views out of real workspaces', async () => {
  wrapper = mount(WorkspaceNavigation, { props: { actor, demo: true } });
  expect(wrapper.find('nav').exists()).toBe(false);
  await wrapper.setProps({ actor: null, demo: false });
  expect(wrapper.find('nav').exists()).toBe(false);
});
