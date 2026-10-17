import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Landing from '../AdaptiveJoinLanding.vue';
import { createJoinDesign } from '../../../utils/joinPageDesign';
const quick = { title: 'Interest form', cta: 'Start', bullets: [] };
const full = { title: 'Enrollment', cta: 'Enroll', enabled: false, disabledReason: 'Enrollment not enabled', bullets: [] };
describe('Join public and design renderer', () => {
  it('keeps ITSCO support actions, contact details, custom copy, and legal links in the new layout', async () => {
    const wrapper = mount(Landing, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot/></a>' } } }, props: {
      agencySlug: 'itsco', config: { agency: {name:'ITSCO'}, copy: {helpTitle:'Need help?',helpBody:'Our team is here.',sendMessage:'Message us',value1:'Custom value'} }, quick, full,
      contactPhone:'719-657-7444 Ext 0',contactTel:'+17196577444,0',contactEmail:'Support@ITSCO.health'
    } });
    expect(wrapper.find('.ajl-rail').exists()).toBe(false);
    expect(wrapper.find('.ajl-masthead').text()).toContain('Custom value');
    expect(wrapper.find('.ajl-support-bar a[href="tel:+17196577444,0"]').text()).toBe('719-657-7444 Ext 0');
    expect(wrapper.find('.ajl-support-bar a[href="mailto:Support@ITSCO.health"]').exists()).toBe(true);
    await wrapper.find('.ajl-support-bar button').trigger('click');
    expect(wrapper.emitted('contact-support')).toHaveLength(1);
    expect(wrapper.find('.entry-legal a').attributes('href')).toContain('/itsco/');
    wrapper.unmount();
  });
  it.each(['', 'itsco'])('keeps real intake actions functional and respects unavailable enrollment (%s)', async agencySlug => {
    const wrapper = mount(Landing, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot/></a>' } } }, props: { agencySlug, config: { copy: {} }, quick, full } });
    await wrapper.find('.ajl-card--quick button').trigger('click'); expect(wrapper.emitted('continue')).toEqual([['quick']]);
    expect(wrapper.find('.ajl-card--full button').attributes('disabled')).toBeDefined(); wrapper.unmount();
  });
  it.each(['', 'itsco'])('selects elements in the canvas without starting an intake (%s)', async agencySlug => {
    const wrapper = mount(Landing, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot/></a>' } } }, props: { agencySlug, config: { copy: {} }, quick, full, designMode: true } });
    await wrapper.find('.ajl-card--quick button').trigger('click');
    expect(wrapper.emitted('continue')).toBeUndefined(); expect(wrapper.emitted('select-element')).toEqual([['quick']]); wrapper.unmount();
  });
  it('renders the mobile order, visibility, and copy instead of the desktop version', async () => {
    const layout = { design: createJoinDesign() }; layout.design.views.mobile.copy.welcomeTitle = 'Mobile heading';
    layout.design.views.mobile.order.main = ['welcome', 'cards', 'lead', 'glad']; layout.design.views.mobile.hidden.script = true;
    const wrapper = mount(Landing, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot/></a>' } } }, props: { config: { copy: { welcomeTitle: 'Desktop heading', layout } }, quick, full } });
    const previous = window.innerWidth; window.innerWidth = 390; window.dispatchEvent(new Event('resize')); await wrapper.vm.$nextTick();
    expect(wrapper.find('h1').text()).toBe('Mobile heading'); expect(wrapper.find('.ajl-block--script').exists()).toBe(false);
    expect(wrapper.findAll('.ajl-main > section').map(x => x.attributes('data-design-element'))).toEqual(['welcome', 'cards', 'lead', 'glad']);
    window.innerWidth = previous; wrapper.unmount();
  });
});

it('uses the same welcome layout for other agencies without substituting ITSCO branding', () => {
 const wrapper=mount(Landing,{global:{stubs:{RouterLink:true}},props:{agencySlug:'nlu',config:{agency:{name:'Next Level Up',slug:'nlu'},branding:{enrollmentProduct:'auricwell',logoUrl:'/nlu-logo.svg',colorPalette:{primary:'#125678'}},copy:{}},quick,full}});
 expect(wrapper.find('.ajl--serene').exists()).toBe(true);
 expect(wrapper.find('.ajl-header-logo').attributes('src')).toBe('/nlu-logo.svg');
 expect(wrapper.find('.ajl-platform-brand').text()).toContain('AuricWell');
 expect(wrapper.text()).not.toContain('ITSCO');
 expect(wrapper.find('.ajl').attributes('style')).toContain('--ajl-primary-color: #125678');wrapper.unmount();
});

it('labels outside school enrollment as SchoolCareBridge without AuricWell',()=>{
 const wrapper=mount(Landing,{global:{stubs:{RouterLink:true}},props:{agencySlug:'external',config:{agency:{name:'External Care'},branding:{enrollmentProduct:'schoolcarebridge'},copy:{}},quick,full}});
 expect(wrapper.find('.ajl-platform-brand').text()).toContain('SchoolCareBridge');expect(wrapper.text()).not.toContain('AuricWell');wrapper.unmount();
});
