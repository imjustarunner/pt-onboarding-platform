import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PacketSectionConsentFlow from '../PacketSectionConsentFlow.vue';
const en = { sectionKey: 'policy_services', locale: 'en', variant: 'self', contentHash: 'english-hash', packetVersion: 4, html: '<p>English terms</p>', title: 'Agreement' };
const es = { ...en, locale: 'es', contentHash: 'spanish-hash', html: '<p>Términos en español</p>', title: 'Acuerdo' };
const saved = { ...en, signatureData: 'demo-signature', acknowledged: true, snapshotHtml: en.html };
const render = props => mount(PacketSectionConsentFlow, { props: { sectionContext: en, locale: 'en', ...props }, global: { stubs: { SignaturePad: true } } });

it('captures the displayed Spanish edition with its own hash, version, audience, and HTML', async () => {
  const wrapper = render({ sectionContext: { ...es, variant: 'parent' }, locale: 'es' });
  await wrapper.get('input[type=checkbox]').setValue(true);
  await wrapper.vm.goNext();
  wrapper.findComponent({ name: 'SignaturePad' }).vm.$emit('signed', 'demo-signature');
  await wrapper.vm.goNext();
  expect(wrapper.emitted('captured')[0][0]).toMatchObject({ locale: 'es', variant: 'parent', contentHash: es.contentHash, packetVersion: 4, snapshotHtml: es.html, title: es.title });
  wrapper.unmount();
});

it.each([{ ...es }, { ...en, contentHash: 'revised', packetVersion: 5 }, { ...en, variant: 'parent' }])('requires fresh acknowledgment and signature for a changed edition: %j', async context => {
  const wrapper = render({ savedCapture: saved });
  expect(wrapper.find('.applied-sig').exists()).toBe(true);
  await wrapper.setProps({ sectionContext: context, locale: context.locale });
  expect(wrapper.get('input[type=checkbox]').element.checked).toBe(false);
  expect(wrapper.find('.applied-sig').exists()).toBe(false);
  await wrapper.vm.goNext();
  expect(wrapper.emitted('captured')).toBeUndefined();
  wrapper.unmount();
});

it('restores a signature only for the same document edition', () => {
  const wrapper = render({ savedCapture: saved });
  expect(wrapper.find('.applied-sig').exists()).toBe(true);
  wrapper.unmount();
});
