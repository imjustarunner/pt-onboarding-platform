import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
const { get, post, route } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), route: { params: { publicKey: 'resume-test' }, query: { session: 'saved-session-for-second-parent' }, path: '/intake/resume-test' } }));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div />' } }));
let wrapper, progress;
const capture = { signatureData: 'data:image/png;base64,c2F2ZWQ=', signerName: 'Second Guardian' };
beforeEach(() => {
 localStorage.clear(); window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn();
 route.query = { session: 'saved-session-for-second-parent' };
 progress = { submissionId: 121, coGuardianInvite: { dependents: [{ id: 201, firstName: 'Child', insuranceOnFile: true }], paymentCollectionAvailable: false }, intakeData: { progressSnapshot: {
  version: 1, sessionToken: route.query.session, submissionId: 121, step: 2, currentFlowIndex: 0,
  guardian: { firstName: 'Second', lastName: 'Guardian', email: 'second@example.test' },
  clients: [{ firstName: 'Child', lastName: 'Example', dateOfBirth: '2015-01-01' }],
  intakeResponses: { guardian: {}, submission: {}, clients: [{ ownAnswer: 'second parent answer' }] },
  embeddedSmartDisclosure: capture, embeddedPacketSections: { policy_services: capture, hipaa_notice: capture, informed_group_consent: capture }
 } } };
 get.mockReset().mockImplementation(async url => ({ data: url.endsWith('/progress') ? progress : url === '/public-intake/resume-test' ? {
  link: { id: 1, form_type: 'intake', scope_type: 'agency', organization_id: 2, agency_id: 2, intake_steps: [{ id: 'disclosure', type: 'smart_disclosure', label: 'Disclosure' }], intake_fields: [] },
  organization: { id: 2, name: 'Example Agency', organization_type: 'agency' }, agency: { id: 2, name: 'Example Agency' }, templates: []
 } : url.includes('/co-guardian/') ? { invite: { dependents: [{ firstName: 'Child' }], contact: { email: 'second@example.test' } } } : {} }));
 post.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
async function render() { wrapper = mount(PublicIntakeSigningView, { global: { plugins: [createPinia()], stubs: { SmartDisclosureSigningFlow: true, SmartSchoolRoiSigningFlow: true } } }); await flushPromises(); }
it.each([false, true])('restores answers and all signed agreements with invitation parameter present=%s', async withInvite => {
 if (withInvite) route.query.coGuardian = 'original-invitation';
 await render();
 expect(get).toHaveBeenCalledWith('/public-intake/resume-test/progress', expect.objectContaining({ params: { sessionToken: route.query.session, coGuardianToken: withInvite ? 'original-invitation' : undefined } }));
 expect(wrapper.vm.isCoGuardianInvitee).toBe(true);
 expect(wrapper.vm.submissionId).toBe(121);
 expect(wrapper.vm.guardianEmail).toBe('second@example.test');
 expect(wrapper.vm.intakeResponses.clients[0].ownAnswer).toBe('second parent answer');
 expect(wrapper.vm.embeddedSmartDisclosure).toEqual(capture);
 expect(wrapper.vm.embeddedPacketSections).toEqual(progress.intakeData.progressSnapshot.embeddedPacketSections);
 expect(wrapper.vm.coGuardianPaymentCollectionAvailable).toBe(false);
 expect(post.mock.calls.some(([url]) => url.endsWith('/session') || url.endsWith('/finalize'))).toBe(false);
});
it('does not overwrite saved progress when restoring the return link fails', async () => {
 const original = get.getMockImplementation();
 get.mockImplementation(async (...args) => { if (args[0].endsWith('/progress')) throw { response: { data: { error: { message: 'Invitation no longer active' } } } }; return original(...args); });
 await render();
 expect(wrapper.vm.stepError).toBe('Invitation no longer active');
 await wrapper.vm.saveServerProgress();
 expect(post.mock.calls.some(([url]) => url.endsWith('/progress'))).toBe(false);
});
it('does not autosave initial empty state while the saved enrollment is still loading', async () => {
 const original = get.getMockImplementation(); let finish;
 get.mockImplementation(async (...args) => args[0].endsWith('/progress') ? new Promise(resolve => { finish = resolve; }) : original(...args));
 await render();
 await wrapper.vm.saveServerProgress();
 expect(post.mock.calls.some(([url]) => url.endsWith('/progress'))).toBe(false);
 finish({ data: progress }); await flushPromises();
 expect(wrapper.vm.embeddedSmartDisclosure).toEqual(capture);
});
it('preserves an existing signed roster including an old empty child placeholder', async () => {
 const snapshot = progress.intakeData.progressSnapshot;
 snapshot.clients.push({ firstName: '', lastName: '', dateOfBirth: '' });
 snapshot.intakeResponses.clients.push({});
 const roster = [{ fullName: 'Child Example', dateOfBirth: '2015-01-01' }, { fullName: '', dateOfBirth: '' }];
 snapshot.embeddedSmartDisclosure = { ...capture, sharedSigningChildren: roster };
 snapshot.embeddedPacketSections = Object.fromEntries(Object.keys(snapshot.embeddedPacketSections).map(key => [key, { ...capture, sharedSigningChildren: roster }]));
 await render();
 expect(wrapper.vm.embeddedSmartDisclosure).toEqual(snapshot.embeddedSmartDisclosure);
 expect(wrapper.vm.embeddedPacketSections).toEqual(snapshot.embeddedPacketSections);
});
