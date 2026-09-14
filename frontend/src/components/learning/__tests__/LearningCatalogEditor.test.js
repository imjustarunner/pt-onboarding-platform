import {describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Editor from '../LearningCatalogEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
describe('Learning package management',()=>{
 it('creates an editable unpublished provider-discount template and saves its settings',async()=>{
 api.get.mockResolvedValue({data:{catalog:{rates:[],packages:[]}}});api.put.mockImplementation(async (_url,catalog)=>({data:{catalog}}));
 const w=mount(Editor,{props:{agencySlug:'nlu'}});await flushPromises();
 await w.findAll('button').find(b=>b.text()==='Add 6-session / 10% off draft').trigger('click');
 const article=w.find('article');expect(article.text()).toContain('Discount percent');expect(article.find('input[type=checkbox]').element.checked).toBe(false);
 const discount=article.findAll('label').find(l=>l.text().startsWith('Discount percent')).find('input');await discount.setValue(15);
 await w.findAll('button').find(b=>b.text()==='Save learning catalog').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/public/agency-services/nlu/learning-catalog',expect.objectContaining({packages:[expect.objectContaining({published:false,program:'tutoring',components:[expect.objectContaining({pricingMode:'provider-discount',discountPercent:15,sessions:6,minutes:60,hourlyRateCents:null})]})]}));
 expect(w.text()).toContain('Saved.');w.unmount();
 });
});
