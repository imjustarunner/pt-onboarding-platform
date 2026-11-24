import { expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { publicDomainHistory } from '../publicDomainRouting.js';
import { plotlinePaths } from '../plotline.js';

it.each(['plotlinepo.com', 'www.plotlinepo.com'])('opens and reloads a direct company application on %s', async host => {
  const path = '/careers/juniper-qa/jobs/42/apply?source=careers';
  const raw = createMemoryHistory();raw.replace(path);
  const history = publicDomainHistory(raw, host);
  const router = createRouter({ history, routes: [{ path: '/careers/:agencySlug/jobs/:jobId/apply', name: 'Application', component: {} }] });
  await router.push(history.location);
  expect(router.currentRoute.value.name).toBe('Application');
  expect(router.currentRoute.value.params).toEqual({ agencySlug: 'juniper-qa', jobId: '42' });
  expect(router.currentRoute.value.query.source).toBe('careers');
  expect(router.resolve(path).href).toBe(path);
  expect(plotlinePaths.internal(raw.location)).toBe(path);
  history.destroy();
});

it('keeps company careers and job links distinct from the Plotline careers marketing page', () => {
  expect(plotlinePaths.internal('/careers')).toBe('/plotline/careers');
  expect(plotlinePaths.internal('/careers/juniper-qa')).toBe('/careers/juniper-qa');
  expect(plotlinePaths.internal('/careers/juniper-qa/jobs/42')).toBe('/careers/juniper-qa/jobs/42');
  expect(plotlinePaths.internal('/juniper-qa/jobs/42')).toBe('/careers/juniper-qa/jobs/42');
  expect(plotlinePaths.clean('/careers/juniper-qa')).toBe('/juniper-qa');
  expect(plotlinePaths.internal('/intake/legacy-public-key')).toBe('/intake/legacy-public-key');
});


it.each(['plotlinepo.com','www.plotlinepo.com'])('opens public platform support on %s without becoming a company slug',async host=>{
 const raw=createMemoryHistory();raw.replace('/support?source=reference');const history=publicDomainHistory(raw,host);
 const router=createRouter({history,routes:[{path:'/plotline/support',name:'PlotlineSupport',component:{}}]});await router.push(history.location);
 expect(router.currentRoute.value.name).toBe('PlotlineSupport');expect(router.currentRoute.value.query.source).toBe('reference');expect(router.resolve('/plotline/support').href).toBe('/support');history.destroy();
});
