import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSharedIntakeDocuments } from '../../services/sharedIntakeDocuments.service.js';

// Exercise the real controller artifact functions with storage/DB/PDF boundaries
// replaced, so no real patient records or external services are required.
const source = fs.readFileSync(new URL('../publicIntake.controller.js', import.meta.url), 'utf8');
function load(name, next, deps) {
  const body = source.slice(source.indexOf(`async function ${name}(`), source.indexOf(next, source.indexOf(`async function ${name}(`)));
  return new Function(...Object.keys(deps), `${body}; return ${name};`)(...Object.values(deps));
}
function setup() {
  const generated = [], attached = [], acknowledged = [], permissions = [];
  const deps = {
    PACKET_SECTION_KEYS: { INFORMED_GROUP_CONSENT: 'informed_group_consent', POLICY_SERVICES: 'policy_services', HIPAA_NOTICE: 'hipaa_notice' },
    Client: { findById: async id => ({ id, agency_id: 10, organization_id: 20, full_name: id === 101 ? 'Alex Example' : 'Blair Example' }) },
    linkLooksLikeOfficeIntake: () => false,
    buildPacketSectionContext: async ({ sectionKey }) => ({ title: sectionKey, html: sectionKey, contentHash: 'signed-content', packetVersion: '1' }),
    buildPacketSectionSignedHtml: ({ sectionContext }) => sectionContext.html,
    buildSignerFromSubmission: () => ({ firstName: 'Pat' }),
    buildWorkflowData: () => ({}), buildAuditTrail: ({ submission }) => ({ clientName: submission.client_name }),
    PublicIntakeSigningService: { generateSignedDocument: async args => {
      generated.push(args); return { storagePath: `signed-${generated.length}.pdf`, pdfHash: 'hash' };
    } },
    attachSignedPdfToClient: async args => { attached.push(args); return { ok: true, phiDoc: { id: attached.length } }; },
    persistPacketSectionAcknowledgement: async args => acknowledged.push(args),
    buildSmartDisclosureContext: async () => ({ providers: [] }),
    normalizeSmartDisclosureResponse: ({ intakeData }) => ({ ...intakeData.smartDisclosure, providers: [] }),
    validateSmartDisclosureResponse: () => ({ valid: true }),
    buildSmartDisclosureHtml: () => 'Disclosure',
    persistDisclosureAcknowledgement: async args => acknowledged.push(args),
    hasProgrammedSchoolRoiStep: () => true,
    resolveIntakeOrgContext: async () => ({ organization: { id: 20 }, agency: { id: 10 } }),
    buildSmartSchoolRoiContext: async ({ boundClient }) => ({ client: boundClient, school: { name: 'Example School' } }),
    resolveSmartSchoolRoiTemplate: async () => ({ id: 90, name: 'School release' }),
    normalizeSmartSchoolRoiResponse: ({ intakeData }) => ({ ...intakeData.smartSchoolRoi }),
    validateSmartSchoolRoiResponse: () => ({ valid: true }),
    persistClientDateOfBirthIfMissing: async () => {},
    buildSmartSchoolRoiHtml: ({ response }) => `${response.clientFullName} ${response.clientDateOfBirth}`,
    IntakeSubmissionDocument: { create: async args => args },
    applySmartSchoolRoiAccessDecisions: async args => { permissions.push(args); return {}; },
    logAuditEvent: async () => {}, applyClientRoiCompletion: async () => {}, notifySchoolRoiCompletedForBackoffice: async () => {}
  };
  return { deps, generated, attached, acknowledged, permissions };
}

test('both children receive all three consents, disclosure, and individualized ROI from one signature', async () => {
  const state = setup();
  const section = load('persistPacketSectionFromIntakeData', 'async function persistEmbeddedDisclosureForClient', state.deps);
  const disclosure = load('persistEmbeddedDisclosureForClient', 'async function persistEmbeddedRoiForClient', state.deps);
  const roi = load('persistEmbeddedRoiForClient', 'const normalizeName = ', state.deps);
  const signed = { acknowledged: true, signatureData: 'parent-signature' };
  const intakeData = {
    clients: [{ fullName: 'Alex Example', dateOfBirth: '2012-02-03' }, { fullName: 'Blair Example', dateOfBirth: '2017-06-07' }],
    packetSections: { informed_group_consent: signed, policy_services: signed, hipaa_notice: signed },
    smartDisclosure: signed,
    smartSchoolRoi: { ...signed, clientFullName: 'Alex Example', clientDateOfBirth: '2012-02-03', staffDecisions: [{ schoolStaffUserId: 9, decision: 'none' }] }
  };
  const results = await buildSharedIntakeDocuments({ clients: [{ id: 101 }, { id: 102 }], intakeData, generate: async ({ client, index, intakeData }) => {
    const args = { intakeData, updatedSubmission: { client_id: client.id }, organization: { id: 20 }, agency: { id: 10 }, link: {}, submissionId: 1, now: new Date(), allAllowedTemplates: [], clientIndex: index };
    return [...await section(args), ...await disclosure(args), ...await roi(args)];
  } });
  assert.deepEqual([...results.failures].map(([id, error]) => [id, error.message]), []);
  for (const id of [101, 102]) {
    assert.equal(results.pathsByClient.get(id).length, 5);
    assert.equal(state.attached.filter(doc => doc.clientId === id).length, 5);
    assert.equal(state.acknowledged.filter(ack => ack.clientId === id).length, 4);
    const permission = state.permissions.find(p => p.clientId === id);
    assert.equal(permission.response.staffDecisions[0].decision, 'none');
    assert.equal(permission.response.clientFullName, id === 101 ? 'Alex Example' : 'Blair Example');
  }
  assert.equal(new Set(state.attached.map(doc => doc.storagePath)).size, 10);
  assert.ok(state.generated.every(doc => doc.signatureData === 'parent-signature'));
  assert.ok(state.generated.some(doc => doc.template.html_content === 'Blair Example 2017-06-07'));
});

test('a failed chart attachment does not count as a completed consent', async () => {
  const state = setup();
  state.deps.attachSignedPdfToClient = async () => ({ ok: false });
  const section = load('persistPacketSectionFromIntakeData', 'async function persistEmbeddedDisclosureForClient', state.deps);
  await assert.rejects(section({ intakeData: { packetSections: { policy_services: { acknowledged: true, signatureData: 'signature' } } }, updatedSubmission: { client_id: 102 }, agency: { id: 10 }, organization: { id: 20 }, link: {}, now: new Date() }), /Unable to attach/);
  assert.equal(state.acknowledged.length, 0);
});

test('finalize rejects missing shared-signature consent before updating the submission', async () => {
  const signing = await import('../../utils/multiChildIntake.js');
  let updates = 0;
  const deps = {
    ...signing,
    validationResult: () => ({ isEmpty: () => true }),
    resolvePublicIntakeContext: async () => ({ link: { id: 8, is_active: true, scope_type: 'school', form_type: 'intake', create_client: true, intake_steps: [] } }),
    AgencySchoolIntakeMaster: { resolveParentAgencyIdForSchool: async () => null },
    applySmartRoiPayloadFallback: () => {},
    IntakeSubmission: { findById: async () => ({ id: 1, intake_link_id: 8, status: 'started' }), updateById: async () => { updates++; } },
    loadAllowedTemplates: async () => [], hasProgrammedSchoolRoiStep: () => false,
    isSmartDisclosureForm: () => false, isSubmissionExpired: () => false,
    IntakeSubmissionDocument: { listBySubmissionId: async () => [] }
  };
  const start = source.indexOf('export const finalizePublicIntake = ');
  const end = source.indexOf('export const submitPublicIntake = ', start);
  const handler = new Function(...Object.keys(deps), `${source.slice(start, end).replace('export const', 'const')} return finalizePublicIntake;`)(...Object.values(deps));
  let responseCode, response;
  const res = { status(code) { responseCode = code; return this; }, json(body) { response = body; return this; } };
  const clients = [{ fullName: 'Alex Example', dateOfBirth: '2012-02-03' }, { fullName: 'Blair Example', dateOfBirth: '2017-06-07' }];
  let unexpected;
  await handler({ params: { publicKey: 'school', submissionId: '1' }, body: { clients, guardian: { firstName: 'Pat', email: 'pat@example.com' }, intakeData: { clients } } }, res, error => { unexpected = error; });
  assert.equal(unexpected, undefined);
  assert.equal(responseCode, 400);
  assert.match(response.error.message, /confirm.*signatures/);
  assert.equal(updates, 0);
});
