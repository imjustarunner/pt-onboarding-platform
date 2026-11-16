import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, onMounted, reactive } from 'vue';
import { expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({route:{meta:{guestPaymentSurface:true},fullPath:'/billing/guest#first'},mounted:0}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({user:{role:'assistant'},isAuthenticated:true})}));
import App from '../../App.vue';
it('uses the standalone guest surface for a logged-in assistant and remounts for another private invoice',async()=>{
  m.route=reactive(m.route);
  const Guest=defineComponent({setup(){onMounted(()=>m.mounted++);return()=>h('main','Private payment amount');}});
  const wrapper=mount(App,{global:{stubs:{RouterView:Guest,AssistantAppShell:{template:'<aside>Assistant workspace<slot/></aside>'},AppWorkspace:true}}});
  expect(wrapper.text()).toBe('Private payment amount');expect(m.mounted).toBe(1);
  m.route.fullPath='/billing/guest#second';await nextTick();expect(m.mounted).toBe(2);wrapper.unmount();
});
