// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ReferenceWorkspace from '../ReferenceWorkspace.vue';
const api = vi.hoisted(() => ({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api', () => ({default:api}));
const refs = [{name:'First Reference',email:'first@example.test'},{name:'Second Reference',email:'second@example.test'}];
beforeEach(() => {vi.clearAllMocks();api.post.mockResolvedValue({data:{sent:[{id:1}]}});api.get.mockImplementation(async url => ({data:url.endsWith('reference-workspace')?{contacts:[],questionnaire:{scale:'1–5',traits:[]}}:[]}));});
describe('per-reference workspace', () => {
  it('sends only the selected reference and includes a deadline', async () => {
    const wrapper = mount(ReferenceWorkspace,{props:{userId:2,agencyId:1,references:refs}});await flushPromises();
    await wrapper.findAll('nav button')[1].trigger('click');
    await wrapper.findAll('button').find(b=>b.text()==='Email online reference link').trigger('click');await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({referenceIndex:1,onlyIfNotSent:false});expect(api.post.mock.calls[0][1].deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('saves a private phone-completion note without requiring invented questionnaire answers', async () => {
    const wrapper = mount(ReferenceWorkspace,{props:{userId:2,agencyId:1,references:refs}});await flushPromises();
    await wrapper.findAll('form select')[1].setValue('completed');await wrapper.find('textarea').setValue('Completed phone call with PO.');await wrapper.find('form').trigger('submit');await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({referenceIndex:0,method:'phone',outcome:'completed',note:'Completed phone call with PO.',responses:null});
  });
});
