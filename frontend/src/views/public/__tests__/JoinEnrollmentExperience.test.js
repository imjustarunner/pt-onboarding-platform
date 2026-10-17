import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Join from '../AdaptiveJoinView.vue';
import { i18n, setPublicLocale } from '../../../i18n';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null, isAuthenticated: false }) }));
let wrapper;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); setPublicLocale('en'); window.scrollTo=vi.fn(); });
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); setPublicLocale('en'); });
async function render(slug='itsco') {
 const config={agency:{id:2,slug,name:slug==='itsco'?'ITSCO':'Example Care'},branding:{agencyName:slug==='itsco'?'ITSCO':'Example Care'},activeService:{serviceType:'counseling',displayName:'Counseling'},intakeServices:[{serviceType:'counseling'}],pathways:{quick:{enabled:true},full:{enabled:true,publicKey:'office-test'}},selfConcernOptions:[{value:'custom',label:'Published agency concern'}],copy:{}};
 api.get.mockResolvedValue({data:config});api.post.mockResolvedValue({data:{translations:{'Published agency concern':'Motivo publicado'}}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/join/:agencySlug/:serviceType',component:Join},{path:'/intake/:publicKey',component:{template:'<div/>'}},{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});
 await router.push(`/join/${slug}/counseling`);await router.isReady();
 wrapper=mount(Join,{global:{plugins:[router],stubs:{AdaptiveJoinLanding:{template:'<button @click="$emit(\'continue\',\'quick\')">Brief</button>'},LearningEnrollmentQuestions:true}}});
 await flushPromises();await wrapper.find('button').trigger('click');await flushPromises();return router;
}
describe('Shared enrollment experience',()=>{
 it.each(['itsco','example'])('brands the brief form for %s and AuricWell without the old sidebar',async slug=>{
  await render(slug);expect(wrapper.find('.df-page--enrollment').exists()).toBe(true);expect(wrapper.find('.df-sidebar').exists()).toBe(false);
  expect(wrapper.find('.enrollment-brand').text()).toContain(slug==='itsco'?'ITSCO':'Example Care');expect(wrapper.find('.enrollment-brand').text()).toContain('AuricWell');
 });
 it('switches every brief step to Spanish without losing answers or translating private values',async()=>{
  await render();wrapper.vm.form.respondent.firstName='Private Person';wrapper.vm.form.notes='Private answer';
  await wrapper.find('button[aria-label="Español"]').trigger('click');await flushPromises();
  expect(wrapper.find('h1').text()).toBe('Vamos a conocerte.');expect(wrapper.text()).toContain('Nombre');expect(wrapper.text()).toContain('Sobre ti');
  expect(wrapper.vm.form.respondent.firstName).toBe('Private Person');expect(wrapper.vm.form.notes).toBe('Private answer');
  expect(localStorage.getItem('publicLocale')).toBe('es');expect(localStorage.getItem('preferredFormLanguage')).toBe('es');
  for(const [index,heading] of [[1,'¿Qué apoyo buscas?'],[2,'Preferencias y disponibilidad'],[4,'Permiso para contactarte'],[5,'Revisar y enviar']]){wrapper.vm.quickStep=index;await flushPromises();expect(wrapper.find('h1').text()).toBe(heading);}
  expect(wrapper.text()).toContain('Private Person');expect(wrapper.text()).toContain('Private answer');
  expect(JSON.stringify(api.post.mock.calls)).not.toMatch(/Private Person|Private answer/);
  await wrapper.find('button[aria-label="English"]').trigger('click');await flushPromises();expect(wrapper.find('h1').text()).toBe('Review & submit');expect(wrapper.vm.form.notes).toBe('Private answer');
 });
 it('honors an already selected Spanish locale on entry',async()=>{setPublicLocale('es');await render();expect(wrapper.find('h1').text()).toBe('Vamos a conocerte.');});
});
