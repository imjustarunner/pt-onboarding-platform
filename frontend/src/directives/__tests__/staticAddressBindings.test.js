import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createAddressAutocompleteDirective } from '../addressAutocomplete.js';
import NoteAidDemographicsImportReview from '../../components/clinical/NoteAidDemographicsImportReview.vue';
import OrganizationAgreementsView from '../../views/admin/OrganizationAgreementsView.vue';
import EventTravelLocation from '../../components/events/EventTravelLocation.vue';

vi.mock('../../services/api.js', () => ({ default: { get: vi.fn(async url => ({ data: url.endsWith('/organizations') ? { organizations: [] } : {} })), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
const address = { street: '1600 Pennsylvania Ave NW', city: 'Washington', state: 'DC', postalCode: '20500', formattedAddress: '1600 Pennsylvania Ave NW, Washington, DC 20500' };
const client = { post: vi.fn() };
const wrappers = [];
const directive = () => createAddressAutocompleteDirective({ client, debounceMs: 0 });
const options = () => ({ attachTo: document.body, global: { directives: { 'address-autocomplete': directive() }, stubs: { RouterLink: true } } });
const parsed = suffix => ({ fullName: `Synthetic ${suffix}`, dateOfBirth: '2016-03-12', addressStreet: `${suffix} old street`, addressCity: `${suffix} old city`, addressState: 'CO', addressZip: '80203', addressApt: `${suffix} unit`, email: `${suffix}@example.test`, timezone: 'America/Denver' });

beforeEach(() => {
  client.post.mockReset().mockImplementation(async url => ({ data: url.endsWith('/suggest') ? { suggestions: [{ label: address.formattedAddress, selectionToken: 'opaque-test-selection' }] } : { address } }));
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.replaceChildren(); });
async function typeAndChoose(input) {
  await input.setValue('1600 Pennsylvania');
  await vi.waitFor(() => expect(document.querySelector('[role=option]')).not.toBeNull());
  document.querySelector('[role=option]').click();
  await flushPromises();
}

it('fills the actual import-review address group and leaves the other child, unit and identity untouched', async () => {
  const one = mount(NoteAidDemographicsImportReview, { ...options(), props: { open: true, clientId: 101, agencyId: 450 } });
  const two = mount(NoteAidDemographicsImportReview, { ...options(), props: { open: true, clientId: 102, agencyId: 450 } });
  wrappers.push(one, two);
  one.vm.model = parsed('one'); two.vm.model = parsed('two'); await flushPromises();
  const other = JSON.parse(JSON.stringify(two.vm.model));
  await typeAndChoose(new DOMWrapper(document.querySelectorAll('.na-modal')[0].querySelector('input[role=combobox]')));
  expect(one.vm.model).toMatchObject({ fullName: 'Synthetic one', dateOfBirth: '2016-03-12', email: 'one@example.test', addressApt: 'one unit', addressStreet: address.street, addressCity: address.city, addressState: address.state, addressZip: address.postalCode });
  expect(two.vm.model).toEqual(other);
  const suggestion = client.post.mock.calls.find(([url]) => url.endsWith('/suggest'));
  expect(Object.keys(suggestion[1]).sort()).toEqual(['locale', 'query', 'sessionToken']);
  expect(JSON.stringify(suggestion[1])).not.toContain('Synthetic one');
  expect(JSON.stringify(suggestion[1])).not.toContain('one@example.test');
});

it('discards an in-flight selected address after the actual review switches to another client', async () => {
  let resolveSelection;
  client.post.mockImplementation(url => url.endsWith('/suggest') ? Promise.resolve({ data: { suggestions: [{ label: address.formattedAddress, selectionToken: 'opaque-test-selection' }] } }) : new Promise(resolve => { resolveSelection = resolve; }));
  const wrapper = mount(NoteAidDemographicsImportReview, { ...options(), props: { open: true, clientId: 101, agencyId: 450 } });
  wrappers.push(wrapper); wrapper.vm.model = parsed('one'); await flushPromises();
  const input = new DOMWrapper(document.querySelector('.na-modal input[role=combobox]')); await input.setValue('1600 Pennsylvania');
  await vi.waitFor(() => expect(document.querySelector('[role=option]')).not.toBeNull());
  document.querySelector('[role=option]').click();
  await wrapper.setProps({ clientId: 102 }); wrapper.vm.model = parsed('two'); await flushPromises();
  resolveSelection({ data: { address } }); await flushPromises();
  expect(wrapper.vm.model).toEqual(parsed('two'));
});

it('uses the actual two-party agreement textareas without overwriting the other party or notice text', async () => {
  const wrapper = mount(OrganizationAgreementsView, options()); wrappers.push(wrapper); await flushPromises();
  const party = label => ({ legalName: `Synthetic ${label}`, address: `${label} original address`, noticeContact: `${label} private notice`, hipaaRole: 'Recorded role' });
  wrapper.vm.agencyId = '450'; wrapper.vm.actor = { operator: false }; wrapper.vm.selected = { id: 'test-agreement', kind: 'agreement', revision: 1, data: { type: 'baa', status: 'draft', title: 'Synthetic draft' } };
  wrapper.vm.draft = { parties: { practice: party('practice'), operator: party('operator') }, body: 'Retained draft body', terms: 'Retained terms', signers: [{ accountId: '', capacity: '' }, { accountId: '', capacity: '' }] };
  await flushPromises(); const other = JSON.parse(JSON.stringify(wrapper.vm.draft.parties.operator));
  await typeAndChoose(wrapper.findAll('.party-grid fieldset')[0].get('textarea[autocomplete], textarea[role=combobox]'));
  expect(wrapper.vm.draft.parties.practice.address).toBe(address.formattedAddress);
  expect(wrapper.vm.draft.parties.practice.noticeContact).toBe('practice private notice');
  expect(wrapper.vm.draft.parties.operator).toEqual(other);
  expect(wrapper.vm.draft.body).toBe('Retained draft body');
});

it('keeps the common travel-location parent v-model updated through suggestion selection', async () => {
  const model = ref({ kind: 'other', address: '' });
  const owner = ref('owner-one');
  const Host = defineComponent({ setup: () => () => h(EventTravelLocation, { modelValue: model.value, 'onUpdate:modelValue': value => { model.value = value; }, label: 'Start location', scopeKey: owner.value }) });
  const wrapper = mount(Host, options()); wrappers.push(wrapper);
  await typeAndChoose(wrapper.get('input'));
  expect(model.value).toEqual({ kind: 'other', address: address.formattedAddress });
});

it('discards travel suggestions after its explicit owner scope changes despite equal address text', async () => {
  let resolveSelection;
  client.post.mockImplementation(url => url.endsWith('/suggest') ? Promise.resolve({ data: { suggestions: [{ label: address.formattedAddress, selectionToken: 'opaque-test-selection' }] } }) : new Promise(resolve => { resolveSelection = resolve; }));
  const model = ref({ kind: 'other', address: '' }); const owner = ref('owner-one');
  const Host = defineComponent({ setup: () => () => h(EventTravelLocation, { modelValue: model.value, 'onUpdate:modelValue': value => { model.value = value; }, label: 'Start location', scopeKey: owner.value }) });
  const wrapper = mount(Host, options()); wrappers.push(wrapper);
  await wrapper.get('input').setValue('1600 Pennsylvania');
  await vi.waitFor(() => expect(document.querySelector('[role=option]')).not.toBeNull());
  document.querySelector('[role=option]').click();
  owner.value = 'owner-two'; await flushPromises();
  resolveSelection({ data: { address } }); await flushPromises();
  expect(model.value).toEqual({ kind: 'other', address: '1600 Pennsylvania' });
});
