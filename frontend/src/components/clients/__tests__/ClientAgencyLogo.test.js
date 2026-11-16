import { expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('../../../utils/uploadsUrl',()=>({toUploadsUrl:path=>path.startsWith('http')||path.startsWith('/assets/')?path:`/api/uploads/${path.replace(/^\/?uploads\//,'')}`}));
vi.mock('../../../utils/tenantBrandAssets',()=>({tenantFaviconUrl:()=>''}));
import Logo from '../ClientAgencyLogo.vue';
it('supports stored agency icon fields and uses the uploads host',()=>{
 const wrapper=mount(Logo,{props:{agency:{name:'Example Agency',icon_file_path:'/uploads/icons/example.png'}}});expect(wrapper.get('img').attributes('src')).toBe('/api/uploads/icons/example.png');expect(wrapper.get('img').attributes('alt')).toBe('Example Agency logo');wrapper.unmount();
});
it('falls back from a failed logo to an icon and then readable agency initials',async()=>{
 const wrapper=mount(Logo,{props:{agency:{name:'Example Agency',logo_url:'https://example.invalid/logo.png',icon_file_path:'icons/example.png'}}});await wrapper.get('img').trigger('error');expect(wrapper.get('img').attributes('src')).toBe('/api/uploads/icons/example.png');await wrapper.get('img').trigger('error');expect(wrapper.text()).toBe('EA');expect(wrapper.get('span').attributes('aria-label')).toBe('Example Agency');wrapper.unmount();
});
