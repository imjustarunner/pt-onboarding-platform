import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import Insurance from '../PublicIntakeInsuranceStep.vue';
import { compactIntakeProgress, restoreIntakeProgressSnapshot } from '../../../utils/intakeProgressPayload.js';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const wrappers = [];
const clone = value => JSON.parse(JSON.stringify(value));
const drawn = 'data:image/png;base64,' + 'A'.repeat(100);

function open(initial = {}) {
  const responses = ref({ submission: { insuranceInfo: clone(initial) } });
  const names = ref(['Mika QA']);
  const updates = [];
  const Host = defineComponent({ setup: () => () => h(Insurance, {
    modelValue: responses.value.submission.insuranceInfo, guardianName: 'Kai QA', clientNames: names.value,
    savedSignatureData: drawn,
    'onUpdate:modelValue': value => { updates.push(clone(value)); responses.value.submission.insuranceInfo = value; }
  }) });
  const wrapper = mount(Host, { global: {
    provide: { intakeLocale: ref('en'), intakeStringTranslations: ref({}), intakeSessionToken: ref('synthetic-session') },
    directives: { 'address-autocomplete': {} }
  } });
  wrappers.push(wrapper);
  return { wrapper, responses, names, updates, info: () => responses.value.submission.insuranceInfo };
}

function saveAndRestore(host) {
  const compact = compactIntakeProgress({ responses: host.responses.value,
    progressSnapshot: { version: 1, step: 2, sessionToken: 'synthetic-session', intakeResponses: host.responses.value } });
  const stored = JSON.parse(JSON.stringify(compact));
  expect(stored.progressSnapshot.intakeResponses).toBeUndefined();
  return restoreIntakeProgressSnapshot(stored).intakeResponses.submission.insuranceInfo;
}
const cards = host => host.wrapper.findAll('.pi-ins-card').filter(card => card.find('h4.pi-ins-card-title').exists());
const claims = (host, index) => cards(host)[index].find('.claim-fields');
const relationship = (host, index) => claims(host, index).find('select');
function groupInput(card, label) {
  return card.findAll('.form-group').find(group => label.test(group.find('label').text())).find('input:not([type="file"])');
}
function claimInput(host, index, label) {
  return claims(host, index).findAll('label').find(row => label.test(row.text())).find('input');
}
function expectedPolicy(index, relation) {
  const self = relation === 'self';
  return { insurerName: index === 0 ? 'Aetna' : 'Cigna', memberId: `QA-${index ? 'SECONDARY' : 'PRIMARY'}-1113`,
    subscriberName: self ? 'Mika QA' : 'Kai QA', subscriberFirstName: self ? 'Mika' : 'Kai', subscriberLastName: 'QA',
    subscriberDob: self ? '2016-03-12' : '1984-07-09', subscriberSex: self ? 'F' : 'M',
    relationshipToSubscriber: relation, planType: index === 0 ? 'HMO' : 'PPO' };
}
async function enterPolicy(host, index, expected) {
  const card = cards(host)[index];
  await card.find('.pi-ins-typeahead input').setValue(expected.insurerName);
  await groupInput(card, index === 0 ? /Subscriber ID \/ Member ID/ : /^Member ID$/).setValue(expected.memberId);
  await groupInput(card, /^Subscriber [Nn]ame$/).setValue(expected.subscriberName);
  await relationship(host, index).setValue(expected.relationshipToSubscriber);
  const dob = claims(host, index).find('.birth-date-input');
  const [year, month, day] = expected.subscriberDob.split('-');
  await dob.setValue(`${month}/${day}/${year}`); await dob.trigger('blur');
  await claims(host, index).findAll('select')[1].setValue(expected.subscriberSex);
  await claimInput(host, index, /^Subscriber legal first name/).setValue(expected.subscriberFirstName);
  await claimInput(host, index, /^Subscriber legal last name/).setValue(expected.subscriberLastName);
  await claimInput(host, index, /^Plan type/).setValue(expected.planType);
  await flushPromises();
}
function expectVisiblePolicy(host, index, expected) {
  const card = cards(host)[index];
  expect(card.find('.pi-ins-typeahead input').element.value).toBe(expected.insurerName);
  expect(groupInput(card, index === 0 ? /Subscriber ID \/ Member ID/ : /^Member ID$/).element.value).toBe(expected.memberId);
  expect(groupInput(card, /^Subscriber [Nn]ame$/).element.value).toBe(expected.subscriberName);
  expect(relationship(host, index).element.value).toBe(expected.relationshipToSubscriber || '');
  const [year, month, day] = expected.subscriberDob.split('-');
  expect(claims(host, index).find('.birth-date-input').element.value).toBe(`${month}/${day}/${year}`);
  expect(claimInput(host, index, /^Plan type/).element.value).toBe(expected.planType);
}

beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: {} }); api.post.mockResolvedValue({ data: {} }); });
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

it.each([
  ['child', 'self', 0],
  ['self', 'child', 1]
])('preserves chosen primary %s and secondary %s subscribers through compact save and real remount', async (primaryRelation, secondaryRelation, editedIndex) => {
  const primary = expectedPolicy(0, primaryRelation), secondary = expectedPolicy(1, secondaryRelation);
  const original = open(); await flushPromises();
  await original.wrapper.findAll('button').find(button => button.text() === 'I have insurance').trigger('click');
  await enterPolicy(original, 0, primary);
  await original.wrapper.find('.pi-ins-secondary-toggle input').setValue(true);
  await enterPolicy(original, 1, secondary);
  await original.wrapper.find('section.pi-ins-claim-details > label.checkbox-row input').setValue(true);
  await original.wrapper.find('.pi-ins-auth-apply').trigger('click'); await flushPromises();
  expect(original.info()).toMatchObject({ payerChoice: 'insurance', primary, secondary, authorizationAgreed: true, authorizationSignatureData: drawn });
  const saved = saveAndRestore(original); original.wrapper.unmount();
  const resumed = open(saved); await flushPromises();
  expectVisiblePolicy(resumed, 0, primary); expectVisiblePolicy(resumed, 1, secondary);
  expect(resumed.info()).toMatchObject({ primary, secondary, authorizationAgreed: true, authorizationSignatureData: drawn });

  const oldRelationship = editedIndex === 0 ? primaryRelation : secondaryRelation;
  await relationship(resumed, editedIndex).setValue(oldRelationship === 'self' ? 'child' : 'self');
  await relationship(resumed, editedIndex).setValue(oldRelationship); await flushPromises();
  expect(resumed.info()).toMatchObject({ primary, secondary, authorizationAgreed: false, authorizationSignatureData: '', authorizationSignature: '' });
  const changed = saveAndRestore(resumed); resumed.wrapper.unmount();
  const reopened = open(changed); await flushPromises();
  expectVisiblePolicy(reopened, 0, primary); expectVisiblePolicy(reopened, 1, secondary);
  expect(reopened.info().authorizationAgreed).toBe(false);
  expect(reopened.wrapper.find('.pi-ins-auth-apply').exists()).toBe(true);
});

it('restores both incoming policies before another parent-driven watcher can emit stale subscriber fields', async () => {
  const primary = expectedPolicy(0, 'child'), secondary = expectedPolicy(1, 'self');
  const host = open({ payerChoice: 'insurance', primary: { ...expectedPolicy(0, 'self'), insurerName: 'Old primary' },
    hasSecondary: true, secondary: { ...expectedPolicy(1, 'child'), insurerName: 'Old secondary' } });
  await flushPromises(); const checkpoint = host.updates.length;
  await Promise.resolve();
  host.responses.value = { submission: { insuranceInfo: { payerChoice: 'insurance', primary, hasSecondary: true, secondary } } };
  host.names.value = ['Restored Mika QA'];
  await flushPromises();
  expectVisiblePolicy(host, 0, primary); expectVisiblePolicy(host, 1, secondary);
  expect(host.info()).toMatchObject({ primary, secondary });
  expect(host.updates.length).toBeGreaterThan(checkpoint);
  for (const emitted of host.updates.slice(checkpoint)) expect(emitted).toMatchObject({ primary, secondary });
  const resumed = open(saveAndRestore(host)); await flushPromises();
  expectVisiblePolicy(resumed, 0, primary); expectVisiblePolicy(resumed, 1, secondary);
});

it('keeps an unrecorded subscriber relationship blank rather than inventing self or child on resume', async () => {
  const primary = expectedPolicy(0, 'child'), secondary = expectedPolicy(1, 'self');
  delete primary.relationshipToSubscriber; delete secondary.relationshipToSubscriber;
  const original = open({ payerChoice: 'insurance', primary, hasSecondary: true, secondary }); await flushPromises();
  expect(relationship(original, 0).element.value).toBe(''); expect(relationship(original, 1).element.value).toBe('');
  const resumed = open(saveAndRestore(original)); await flushPromises();
  expect(relationship(resumed, 0).element.value).toBe(''); expect(relationship(resumed, 1).element.value).toBe('');
  await groupInput(cards(resumed)[0], /Group number/).setValue('KNOWN-QA-GROUP'); await flushPromises();
  expect(resumed.info().primary.relationshipToSubscriber).toBe('');
  expect(resumed.info().secondary.relationshipToSubscriber).toBe('');
  expect(resumed.info().primary.memberId).toBe(primary.memberId);
});
