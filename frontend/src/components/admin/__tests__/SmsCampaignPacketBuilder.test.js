import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
import api from '../../../services/api';
import Builder from '../SmsCampaignPacketBuilder.vue';
const data={profile:{brandName:'Coaching',legalName:'Coaching LLC',ownership:'own',volume:'low'},missing:[],steps:[],published:false,links:{},registration:{approved:false,numberLinked:false},markdown:'Packet'};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data});api.put.mockResolvedValue({data});});
async function open(){const w=mount(Builder,{props:{agencyId:4}});w.get('details').element.open=true;await w.get('details').trigger('toggle');await flushPromises();return w;}
describe('campaign packet builder',()=>{
 it('loads the current agency only when opened and never submits to Vonage',async()=>{const w=mount(Builder,{props:{agencyId:4}});expect(api.get).not.toHaveBeenCalled();w.get('details').element.open=true;await w.get('details').trigger('toggle');await flushPromises();expect(api.get).toHaveBeenCalledWith('/sms-numbers/agency/4/campaign-packets/polling');expect(api.put).not.toHaveBeenCalled();});
 it('requires review and regeneration after a change before publishing',async()=>{const w=await open();const publish=w.findAll('button').find(b=>b.text()==='Publish branded review pages');expect(publish.attributes('disabled')).toBeDefined();await w.get('input[type=checkbox]').setValue(true);expect(publish.attributes('disabled')).toBeUndefined();await w.findAll('input')[0].setValue('Changed LLC');expect(publish.attributes('disabled')).toBeDefined();});
 it('clears old tenant data when the agency changes',async()=>{const w=await open();await w.setProps({agencyId:5});expect(w.find('form').exists()).toBe(false);expect(w.text()).not.toContain('Coaching LLC');});
});
