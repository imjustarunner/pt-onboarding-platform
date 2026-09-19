import {describe,it,expect,vi,beforeEach} from 'vitest';
import {reactive} from 'vue';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../LegalDocumentView.vue';
import api from '../../../services/api';
const state=vi.hoisted(()=>({platformBranding:{},initializePortalTheme:vi.fn(),fetchPlatformBranding:vi.fn()}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>reactive(state)}));
vi.mock('vue-router',()=>({useRoute:()=>({meta:{legalDocType:'platformhipaa'}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();state.platformBranding={};api.get.mockResolvedValue({data:{role:'super_admin'}});});
describe('inline legal document publishing',()=>{
 it('hides editing from visitors and ordinary admins',async()=>{
  for(const role of [null,'admin','provider']){api.get.mockResolvedValue({data:{role}});const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.find('.legal-editor').exists()).toBe(false);w.unmount();}
 });
 it('publishes a link and immediately displays the saved document',async()=>{
  const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.get('.legal-editor button').trigger('click');await w.get('input[type=url]').setValue('https://example.com/hipaa.pdf');
  api.post.mockResolvedValue({data:{branding:{platform_hipaa_url:'https://example.com/hipaa.pdf'}}});await w.get('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/platform-branding/legal-documents/platformhipaa',{url:'https://example.com/hipaa.pdf'});expect(w.get('iframe').attributes('src')).toBe('https://example.com/hipaa.pdf');expect(w.get('[role=status]').text()).toContain('published');w.unmount();
 });
 it('uploads the selected PDF with the publish action',async()=>{
  const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.get('.legal-editor button').trigger('click');await w.get('input[value=upload]').setValue(true);
  const pdf=new File(['%PDF-1.7'],'hipaa.pdf',{type:'application/pdf'}),input=w.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[pdf]});await input.trigger('change');
  api.post.mockResolvedValue({data:{branding:{platform_hipaa_url:'https://example.com/uploaded.pdf'}}});await w.get('form').trigger('submit');await flushPromises();expect(api.post.mock.calls[0][1].get('file')).toBe(pdf);expect(w.get('iframe').attributes('src')).toContain('uploaded.pdf');w.unmount();
 });
 it('keeps the editor open and preserves the current document when saving fails',async()=>{
  state.platformBranding={platform_hipaa_url:'https://example.com/old.pdf'};const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.get('.legal-editor button').trigger('click');await w.get('input[type=url]').setValue('https://example.com/new.pdf');api.post.mockRejectedValue({response:{data:{error:{message:'Upload failed'}}}});await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=alert]').text()).toBe('Upload failed');expect(w.get('iframe').attributes('src')).toContain('old.pdf');expect(w.get('input[type=url]').element.value).toContain('new.pdf');w.unmount();
 });
 it('rejects script URLs before publishing',async()=>{
  const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.get('.legal-editor button').trigger('click');await w.get('input[type=url]').setValue('javascript:alert(1)');await w.get('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.find('[role=alert]').exists()).toBe(true);w.unmount();
 });
});
