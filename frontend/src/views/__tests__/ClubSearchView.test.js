import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import ClubSearchView from '../ClubSearchView.vue';
import api from '../../services/api';

const stores = vi.hoisted(() => ({ auth: null, agency: null, branding: null }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => stores.auth }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => stores.agency }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => stores.branding }));

const club = { id: 17, name: 'Mountain Movers', city: 'Denver', state: 'CO', primaryManagerName: 'Alex Morgan', primaryManagerUserId: 9 };
let wrapper;
let response;
let applications;
let clubRequest;
async function render(slug = 'sstc') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:organizationSlug/clubs', component: ClubSearchView },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
  ] });
  await router.push(`/${slug}/clubs`);
  wrapper = mount(ClubSearchView, { global: { plugins: [router] } });
  await flushPromises();
  return router;
}
const button = (text) => wrapper.findAll('button').find((b) => b.text() === text);
beforeEach(() => {
  vi.clearAllMocks();
  stores.auth = reactive({ isAuthenticated: false, user: null });
  stores.agency = reactive({ userAgencies: [], fetchUserAgencies: vi.fn().mockResolvedValue() });
  stores.branding = { displayLogoUrl: '', setPortalThemeFromLoginTheme: vi.fn(), clearPortalTheme: vi.fn() };
  response = { clubs: [club], total: 1, inviteOnlyMemberSignup: false };
  applications = [];
  clubRequest = null;
  api.get.mockImplementation(async (url, options) => {
    if (url === '/summit-stats/clubs') return clubRequest ? clubRequest(options) : { data: response };
    if (url === '/summit-stats/my-applications') return { data: { applications } };
    return { data: { agency: { name: 'Summit Stats Team Challenge' } } };
  });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });

describe('Club directory', () => {
  it('shows public club details and sends guests to the selected club application', async () => {
    const router = await render();
    expect(wrapper.text()).toContain('Denver, CO');
    expect(wrapper.text()).toContain('Alex Morgan');
    expect(wrapper.find('.club-card h3 a').attributes('href')).toBe('/sstc/clubs/17');
    await button('Apply to join').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/sstc/join?club=17');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('respects invitation-only clubs', async () => {
    response.inviteOnlyMemberSignup = true;
    const router = await render();
    await button('Request invite').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/sstc/join?club=17');
  });

  it('paginates all clubs and resets pagination when a filter changes', async () => {
    response.total = 30;
    await render();
    await button('Next →').trigger('click');
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/summit-stats/clubs', expect.objectContaining({ params: expect.objectContaining({ offset: 12, limit: 12 }) }));
    await wrapper.find('select').setValue('CO');
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/summit-stats/clubs', expect.objectContaining({ params: expect.objectContaining({ offset: 0, state: 'CO' }) }));
    expect(wrapper.text()).toContain('Page 1 of 3');
  });

  it('ignores stale search responses', async () => {
    vi.useFakeTimers();
    await render();
    let resolveOld;
    clubRequest = () => new Promise((resolve) => { resolveOld = resolve; });
    await wrapper.find('input').setValue('old');
    await vi.advanceTimersByTimeAsync(300);
    clubRequest = async () => ({ data: { clubs: [{ ...club, name: 'New club' }], total: 1 } });
    await wrapper.find('input').setValue('new');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    resolveOld({ data: { clubs: [{ ...club, name: 'Old club' }], total: 1 } });
    await flushPromises();
    expect(wrapper.find('.club-card').text()).toContain('New club');
    expect(wrapper.text()).not.toContain('Old club');
  });

  it('shows membership and pending applications without duplicate join actions', async () => {
    stores.auth.isAuthenticated = true;
    stores.auth.user = { id: 4 };
    stores.agency.userAgencies = [{ id: 17 }];
    response.clubs.push({ ...club, id: 18, name: 'Pending club' });
    applications = [{ clubId: 18, status: 'pending' }];
    await render();
    expect(wrapper.findAll('.club-badge').map((badge) => badge.text())).toEqual(['Member', 'Application pending']);
    expect(button('Apply to join')).toBeUndefined();
  });

  it('keeps clubs visible when manager contact fails', async () => {
    stores.auth.isAuthenticated = true;
    stores.auth.user = { id: 4 };
    api.post.mockRejectedValue(new Error('offline'));
    await render();
    await button('Contact manager').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('Failed to open the manager chat');
    expect(wrapper.find('.club-card').exists()).toBe(true);
  });

  it('offers a retry after loading fails and accurate missing-data labels', async () => {
    clubRequest = async () => { throw new Error('offline'); };
    await render();
    expect(wrapper.text()).toContain('We couldn’t load the clubs.');
    clubRequest = null;
    response.clubs = [{ id: 5, name: 'New community' }];
    await button('Try again').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Location not listed');
    expect(wrapper.text()).toContain('Manager not listed');
    expect(wrapper.text()).not.toContain('· You');
  });

  it('lets visitors recover from an empty filtered result', async () => {
    await render();
    response = { clubs: [], total: 0 };
    await wrapper.find('select').setValue('AK');
    await flushPromises();
    expect(wrapper.text()).toContain('No clubs match your search yet.');
    response = { clubs: [club], total: 1 };
    await button('Show all clubs').trigger('click');
    await flushPromises();
    expect(wrapper.find('select').element.value).toBe('');
    expect(wrapper.findAll('.club-card')).toHaveLength(1);
  });
});
