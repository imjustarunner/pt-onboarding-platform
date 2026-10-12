import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Library from '../LibraryView.vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import * as service from '../../services/library';
import api from '../../services/api';
vi.mock('../../components/library/LibraryResourceViewer.vue', () => ({default:{name:'LibraryResourceViewer',props:['resource'],template:'<div data-document-viewer>{{resource.name}}</div>',methods:{prepareToLeave(){return true}}}}));
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/library', () => ({ fetchLibraryHome: vi.fn(), fetchLibraryResources: vi.fn(), fetchLibraryResource: vi.fn(), addLibraryFavorite: vi.fn(), removeLibraryFavorite: vi.fn(), updateLibraryResource: vi.fn(), archiveLibraryResource: vi.fn(), fetchFolderShares: vi.fn(), setFolderShares: vi.fn() }));
const pdf = { id: 44, agencyId: 2, name: 'Team worksheet', resourceType: 'file', fileType: 'pdf', categoryId: 3, categoryName: 'Templates', scope: 'organization' };
const stubs = {
  DocumentAnalyticsControl: true,
  LibraryAddResourceModal: { name:'LibraryAddResourceModal', props: ['agencyId', 'initialMode'], template: '<div data-add-modal>{{initialMode}}</div>' },
  LibraryDistributeModal: true,
  CompanyReferenceLibrary: { props: ['agencyId', 'readerOnly'], template: '<div data-guide-reader />' },
  LibraryResourceViewer: { props: ['resource'], template: '<div data-document-viewer>{{resource.name}}</div>', methods: { prepareToLeave() { return true; } } }
};
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  service.fetchLibraryHome.mockResolvedValue({ categories: [{ id: 3, name: 'Templates', slug: 'templates' }], folders: [{ id: 9, name: 'Shared forms', scope: 'organization' }], recentlyViewed: [pdf], favorites: [] });
  service.fetchLibraryResources.mockImplementation(async params => params.favorites ? Array.from({length: 15}, (_, i) => ({...pdf, id: i + 50, name: `Favorite ${i}`})) : params.q ? [pdf].filter(p => p.name.toLowerCase().includes(params.q.toLowerCase())) : [pdf]);
  service.fetchLibraryResource.mockResolvedValue(pdf);
  api.get.mockResolvedValue({data: {documents: [{ key: 'provider-guide', title: 'Provider guide', betaAvailable: true, description: 'Clinical practice' }], canManage: false}});
});
afterEach(() => wrapper?.unmount());
async function render(path = '/itsco/library') {
  const pinia = createPinia();
  useAuthStore(pinia).user = {id: 8, role: 'provider', capabilities: {canViewLibrary: true}};
  useAgencyStore(pinia).currentAgency = {id: 99, slug: 'different-agency', name: 'Other'};
  useAgencyStore(pinia).userAgencies = [{id: 2, slug: 'itsco', name: 'ITSCO'}];
  const router = createRouter({history: createMemoryHistory(), routes: [{name:'OrganizationLibrary', path:'/:organizationSlug/library',component:Library},{name:'OrganizationLibraryResource',path:'/:organizationSlug/library/:resourceId',component:Library},{path:'/:organizationSlug/:other',component:{template:'<div />'}}]});
  await router.push(path); await router.isReady();
  wrapper = mount(Library,{global:{plugins:[pinia,router],stubs}}); await flushPromises(); return router;
}
async function clickText(text) { const btn=wrapper.findAll('button').find(b=>b.text().includes(text)); expect(btn).toBeTruthy(); await btn.trigger('click'); await flushPromises(); }
it('opens a document workspace with guides and files, no Plotline branding, and staff creation actions', async () => {
  await render();
  expect(wrapper.get('h1').text()).toBe('Document library Beta');
  expect(wrapper.text()).toContain('Provider guide'); expect(wrapper.text()).toContain('Team worksheet');
  expect(wrapper.find('[aria-label="Plotline by PlotTwistCo"]').exists()).toBe(false);
  expect(wrapper.text()).not.toContain('Library & learning');
  expect(service.fetchLibraryResources).toHaveBeenCalledWith(expect.objectContaining({agencyId:2}));
  await clickText('New document');
  expect(wrapper.getComponent({name:'LibraryAddResourceModal'}).props()).toMatchObject({agencyId:2,initialMode:'branded'});
});
it('searches the combined catalog and keeps favorites separate without truncating to the home summary', async () => {
  await render();
  await wrapper.get('input[aria-label="Search documents"]').setValue('Provider'); await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(wrapper.text()).toContain('Provider guide'); expect(wrapper.text()).not.toContain('Team worksheet');
  await wrapper.get('button[aria-label="Clear search"]').trigger('click'); await flushPromises();
  await clickText('Favorites');
  expect(wrapper.findAll('.lib-list__row')).toHaveLength(15); expect(wrapper.text()).not.toContain('Provider guide');
});
it('opens guides in their reader and PDFs in the app using the route agency', async () => {
  const router=await render();
  await wrapper.findAll('.lib-list__open').find(b=>b.text().includes('Provider guide')).trigger('click'); await flushPromises();
  expect(router.currentRoute.value.query.companyDocument).toBe('provider-guide'); expect(wrapper.find('[data-guide-reader]').exists()).toBe(true);
  await clickText('Back to documents');
  await wrapper.findAll('.lib-list__open').find(b=>b.text().includes('Team worksheet')).trigger('click'); await flushPromises();
  expect(service.fetchLibraryResource).toHaveBeenLastCalledWith(expect.anything(),{agencyId:2});
  expect(wrapper.find('[data-document-viewer]').text()).toBe('Team worksheet');
});
it('opens an uploaded PDF immediately with the document viewer and no unsolicited sharing',async()=>{
  await render(); await clickText('Upload');
  wrapper.getComponent({name:'LibraryAddResourceModal'}).vm.$emit('created',{kind:'resource',item:pdf,shareMode:null});await flushPromises();
  expect(wrapper.find('[data-document-viewer]').exists()).toBe(true);
  expect(wrapper.findComponent({name:'LibraryDistributeModal'}).exists()).toBe(false);
});
it('restores favorites from a direct link and closes the viewer when its URL is removed', async () => {
  const router=await render('/itsco/library?section=favorites');
  expect(wrapper.findAll('.lib-list__row')).toHaveLength(15);
  await router.push('/itsco/library/44?section=favorites'); await flushPromises();
  expect(wrapper.find('[data-document-viewer]').exists()).toBe(true);
  await router.push('/itsco/library?section=favorites'); await flushPromises();
  expect(wrapper.find('[data-document-viewer]').exists()).toBe(false);
});
it('switches between folder and category without leaving the previous filter applied', async () => {
  await render();
  await clickText('Shared forms'); expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({folderId:9}));
  await clickText('Templates'); expect(service.fetchLibraryResources.mock.lastCall[0]).not.toHaveProperty('folderId'); expect(service.fetchLibraryResources.mock.lastCall[0].categoryId).toBe(3);
  await clickText('Shared forms'); expect(service.fetchLibraryResources.mock.lastCall[0]).not.toHaveProperty('categoryId');
});
it('does not reopen a previous organization’s document after a slow response', async () => {
  const router=await render(); let resolve;
  service.fetchLibraryResource.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  await wrapper.findAll('.lib-list__open').find(b=>b.text().includes('Team worksheet')).trigger('click'); await flushPromises();
  await router.push('/different-agency/library'); await flushPromises();
  resolve(pdf); await flushPromises();
  expect(wrapper.find('[data-document-viewer]').exists()).toBe(false);
  expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({agencyId:99}));
});
it('opens My files directly with a personal resource filter and only the employee’s own folders', async () => {
  const personal = { ...pdf, id: 80, name: 'My worksheet', scope: 'personal', ownerUserId: 8 };
  service.fetchLibraryHome.mockResolvedValue({ categories: [], folders: [
    { id: 10, name: 'My folder', scope: 'personal', ownerUserId: 8 },
    { id: 11, name: 'My nested folder', scope: 'personal', ownerUserId: 8, parentFolderId: 10 },
    { id: 12, name: 'Colleague folder', scope: 'personal', ownerUserId: 9 },
    { id: 13, name: 'Company folder I created', scope: 'organization', ownerUserId: 8 }
  ], recentlyViewed: [], favorites: [] });
  service.fetchLibraryResources.mockImplementation(async params => params.mine ? [personal] : [pdf, personal]);
  const router = await render('/itsco/library?section=mine');
  expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({ agencyId: 2, mine: '1' }));
  expect(wrapper.findAll('.lib-list__row')).toHaveLength(1);
  expect(wrapper.findAll('.lib-list__open').map(button => button.text()).join(' ')).toContain('My worksheet');
  expect(wrapper.get('[aria-label="Subfolders"]').findAll('button').map(button => button.text().replace('▱', '').trim())).toEqual(['My folder']);
  await clickText('All documents');
  expect(service.fetchLibraryResources.mock.lastCall[0]).not.toHaveProperty('mine');
  expect(router.currentRoute.value.query.section).toBe('all');
});
it('navigates nested folders with a selected breadcrumb and preserves the agency', async () => {
  service.fetchLibraryHome.mockResolvedValue({ categories: [], folders: [
    { id: 10, name: 'Personal resources', scope: 'personal', ownerUserId: 8 },
    { id: 11, name: 'Session worksheets', scope: 'personal', ownerUserId: 8, parentFolderId: 10 },
    { id: 12, name: 'Archived examples', scope: 'personal', ownerUserId: 8, parentFolderId: 11 }
  ], recentlyViewed: [], favorites: [] });
  await render();
  await clickText('Personal resources');
  expect(wrapper.get('[aria-label="Subfolders"]').text()).toContain('Session worksheets');
  await wrapper.get('[aria-label="Subfolders"] button').trigger('click'); await flushPromises();
  expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({ agencyId: 2, folderId: 11 }));
  const breadcrumb = wrapper.get('[aria-label="Folder location"]');
  expect(breadcrumb.findAll('button').map(button => button.text())).toEqual(['Library', 'Personal resources', 'Session worksheets']);
  expect(breadcrumb.get('[aria-current="page"]').text()).toBe('Session worksheets');
  await breadcrumb.findAll('button')[1].trigger('click'); await flushPromises();
  expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({ agencyId: 2, folderId: 10 }));
});
it('opens video-link creation from the document tools and displays videos as files', async () => {
  service.fetchLibraryResources.mockResolvedValue([{ id: 90, agencyId: 2, name: 'Orientation recording', fileType: 'video', resourceType: 'link', url: 'https://vimeo.com/123456789', videoProvider: 'Vimeo' }]);
  await render();
  const row = wrapper.findAll('.lib-list__row').find(row => row.text().includes('Orientation recording'));
  expect(row.text()).toContain('VIDEO'); expect(row.text()).toContain('Video link');
  await clickText('Video link');
  expect(wrapper.getComponent({ name: 'LibraryAddResourceModal' }).props()).toMatchObject({ agencyId: 2, initialMode: 'video' });
});

it('keeps searches within My files until the employee chooses another view', async () => {
  await render('/itsco/library?section=mine');
  await wrapper.get('input[aria-label="Search documents"]').setValue('Worksheet');
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({ agencyId: 2, mine: '1', q: 'Worksheet' }));
  await wrapper.get('button[aria-label="Clear search"]').trigger('click'); await flushPromises();
  expect(service.fetchLibraryResources).toHaveBeenLastCalledWith(expect.objectContaining({ agencyId: 2, mine: '1' }));
  expect(service.fetchLibraryResources.mock.lastCall[0]).not.toHaveProperty('q');
});

it('offers uploads, folders, and links in Add + separately from New document', async () => {
  await render('/itsco/library?section=mine');
  const menu = wrapper.get('.document-add-menu');
  expect(menu.get('summary').text()).toBe('Add +');
  expect(menu.findAll('button').map(button => button.text())).toEqual(['Upload file','Upload folder','Create folder','Add link / Google Doc','Add video link']);
  menu.element.open = true;
  await menu.findAll('button').find(button => button.text() === 'Create folder').trigger('click'); await flushPromises();
  expect(menu.element.open).toBe(false);
  expect(wrapper.getComponent({name:'LibraryAddResourceModal'}).props('initialMode')).toBe('folder');
});
