import { mount, flushPromises } from '@vue/test-utils';
import { it, expect, vi } from 'vitest';
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Example Agency' }, userAgencies: [] }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({}) }));
import Preview from '../ProviderUpdateLivePreview.vue';
it('shows selected profile pay values without a signing or sending action', async () => {
 const person = { provider: { id: 9, first_name: 'Rachel', last_name: 'Example', role: 'provider' },
  compensation: { categoryLabel: 'Pre-licensed', level: 3, directRate: '42.00', indirectRate: null },
  amendment: { title: 'Fall amendment', status: 'Draft preview', effectiveDate: '2026-10-15' }, offices: [], license: {}, supervision: null };
 const w = mount(Preview, { props: { personPreview: person, sections: [{ key: 'amendments', meta: { title: 'Amendment Updates' } }], initialPageKey: 'amendments' }, global: { stubs: { WorkplaceHandbookReader: true, ProviderUpdateAdminUpdateEmbed: true } } });
 await flushPromises();
 // Use the visible card if the page grouping opens the overview first.
 const card = w.find('.pu-card'); if (card.exists()) await card.trigger('click');
 expect(w.text()).toContain('Rachel Example'); expect(w.text()).toContain('$42.00'); expect(w.text()).toContain('Not configured');
 expect(w.text()).toContain('Final amendment wording is still being developed');
 expect(w.findAll('button').some(button => /sign|send|submit/i.test(button.text()))).toBe(false); w.unmount();
});
it('an empty personal section selection stays empty', async () => {
 const w = mount(Preview, { props: { personPreview: { provider: { first_name: 'Sample' } }, sections: [] }, global: { stubs: { WorkplaceHandbookReader: true, ProviderUpdateAdminUpdateEmbed: true } } });
 expect(w.findAll('.pu-card')).toHaveLength(0); w.unmount();
});
it('renders the actual signed choices on the standalone texting preview page',async()=>{
 const choices={agencyId:2,phone:'',choices:{notifications:false,messageAlerts:false,polling:false},accessRequests:{inAppTexting:false,personalSmsRelay:false},activation:[],disclosure:{brandName:'ITSCO',legalName:'ITSCO, LLC',policyReady:false,programs:[],choices:[{key:'notifications',label:'Staff reminders',description:'Optional reminders'}],accessRequests:[{key:'personalSmsRelay',label:'Future forwarding request',description:'Not enabled by this request'}]}};
 const w=mount(Preview,{props:{personPreview:{provider:{first_name:'Aunya'},communicationChoices:choices},sections:[{key:'notification_prefs',meta:{title:'Texting & Communication Choices'}}],initialPageKey:'texting_choices'},global:{stubs:{WorkplaceHandbookReader:true,ProviderUpdateAdminUpdateEmbed:true}}});await flushPromises();const card=w.find('.pu-card');if(card.exists())await card.trigger('click');expect(w.text()).toContain('Future forwarding request');expect(w.text()).toContain('Staff reminders');expect(w.find('fieldset[disabled]').exists()).toBe(true);w.unmount();
});
