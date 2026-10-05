import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedIntakeDocuments } from '../sharedIntakeDocuments.service.js';
import { validateMultiChildSigning, validateSharedSigningCaptures, intakeChildRoster, areAllIntakePacketsReady } from '../../utils/multiChildIntake.js';
import { buildCompletedIntakeRecord } from '../completedIntakeRecord.service.js';

const family = () => ({
  clients: [{ firstName: 'Alex', lastName: 'Example' }, { firstName: 'Blair', lastName: 'Example' }],
  responses: { clients: [
    { child_dob: '2012-02-03', client_grade: '8', psc_1: 'Often' },
    { child_dob: '2017-06-07', client_grade: '3', psc_1: 'Never' }
  ], submission: {} },
  multiClientSignatureConsent: { accepted: true, acceptedAt: '2026-10-05T18:00:00Z', clientCount: 2, version: 1 },
  packetSections: { informed_group_consent: { acknowledged: true, signatureData: 'one-parent-signature' } },
  smartDisclosure: { acknowledged: true, signatureData: 'one-parent-signature' },
  smartSchoolRoi: { clientFullName: 'Alex Example', clientDateOfBirth: '2012-02-03', signatureData: 'one-parent-signature', staffDecisions: [{ schoolStaffUserId: 40, decision: 'none' }] }
});
const clients = [{ id: 101 }, { id: 102 }];

test('one shared signing session generates isolated agreements and answer records for both children', async () => {
  const intakeData = family();
  const before = JSON.stringify(intakeData);
  const calls = [];
  const result = await buildSharedIntakeDocuments({ clients, intakeData, generate: async args => {
    calls.push(args);
    const child = intakeChildRoster(args.intakeData)[0];
    assert.equal(args.intakeData.smartSchoolRoi.clientFullName, child.fullName);
    assert.equal(args.intakeData.smartSchoolRoi.clientDateOfBirth, child.dateOfBirth);
    assert.equal(args.intakeData.smartSchoolRoi.signatureData, 'one-parent-signature');
    assert.equal(args.intakeData.smartSchoolRoi.staffDecisions[0].decision, 'none');
    const record = JSON.stringify(buildCompletedIntakeRecord({ submission: { intake_data: args.intakeData } }).sections);
    assert.ok(record.includes(child.fullName));
    assert.ok(!record.includes(args.index === 0 ? 'Blair' : 'Alex'));
    return ['consent', 'policy', 'hipaa', 'disclosure', 'roi'].map(kind => `${args.client.id}/${kind}.pdf`);
  } });
  assert.equal(calls.length, 2);
  assert.equal(result.failures.size, 0);
  assert.equal(result.pathsByClient.get(101).length, 5);
  assert.ok(result.pathsByClient.get(102).every(path => path.startsWith('102/')));
  assert.equal(JSON.stringify(intakeData), before);
});

test('one failed child never receives the other child’s agreements', async () => {
  const result = await buildSharedIntakeDocuments({ clients, intakeData: family(), generate: async ({ client }) => {
    if (client.id === 101) throw new Error('Storage failed');
    return ['102/consent.pdf'];
  } });
  assert.equal(result.pathsByClient.has(101), false);
  assert.equal(result.failures.has(101), true);
  assert.deepEqual(result.pathsByClient.get(102), ['102/consent.pdf']);
});

test('shared signing requires explicit, dated consent for the current number of children', () => {
  assert.equal(validateMultiChildSigning({ intakeData: family(), clients }), null);
  for (const override of [null, { accepted: false }, { accepted: 'true', acceptedAt: '2026-10-05', clientCount: 2 }, { accepted: true, acceptedAt: 'bad', clientCount: 2 }, { accepted: true, acceptedAt: '2026-10-05', clientCount: 3 }]) {
    const data = family(); data.multiClientSignatureConsent = override;
    assert.ok(validateMultiChildSigning({ intakeData: data, clients }));
  }
  const missingDob = family(); delete missingDob.responses.clients[1].child_dob;
  assert.ok(validateMultiChildSigning({ intakeData: missingDob, clients }));
  assert.equal(validateMultiChildSigning({ intakeData: { clients: [{ firstName: 'One' }] } }), null);
});

test('changes to the roster after a shared agreement was signed require review', () => {
  const data = family();
  data.smartSchoolRoi.sharedSigningChildren = intakeChildRoster(data);
  assert.equal(validateSharedSigningCaptures(data), null);
  data.responses.clients[1].child_dob = '2018-06-07';
  assert.ok(validateSharedSigningCaptures(data));
});

test('readiness requires all distinct child downloads, not one packet or duplicate links', () => {
  const args = { status: 'submitted', intakeData: family(), downloadUrl: 'legacy-family.pdf' };
  assert.equal(areAllIntakePacketsReady({ ...args, clientBundles: [{ clientId: 101, downloadUrl: 'a.pdf' }] }), false);
  assert.equal(areAllIntakePacketsReady({ ...args, clientBundles: [{ clientId: 101, downloadUrl: 'a.pdf' }, { clientId: 101, downloadUrl: 'a.pdf' }] }), false);
  assert.equal(areAllIntakePacketsReady({ ...args, clientBundles: [{ clientId: 101, downloadUrl: 'a.pdf' }, { clientId: 102, downloadUrl: 'b.pdf' }] }), true);
});

test('child-bound PDF fields replace the first sibling’s prefill, including custom field IDs', async () => {
  const { childDocumentValues } = await import('../../utils/multiChildIntake.js');
  const values = childDocumentValues({ intakeData: family(), clientIndex: 1,
    base: { client_dob: '2012-02-03', grade: '8', dob_box: '2012-02-03', guardian_first: 'Pat' },
    fieldDefinitions: [{ id: 'dob_box', prefillKey: 'client_dob' }, { id: 'grade_box', prefill_key: 'client_grade' }] });
  assert.equal(values.client_full_name, 'Blair Example');
  assert.equal(values.dob_box, '2017-06-07');
  assert.equal(values.grade_box, '3');
  assert.equal(values.guardian_first, 'Pat');
  const absent = family(); delete absent.responses.clients[1].child_dob;
  assert.equal(childDocumentValues({ intakeData: absent, clientIndex: 1, base: { client_dob: '2012-02-03' } }).client_dob, '');
});

test('missing required agreements are rejected while deliberately optional agreements stay optional', async () => {
  const { validateRequiredSharedSignatures } = await import('../../utils/multiChildIntake.js');
  const steps = [{ type: 'packet_informed_group_consent', label: 'Consent' }, { type: 'school_roi' }, { type: 'smart_disclosure' }];
  assert.equal(validateRequiredSharedSignatures(steps, family()), null);
  const data = family(); data.smartDisclosure.signatureData = '';
  assert.match(validateRequiredSharedSignatures(steps, data), /review and sign/);
  assert.equal(validateRequiredSharedSignatures([{ type: 'smart_disclosure', required: false }], data), null);
});

test('individual answer packets show only their own release identity and child-specific coverage rows', () => {
  const data = family();
  data.responses.submission.insuranceInfo = { medicaidByClient: [{ clientIndex: 0, memberId: 'A-ONLY' }, { clientIndex: 1, memberId: 'B-ONLY' }] };
  const sections = JSON.stringify(buildCompletedIntakeRecord({ submission: { intake_data: data }, clientIndex: 1 }).sections);
  assert.ok(sections.includes('Blair Example')); assert.ok(!sections.includes('Alex Example'));
  assert.ok(sections.includes('2017-06-07')); assert.ok(!sections.includes('2012-02-03'));
  assert.ok(sections.includes('B-ONLY')); assert.ok(!sections.includes('A-ONLY'));
});

test('staff chart records scope a shared submission through its child associations', async () => {
  const { chartIntakeDataForClient } = await import('../../utils/multiChildIntake.js');
  const scoped = chartIntakeDataForClient(family(), [{ client_id: 101 }, { client_id: 102 }], 102, 101);
  assert.equal(scoped.clients[0].fullName, 'Blair Example');
  assert.equal(scoped.responses.clients[0].psc_1, 'Never');
  assert.equal(scoped.smartSchoolRoi.clientFullName, 'Blair Example');
  assert.deepEqual(chartIntakeDataForClient(family(), [], 102, 101), {});
});

test('translated forms are regenerated from the version the parent actually signed', async () => {
  const { signedPacketTemplate } = await import('../../utils/multiChildIntake.js');
  const en = { id: 1, name: 'Consent' }, es = { id: 2, name: 'Consentimiento' };
  assert.equal(signedPacketTemplate(en, [en, es], new Map([[2, {}]]), { 1: 2 }), es);
  assert.equal(signedPacketTemplate(es, [en, es], new Map([[1, {}]]), { 1: 2 }), en);
  assert.equal(signedPacketTemplate(en, [en, es], new Map([[99, {}]]), { 1: 2 }), null);
});


test('a returning-family match cannot silently drop the new sibling and report completion', async () => {
  let generated = 0;
  const result = await buildSharedIntakeDocuments({ clients: [{ id: 101 }], intakeData: family(), generate: async () => { generated++; return ['first-only.pdf']; } });
  assert.equal(generated, 0);
  assert.equal(result.pathsByClient.size, 0);
  assert.equal(result.failures.has(101), true);
});
