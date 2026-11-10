import {expect,it} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import AccountHub from '../AccountHubPanel.vue';
it('opens Account Info directly from the emailed family-welcome link and keeps ordinary navigation working',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/itsco/dashboard',component:{template:'<div />'}}]});
  await router.push('/itsco/dashboard?tab=my&my=account&section=my-family-welcome');await router.isReady();
  const w=mount(AccountHub,{attachTo:document.body,props:{activeSection:'account'},slots:{default:'<section id="my-family-welcome">Family editor</section>'},global:{plugins:[router]}});
  await flushPromises();expect(w.get('.acct-hub__main').isVisible()).toBe(true);
  await w.findAll('button').find(b=>b.text().includes('Back to My Account')).trigger('click');
  await flushPromises();expect(w.get('.acct-hub__main').element.style.display).toBe('none');
  await router.push('/itsco/dashboard?tab=my&my=account&section=my-contact-info');await flushPromises();
  expect(w.get('.acct-hub__main').isVisible()).toBe(true);w.unmount();document.body.innerHTML='';
});
