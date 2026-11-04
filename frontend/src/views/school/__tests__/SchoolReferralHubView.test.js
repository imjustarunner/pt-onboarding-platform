import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SchoolReferralHubView from '../SchoolReferralHubView.vue';
import api from '../../../services/api';

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' }, query: {} }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, slug: 'itsco' } }) }));
vi.mock('../../../services/api', () => ({ default: { get:vi.fn(), post:vi.fn(), defaults:{baseURL:'https://app.itsco.health/api'} } }));
vi.mock('qrcode', () => ({ default: { toDataURL:vi.fn().mockResolvedValue('data:image/png,qr') } }));
vi.mock('../../../components/school/redesign/SchoolPacketTemplateEditor.vue', () => ({ default:{template:'<div />'} }));

let wrapper;
const packet = (id, extra={}) => ({id,public_key:`packet-${id}`,form_type:'intake',language_code:'en',is_active:1,...extra});
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => {
    if(url==='/agencies/2/schools')return {data:[{id:123,name:'Example school',slug:'example-school'}]};
    if(url==='/agencies/2/school-intake-master')return {data:{master:{title:'Enrollment master',version:2,intake_steps:[]}}};
    if(url==='/public-intake/school/123')return {data:{link:packet(2),links:[packet(1),packet(2),packet(3),packet(4,{language_code:'es'})]}};
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(() => wrapper?.unmount());

describe('SchoolReferralHubView sharing', () => {
  it('shares one API-selected bilingual packet and canonical school finder/paper URLs', async () => {
    wrapper=mount(SchoolReferralHubView,{global:{stubs:{RouterLink:true}}});
    await flushPromises();
    const tiles=wrapper.findAll('.srh-link-tile');
    expect(tiles).toHaveLength(3);
    expect(tiles[0].text()).toContain('Digital enrollment — English / Español');
    expect(tiles[0].text()).toContain('flag button');
    expect(tiles[0].get('input').element.value).toBe('https://schoolcarebridge.org/intake/packet-2');
    expect(tiles[1].get('input').element.value).toBe('https://schoolcarebridge.org/api/public/schools/example-school/printable-packet?locale=en');
    expect(tiles[2].get('input').element.value).toBe('https://schoolcarebridge.org/api/public/schools/example-school/printable-packet?locale=es');
    expect(wrapper.get('.srh-public-finder-meta input').element.value).toBe('https://schoolcarebridge.org/itsco/school-referral');
  });

  it('offers one enrollment creation action when no active packet exists', async () => {
    const existing=api.get.getMockImplementation();
    api.get.mockImplementation(async url => url==='/public-intake/school/123'
      ? Promise.reject({response:{status:404}}) : existing(url));
    wrapper=mount(SchoolReferralHubView,{global:{stubs:{RouterLink:true}}});
    await flushPromises();
    expect(wrapper.text()).toContain('No enrollment packet is configured yet.');
    const create=wrapper.findAll('button').filter(button=>button.text()==='Create enrollment packet');
    expect(create).toHaveLength(1);
    expect(wrapper.findAll('.srh-link-tile')).toHaveLength(3);
  });
});
