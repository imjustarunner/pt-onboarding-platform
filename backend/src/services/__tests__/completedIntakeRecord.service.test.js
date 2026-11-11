import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletedIntakeRecord } from '../completedIntakeRecord.service.js';

test('programmed school ROI links use the exact signed artifact, never an unrelated blank template or family session token', () => {
  const document = { id: 1653, document_template_id: 139, signed_at: '2026-11-08T05:21:49Z',
    documentViewUrl: 'https://storage.example.test/only-this-signed-roi', audit_trail: { smartSchoolRoi: true } };
  const record = buildCompletedIntakeRecord({ link: { public_key: 'synthetic' }, submission: { session_token: 'private-family-session' }, signedDocuments: [document] });
  assert.equal(record.signatures[0].publicUrl, document.documentViewUrl);
  assert.equal(record.signatures[0].publicUrlLabel, 'View signed ROI');
  assert.ok(!JSON.stringify(record).includes('private-family-session'));
  const noLink = buildCompletedIntakeRecord({ link: { public_key: 'synthetic' }, signedDocuments: [{ ...document, documentViewUrl: undefined }] });
  assert.equal(noLink.signatures[0].publicUrl, '');
});

test('a combined sibling receipt includes each child’s distinct PSC answers', () => {
  const fields = Array.from({ length: 17 }, (_, i) => ({ key: `psc_${i+1}`, type: 'radio', instrument: 'psc17', options: [{ value: '1', label: 'Never' }, { value: '2', label: 'Sometimes' }, { value: '3', label: 'Often' }] }));
  const answers = value => Object.fromEntries(fields.map(field => [field.key, value]));
  const record = buildCompletedIntakeRecord({ link: { scope_type: 'school', intake_fields: fields }, submission: { intake_data: { clients: [{ fullName: 'First Child' }, { fullName: 'Second Child' }], responses: { clients: [answers('3'), answers('1')] } } } });
  const second = record.sections.find(section => section.title === 'Second Child — PSC-17');
  const first = record.sections.find(section => section.title === 'First Child — PSC-17');
  assert.equal(first?.rows.length, 17);
  assert.ok(first.rows.every(row => row.value === 'Often'));
  assert.equal(second?.rows.length, 17);
  assert.ok(second.rows.every(row => row.value === 'Never'));
  assert.ok(record.sections.some(section => section.title !== second.title && section.rows?.some(row => row.value === 'Often')));
});

test('combined interview receipts label both screening sections and retain each child’s sex', () => {
  const link = { scope_type: 'school', intake_steps: [{ type: 'questions', label: 'About {childName}', fields: [
    { key: 'client_sex', label: 'Sex', type: 'text', scope: 'client' },
    { key: 'psc_1', label: 'Fidgety', type: 'radio', instrument: 'psc17', options: [{ value: '1', label: 'Never' }, { value: '3', label: 'Often' }] }
  ] }] };
  const intake = { clients: [{ fullName: 'First Child' }, { fullName: 'Second Child' }], responses: { clients: [
    { client_sex: 'Female', psc_1: '3' }, { client_sex: 'Male', psc_1: '1' }
  ] } };
  const saved = JSON.stringify(intake);
  const record = buildCompletedIntakeRecord({ link, submission: { intake_data: intake } });
  assert.equal(record.sections.find(s => s.title === 'First Child — PSC-17')?.rows[0]?.value, 'Often');
  assert.equal(record.sections.find(s => s.title === 'Second Child — PSC-17')?.rows[0]?.value, 'Never');
  assert.ok(record.sections.find(s => s.title === 'Second Child details')?.rows.some(r => r.label === 'Sex' && r.value === 'Male'));
  assert.ok(record.sections.some(s => s.rows.some(r => r.label === 'Sex' && r.value === 'Female')));
  assert.equal(JSON.stringify(intake), saved);
});

test('office receipt prints both insurance policies without deduplicating their shared field names', () => {
  const intake = { responses: { submission: { insuranceInfo: {
    primary: { insurerName: 'SAMPLE Primary', memberId: 'SAMPLE-PRI', groupNumber: 'GROUP-PRI' },
    secondary: { insurerName: 'SAMPLE Secondary', memberId: 'SAMPLE-SEC', groupNumber: 'GROUP-SEC' },
    hasSecondary: true,
    clientCoverages: [
      { clientIndex: 0, confirmed: true, primary: { insurerName: 'CHILD-A-PLAN', memberId: 'CHILD-A-ID' } },
      { clientIndex: 1, confirmed: true, primary: { insurerName: 'CHILD-B-PLAN', memberId: 'CHILD-B-ID' } }
    ]
  } } } };
  const before = JSON.stringify(intake);
  const record = buildCompletedIntakeRecord({ link: { scope_type: 'agency' }, submission: { intake_data: intake } });
  const rows = record.sections.flatMap(section => section.rows || []);
  for (const [tier, suffix] of [['Primary', 'PRI'], ['Secondary', 'SEC']]) {
    assert.ok(rows.some(row => row.label.endsWith(`${tier} · Member Id`) && row.value === `SAMPLE-${suffix}`));
    assert.ok(rows.some(row => row.label.endsWith(`${tier} · Group Number`) && row.value === `GROUP-${suffix}`));
  }
  assert.ok(rows.some(row => row.value === 'CHILD-A-ID'));
  assert.ok(rows.some(row => row.value === 'CHILD-B-ID'));
  assert.equal(JSON.stringify(intake), before);
});

test('office Self-Pay receipt labels the choice without contradicting its saved signed agreement', () => {
  const record = buildCompletedIntakeRecord({ link: { scope_type: 'agency', inherits_office_master: 1 },
    submission: { intake_data: { responses: { submission: { insuranceInfo: {
      payerChoice: 'self_pay', isSelfPay: true, authorizationAgreed: true,
      authorizationSignature: 'SAMPLE Signer', authorizationSourceMethod: 'typed_full_name'
    } } } } } });
  const text = JSON.stringify(record.sections);
  assert.match(text, /Self-pay/);
  assert.match(text, /SAMPLE Signer/);
  assert.doesNotMatch(text, /No insurance authorization signature is required/);
});

test('additional answers omit internal card-storage references and redundant authorization device metadata', () => {
  const intake = { responses: { submission: { insuranceInfo: {
    primary_front_url: 'gs://synthetic-bucket/primary-front.enc', secondary_back_url: 'gs://synthetic-bucket/secondary-back.enc',
    authorizationSignedIp: '192.0.2.20', authorizationSignedUserAgent: 'Synthetic User Agent', authorizationSignature: 'SAMPLE Signer'
  }, resource_website: 'https://example.com/family-resource' } } };
  const before = JSON.stringify(intake);
  const record = buildCompletedIntakeRecord({ submission: { intake_data: intake, ip_address: '192.0.2.10' } });
  const text = JSON.stringify(record.sections);
  assert.doesNotMatch(text, /gs:\/\/|192\.0\.2\.20|Synthetic User Agent/);
  assert.match(text, /SAMPLE Signer/);
  assert.match(text, /https:\/\/example.com\/family-resource/);
  assert.ok(record.esign.rows.some(row => row.label === 'IP address' && row.value === '192.0.2.10'));
  assert.equal(JSON.stringify(intake), before, 'stored audit details and attachment references are unchanged');
});

for (const shape of ['nested', 'flat']) {
  test(`individual sibling packets keep names, DOB, grade and screening answers together (${shape})`, () => {
    const identities = [
      { firstName: 'Alex', lastName: 'Example' },
      { firstName: 'Blair', lastName: 'Example' }
    ];
    const answers = [
      { child_dob: '2012-02-03', client_grade: '8', psc_1: 'Often', sibling_note: 'Alex-only detail' },
      { child_dob: '2017-06-07', client_grade: '3', psc_1: 'Never', sibling_note: 'Blair-only detail' }
    ];
    const shared = { guardian: { firstName: 'Pat', email: 'pat@example.com' } };
    const intakeData = shape === 'nested'
      ? { ...shared, clients: identities, responses: { clients: answers, submission: {} } }
      : { ...shared, clients: identities.map((identity, i) => ({ ...identity, ...answers[i] })), submission: {} };
    const original = JSON.stringify(intakeData);
    const link = {
      scope_type: 'school',
      intake_steps: [{
        type: 'questions', label: 'About {childName}', repeatPerClient: true,
        fields: [
          { key: 'child_dob', label: 'Date of birth', type: 'date', scope: 'client' },
          { key: 'client_grade', label: 'Grade', type: 'text', scope: 'client' },
          { key: 'psc_1', label: 'Fidgety, unable to sit still', type: 'radio', options: [
            { value: '1', label: 'Never' }, { value: '2', label: 'Sometimes' }, { value: '3', label: 'Often' }
          ] }
        ]
      }]
    };
    for (const clientIndex of [0, 1]) {
      const spec = buildCompletedIntakeRecord({
        link, submission: { intake_data: intakeData }, clients: identities, clientIndex
      });
      const rows = spec.sections.flatMap((section) => section.rows || []);
      const text = JSON.stringify(spec.sections);
      const otherIndex = 1 - clientIndex;
      assert.match(text, new RegExp(identities[clientIndex].firstName));
      assert.ok(!text.includes(identities[otherIndex].firstName));
      assert.ok(rows.some((row) => row.label === 'Grade' && row.value === answers[clientIndex].client_grade));
      assert.ok(rows.some((row) => row.label === 'Fidgety, unable to sit still' && row.value === answers[clientIndex].psc_1));
      assert.ok(text.includes(answers[clientIndex].child_dob));
      assert.ok(!text.includes(answers[otherIndex].child_dob));
      assert.ok(text.includes(answers[clientIndex].sibling_note));
      assert.ok(!text.includes(answers[otherIndex].sibling_note));
      assert.ok(text.includes('pat@example.com'));
    }
    assert.equal(JSON.stringify(intakeData), original, 'rendering does not mutate the saved family answers');
    assert.throws(() => buildCompletedIntakeRecord({
      link, submission: { intake_data: intakeData }, clientIndex: 2
    }), /Invalid intake packet client index/);
  });
}

test('completed record includes nested answers, skips secrets, and keeps ESIGN + signatures', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { official_name: 'ITSCO' },
    link: {
      title: 'School intake',
      intake_steps: [
        {
          type: 'questions',
          label: 'About your child',
          fields: [
            { key: 'presenting_concern', label: 'What is the biggest concern?', type: 'text' }
          ]
        }
      ],
      intake_fields: [
        { key: 'presenting_concern', label: 'What is the biggest concern?', type: 'text' }
      ]
    },
    submission: {
      id: 778,
      submitted_at: '2026-08-14T18:00:00.000Z',
      consent_given_at: '2026-08-14T17:55:00.000Z',
      signer_name: 'Ada Lovelace',
      signer_email: 'ada@example.com',
      signer_role: 'guardian',
      ip_address: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      intake_data: {
        approval: { mode: 'staff_assisted', staffLastName: 'Rivera', approvedAt: '2026-08-14T17:50:00.000Z' },
        responses: {
          guardian: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'secret' },
          submission: {
            presenting_concern: 'Sleep',
            insuranceInfo: { payer: 'Medicaid', memberId: 'M123', card_number: '4111111111111111' }
          }
        }
      }
    },
    signedDocuments: [
      {
        document_template_name: 'Consent for treatment',
        signed_at: '2026-08-14T18:00:00.000Z',
        pdf_hash: 'abc123',
        audit_trail: { signatureData: 'data:image/png;base64,aaaa' }
      }
    ],
    clients: [{ fullName: 'Ada Lovelace', dateOfBirth: '1985-01-02' }]
  });

  assert.equal(spec.agencyName, 'ITSCO');
  assert.match(spec.title, /Completed enrollment packet/i);
  const values = spec.sections.flatMap((section) => section.rows.map((row) => `${row.label}|${row.value}`));
  assert.ok(values.some((row) => row.includes('Sleep')));
  assert.ok(values.some((row) => /Medicaid/.test(row)));
  assert.ok(!values.some((row) => /password|411111/i.test(row)));
  assert.equal(spec.signatures.length, 1);
  assert.equal(spec.signatures[0].documentName, 'Consent for treatment');
  assert.ok(spec.signatures[0].imageDataUrl.startsWith('data:image/png'));
  assert.ok(spec.approvals.some((block) => /Staff-assisted/i.test(block.title)));
  assert.ok(spec.esign.rows.some((row) => row.label === 'IP address' && row.value === '203.0.113.10'));
  assert.match(spec.esign.statement, /ESIGN Act/);
});

test('self packet PHQ-A fields without labels print the official title, questions and answer words', () => {
  const record = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    link: { intake_steps: [{ type: 'questions', label: 'Questions', fields: [{ key: 'phqa_1', type: 'radio' }, { key: 'phqa_2', type: 'radio' }] }] },
    submission: { id: 901, intake_data: { responses: { submission: { phqa_1: 0, phqa_2: '1' } } } },
    clients: []
  });
  const phqa = record.sections.find((section) => section.title === 'PHQ-A');
  assert.ok(phqa);
  assert.ok(phqa.rows.some((row) => /Feeling down/i.test(row.label) && /Not at all/i.test(row.value)));
  assert.ok(!JSON.stringify(record.sections).includes('Phqa 1'));
});

test('school packet prints answered PSC-17 questions and omits unanswered ROI-only overlays', () => {
  const answered = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    link: {
      intake_steps: [
        {
          type: 'questions',
          label: 'Life & Safety',
          fields: [
            { key: 'gain', label: 'What do you hope to gain from counseling?', type: 'textarea' },
            { key: 'psc_1', label: 'Fidgety, unable to sit still', type: 'radio', instrument: 'psc17' },
            { key: 'psc_17', label: 'Refuses to share', type: 'radio', instrument: 'psc17' }
          ]
        }
      ]
    },
    submission: {
      id: 842,
      signer_name: 'Fake Fake',
      intake_data: {
        clients: [{ firstName: 'Fake2', lastName: 'Fake2' }],
        responses: {
          clients: [{
            firstName: 'Fake2',
            lastName: 'Fake2',
            gain: 'Nothing',
            psc_1: 'Sometimes',
            psc_17: 'Often'
          }]
        }
      }
    },
    clients: [{ firstName: 'Fake2', lastName: 'Fake2' }]
  });
  const life = answered.sections.find((section) => /Life & Safety/i.test(section.title));
  assert.ok(life);
  assert.ok(life.rows.some((row) => /hope to gain/i.test(row.label) && /Nothing/i.test(row.value)));
  assert.ok(!life.rows.some((row) => /Not answered/i.test(row.value)));
  const psc = answered.sections.find((section) => section.title === 'PSC-17');
  assert.ok(psc, 'PSC-17 answers print under their own titled section');
  assert.ok(psc.rows.some((row) => /Fidgety/i.test(row.label) && /Sometimes/i.test(row.value)));
  assert.ok(!life.rows.some((row) => /Fidgety/i.test(row.label)));

  const roiOnly = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    includeUnansweredQuestions: false,
    link: {
      form_type: 'smart_school_roi',
      intake_steps: [
        {
          type: 'questions',
          label: 'Clinical questionnaire',
          fields: [
            { key: 'psc_1', label: 'Fidgety, unable to sit still', type: 'radio', instrument: 'psc17' }
          ]
        }
      ]
    },
    submission: {
      id: 840,
      signer_name: 'Carla Archuleta',
      intake_data: { guardian: { firstName: 'Carla' }, clients: [{ fullName: 'ChaMar' }] }
    },
    clients: [{ fullName: 'ChaMar' }]
  });
  const fabricated = roiOnly.sections.find((section) => /Clinical questionnaire/i.test(section.title));
  assert.equal(fabricated, undefined);
});

test('packet sections become per-document signature cards and skipped questionnaires are omitted', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    publicKey: 'office-intake-key',
    link: {
      public_key: 'office-intake-key',
      intake_steps: [
        {
          type: 'clinical_questions',
          label: 'Standard Questionnaires',
          fields: [
            { key: 'phq9_1', label: 'Little interest', type: 'select', instrument: 'phq9' },
            { key: 'skip_phq9', label: 'Skip PHQ-9', type: 'text' }
          ]
        }
      ]
    },
    submission: {
      id: 793,
      signer_name: 'Ada Lovelace',
      intake_data: {
        responses: {
          submission: {
            clinicalResponses: { skip_phq9: 'yes', phq9_1: '0' },
            packetSections: {
              policy_services: {
                acknowledged: true,
                signerName: 'Ada Lovelace',
                contentHash: 'hash-policy',
                packetVersion: 4,
                signatureData: 'data:image/png;base64,bbbb',
                snapshotHtml: '<p>Very long policy text that must not dump into answers</p>'
              }
            }
          }
        }
      }
    }
  });
  assert.ok(!spec.sections.some((section) => /Questionnaire/i.test(section.title)));
  assert.ok(!spec.sections.some((section) => section.rows.some((row) => /Very long policy/i.test(row.value))));
  assert.equal(spec.signatures.length, 1);
  assert.equal(spec.signatures[0].documentName, 'Policy and Services Agreement');
  assert.match(spec.signatures[0].publicUrl, /packet-section\/policy_services\/view/);
  assert.equal(spec.signatures[0].hash, 'hash-policy');
});

test('omits all-zero Vanderbilt/SCARED leftovers and humanizes option slugs', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    publicKey: 'office-intake-2-en',
    publicOrigin: 'https://app.itsco.health',
    link: {
      public_key: 'office-intake-2-en',
      intake_steps: [
        {
          type: 'questions',
          label: 'Daily life',
          fields: [
            {
              key: 'life_sleep',
              label: 'Sleep',
              type: 'radio',
              options: [
                { value: 'going_well', label: 'Going well' },
                { value: 'some_difficulty', label: 'Some difficulty' }
              ]
            }
          ]
        },
        {
          type: 'clinical_questions',
          label: 'Standard Questionnaires',
          fields: [
            { key: 'vanderbilt_1', label: 'Vanderbilt 1', type: 'select', instrument: 'vanderbilt_adhd18' },
            { key: 'scared5_1', label: 'Scared5 1', type: 'select', instrument: 'scared5_parent' }
          ]
        }
      ]
    },
    submission: {
      id: 801,
      signer_name: 'Ada Lovelace',
      intake_data: {
        smartDisclosure: { acknowledged: true, contentHash: 'disc-hash' },
        responses: {
          clients: [{
            life_sleep: 'going_well',
            vanderbilt_1: '0',
            scared5_1: '0',
            send_child_anxiety: 'send'
          }]
        }
      }
    }
  });
  const rows = spec.sections.flatMap((section) => section.rows.map((row) => `${row.label}|${row.value}`));
  assert.ok(rows.some((row) => /Going well/i.test(row)));
  assert.ok(!rows.some((row) => /Vanderbilt|Scared5|Send Child/i.test(row)));
  const disclosure = spec.signatures.find((row) => /Disclosure/i.test(row.documentName));
  assert.ok(disclosure);
  assert.match(disclosure.publicUrl, /https:\/\/app\.itsco\.health\/api\/public-intake\/office-intake-2-en\/disclosure\/view/);
});

test('interpolates child name, skips organization id leftovers, and exposes clickable terms links', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { official_name: 'ITSCO' },
    publicKey: 'office-intake-2-en',
    publicOrigin: 'https://app.itsco.health',
    link: {
      public_key: 'office-intake-2-en',
      intake_steps: [
        { type: 'questions', label: 'About {childName}', fields: [{ key: 'child_legal_first', label: 'Legal first name', type: 'text' }] }
      ]
    },
    submission: {
      id: 810,
      signer_name: 'Ada Lovelace',
      intake_data: {
        responses: {
          guardian: { firstName: 'Ada', lastName: 'Lovelace' },
          clients: [{ child_legal_first: 'Owen', child_preferred_name: 'Imani' }],
          submission: {
            organizationId: 2,
            communicationPreferences: {
              emailPreference: 'all',
              smsPreference: 'scheduling_only',
              providerTextingOptIn: 'yes',
              termsUrl: '/terms',
              privacyUrl: '/privacypolicy'
            }
          }
        }
      }
    },
    clients: [{ firstName: 'Imani', lastName: 'Ellis', dateOfBirth: '2015-09-09' }]
  });
  assert.ok(spec.sections.some((section) => section.title === 'About Imani'));
  const leftover = spec.sections.find((section) => /Additional answers/i.test(section.title));
  assert.ok(!leftover || leftover.rows.every((row) => !/Organization Id/i.test(row.label)));
  const comms = spec.sections.find((section) => /Communication preferences/i.test(section.title));
  assert.ok(comms);
  const terms = comms.rows.find((row) => /Terms/i.test(row.label));
  assert.equal(terms.href, 'https://app.itsco.health/terms');
  assert.equal(terms.value, 'https://app.itsco.health/terms');
});

test('job application completed record uses application copy instead of intake/client labels', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { official_name: 'ITSCO' },
    link: {
      title: 'Apply: School Counselor',
      form_type: 'job_application',
      intake_fields: [
        { key: 'resume_text', label: 'Resume Text', type: 'textarea', scope: 'submission' }
      ]
    },
    submission: {
      id: 831,
      submitted_at: '2026-08-19T23:24:00.000Z',
      signer_name: 'Haley Inyart',
      signer_email: 'haleyinyart@gmail.com',
      intake_data: {
        responses: {
          guardian: { firstName: 'Haley', lastName: 'Inyart', email: 'haleyinyart@gmail.com', phone: '555-0100' },
          submission: {
            resume_text: 'Sample resume',
            uploadTextByStep: { 'Step 1 Resume': 'pasted resume dump' },
            applicantProfile: {
              credential: 'LPC',
              licenseNumber: 'LPC.002383',
              bestTimeToContact: 'Weekday mornings',
              interviewAvailability: 'Afternoons after 3pm'
            },
            fluentLanguages: ['English', 'Spanish'],
            references: [
              { name: 'Alex Rivera', email: 'alex@example.com', organization: 'Clinic A' },
              { name: 'Jordan Lee', email: 'jordan@example.com', organization: 'Clinic B' },
              { name: 'Sam Patel', email: 'sam@example.com', organization: 'Clinic C' }
            ]
          }
        },
        applicantProfile: {
          credential: 'LPC',
          licenseNumber: 'LPC.002383'
        },
        referencesJson: [
          { name: 'Alex Rivera', email: 'alex@example.com', organization: 'Clinic A' },
          { name: 'Jordan Lee', email: 'jordan@example.com', organization: 'Clinic B' },
          { name: 'Sam Patel', email: 'sam@example.com', organization: 'Clinic C' }
        ]
      }
    },
    clients: [{ fullName: 'Haley Inyart' }]
  });

  assert.match(spec.title, /Job application receipt/i);
  assert.equal(spec.skipCoverPage, true);
  assert.ok(!/intake packet/i.test(spec.title));
  const labels = spec.sections.flatMap((section) => section.rows.map((row) => row.label));
  assert.ok(labels.includes('Name'));
  assert.ok(labels.includes('Credential'));
  assert.ok(labels.includes('License number'));
  assert.ok(labels.includes('Reference 1 name'));
  assert.ok(labels.includes('Reference 2 email'));
  assert.ok(labels.includes('Reference 3 name'));
  assert.ok(!labels.includes('Client'));
  assert.ok(!spec.sections.some((section) => /Client details/i.test(section.title)));
  assert.ok(!labels.some((l) => /resume text/i.test(l)));
  assert.ok(!labels.some((l) => /upload text/i.test(l)));
  const leftover = spec.sections.find((section) => /Additional answers/i.test(section.title));
  assert.ok(!leftover || leftover.rows.every((row) => !/resume|upload text/i.test(`${row.label} ${row.value}`)));
});

test('receipt prints the selected screen label and self screens that are not on the link', () => {
  const spec = buildCompletedIntakeRecord({
    link: {
      scope_type: 'school',
      intake_steps: [{
        type: 'questions',
        label: 'How your child has been doing',
        fields: [
          {
            key: 'psc_1',
            label: 'Fidgety, unable to sit still',
            type: 'radio',
            options: [
              { value: '1', label: 'Never' },
              { value: '2', label: 'Sometimes' },
              { value: '3', label: 'Often' }
            ]
          },
          { key: 'client_grade', label: 'Grade', type: 'text' },
          { key: 'client_street', label: 'Street', type: 'text' }
        ]
      }]
    },
    submission: {
      intake_data: {
        clients: [{ firstName: 'Quinn', lastName: 'Example' }],
        responses: {
          clients: [{
            psc_1: '2',
            psc_2: '3',
            psc_3: '2',
            phqa_1: '1',
            gad7_1: '3',
            client_grade: 'GRADE-TOKEN-8',
            client_street: 'STREET-TOKEN-410'
          }],
          submission: {}
        }
      }
    }
  });
  const rows = spec.sections.flatMap((section) => section.rows || []);
  const value = (label) => rows.find((row) => row.label === label)?.value;
  assert.equal(value('Fidgety, unable to sit still'), 'Sometimes');
  assert.equal(value('Acts as if driven by a motor'), 'Often');
  assert.equal(value('Daydreams too much'), 'Sometimes');
  assert.ok(spec.sections.some((section) => section.title === 'PSC-17'));
  assert.ok(spec.sections.some((section) => section.title === 'PHQ-A'));
  assert.ok(spec.sections.some((section) => section.title === 'GAD-7'));
  assert.equal(spec.sections.some((section) => section.title === 'Symptom screens'), false);
  assert.equal(value('Feeling down, depressed, irritable, or hopeless'), 'Several days');
  assert.equal(value('Feeling nervous, anxious, or on edge'), 'Nearly every day');
  assert.equal(value('Grade'), 'GRADE-TOKEN-8');
  assert.equal(value('Street'), 'STREET-TOKEN-410');
});

for (const phqaOnStep of [false, true]) {
  test(`self school packet prints an all-zero PHQ-A as its own titled section (fields on step=${phqaOnStep})`, () => {
    const phqa = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`phqa_${i + 1}`, 0]));
    const gad7 = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`gad7_${i + 1}`, '1']));
    const stepFields = [
      { key: 'client_sex', label: 'Client Sex', type: 'text' },
      ...(phqaOnStep ? Object.keys(phqa).map((key) => ({ key, label: '', type: 'radio', instrument: 'phqa' })) : [])
    ];
    const spec = buildCompletedIntakeRecord({
      link: { scope_type: 'school', intake_steps: [{ type: 'questions', label: 'Questions', fields: stepFields }] },
      submission: {
        id: 1407,
        intake_data: {
          clients: [{ firstName: 'Demo', lastName: 'Self' }],
          guardian: { firstName: 'Demo', lastName: 'Self', email: 'self@example.com' },
          responses: {
            // Self enrollment keeps the student's own answers in the guardian bag.
            guardian: { client_sex: 'Male', client_grade: 'GRADE-SELF-8', ...phqa, ...gad7 },
            clients: [{ client_first: 'Demo', client_last: 'Self' }],
            submission: {
              smartSchoolRoi: { intakeForSelf: true },
              completedSchoolChildSteps: ['step_1777_abc', 'step_1777_def'],
              guardianWaiverIntake: {
                stepId: 'step_1777_waiver',
                clients: [{ sections: { emergency_contacts: {
                  payload: { declineEmergencyContacts: false, contacts: [{ name: 'Casey Contact', phone: '555-0100' }] },
                  signatureData: 'data:image/png;base64,aaaa',
                  signatureMeta: { signerName: 'Demo Self', sectionKey: 'emergency_contacts', clientIndex: 0 }
                } } }]
              },
              insuranceInfo: { isSelfPay: true, identity: { verified: null, skipped: true, message: 'skipped' } }
            }
          }
        }
      }
    });
    const text = JSON.stringify(spec.sections);
    const phqaSection = spec.sections.find((section) => section.title === 'PHQ-A');
    assert.ok(phqaSection, 'PHQ-A section is titled');
    assert.equal(phqaSection.rows.length, 9);
    assert.equal(phqaSection.rows[0].label, 'Feeling down, depressed, irritable, or hopeless');
    assert.equal(phqaSection.rows[0].value, 'Not at all');
    assert.ok(phqaSection.rows.every((row) => row.value === 'Not at all'));
    assert.ok(spec.sections.some((section) => section.title === 'GAD-7'));
    assert.doesNotMatch(text, /Phqa \d/);
    assert.doesNotMatch(text, /Gad7 \d/);
    const info = spec.sections.find((section) => section.title === 'Your information');
    assert.ok(info.rows.every((row) => !/phq|gad/i.test(row.label)));
    assert.doesNotMatch(text, /Payload|Step Id|Completed School Child Steps|step_1777|Identity/);
    const waivers = spec.sections.find((section) => section.title === 'Guardian waivers & safety');
    assert.ok(waivers.rows.some((row) => /Emergency Contacts/.test(row.label) && row.value === 'Casey Contact'));
  });
}

test('self receipt preserves relationship, essential email meaning and alternative contact instructions', () => {
  const spec = buildCompletedIntakeRecord({ submission: { intake_data: { intakeForSelf: true, guardian: { relationship: 'Self' }, responses: { submission: { communicationPreferences: { emailPreference: 'no', alternativeContactInstructions: 'QA alternate contact instructions' }, communicationDraft: { signerName: 'UNSIGNED DRAFT' } } } } } });
  const rows = spec.sections.flatMap(section => section.rows || []);
  assert.ok(rows.some(row => row.label === 'Relationship to client' && row.value === 'Self'));
  assert.ok(rows.some(row => row.label === 'Email' && row.value === 'Essential messages only'));
  assert.ok(rows.some(row => row.value === 'QA alternate contact instructions'));
  assert.doesNotMatch(JSON.stringify(spec), /UNSIGNED DRAFT/);
});

test('self receipt uses self questions even when family questions share the same answer keys', () => {
  const record = buildCompletedIntakeRecord({ link: { intake_steps: [
    { type: 'questions', audience: 'family', label: 'What Brings Your Family Here?', fields: [{ key: 'already_tried', label: 'What has the family already tried?' }] },
    { type: 'questions', audience: 'self', label: 'What brings you here?', fields: [{ key: 'already_tried', label: 'What have you already tried?' }] }
  ] }, submission: { intake_data: { intakeForSelf: true, responses: { guardian: { firstName: 'QA' }, submission: { serviceSubject: 'self', already_tried: 'Prior support', insuranceInfo: { primary: { isMedicaid: false } } } } } } });
  const text = JSON.stringify(record.sections);
  assert.match(text, /What have you already tried/);
  assert.doesNotMatch(text, /family already tried|Your Family|Primary.*Is Medicaid|Parent \/ guardian/);
});
test('adult represented receipt identifies the client separately from the representative', () => {
  const record = buildCompletedIntakeRecord({ submission: { intake_data: { guardian: { firstName: 'Sample', lastName: 'Representative' }, clients: [{ fullName: 'Sample Client' }], responses: { submission: { serviceSubject: 'representative' }, clients: [{ client_sex: 'female' }] } } } });
  const rows = record.sections.flatMap(section => section.rows || []);
  assert.ok(rows.some(row => row.label === 'Authorized representative' && row.value === 'Sample Representative'));
  assert.ok(rows.some(row => row.label === 'Client' && row.value === 'Sample Client'));
  assert.ok(!rows.some(row => row.label === 'Service Subject'));
});

test('Spanish receipt localizes labels and published question wording while preserving the family’s own text',()=>{
 const record=buildCompletedIntakeRecord({link:{language_code:'es',intake_steps:[{type:'questions',label:'About you',fields:[{key:'main_reason_for_therapy',label:'What is the main reason you are looking for therapy?',type:'textarea'}]}]},submission:{id:1,intake_data:{guardian:{firstName:'Fictional',lastName:'Parent',email:'qa@example.test'},responses:{submission:{main_reason_for_therapy:'Keep this exact English answer'}}}}});
 assert.equal(record.locale,'es');assert.equal(record.title,'Paquete de inscripción completado');
 assert.ok(record.sections.flatMap(s=>s.rows||[]).some(row=>row.label==='¿Cuál es el motivo principal por el que busca terapia?'&&row.value==='Keep this exact English answer'));
 assert.match(record.esign.statement,/firmado electrónicamente/);
});

test('Spanish receipt follows the respondent and translates nested insurance labels without changing answers', () => {
 const field={key:'asq_3',instrument:'asq',type:'radio',label:'In the past few weeks, has your child been having thoughts about killing themselves?',options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]};
 const intake={formLocale:'es',intakeForSelf:false,clients:[{fullName:'Fictional Child'}],responses:{clients:[{asq_3:'no'}],submission:{insuranceInfo:{primary:{insurerName:'Fictional Carrier',memberId:'QA-123'}},communicationPreferences:{smsPreference:'no'}}}};
 const original=JSON.stringify(intake);
 const record=buildCompletedIntakeRecord({link:{intake_steps:[{type:'questions',fields:[field]}]},submission:{intake_data:intake}});
 const rows=record.sections.flatMap(s=>s.rows||[]);
 assert.ok(rows.some(r=>r.label.includes('su hijo/a')));
 assert.ok(rows.some(r=>r.label==='Información del seguro · Principal · Nombre de la aseguradora'&&r.value==='Fictional Carrier'));
 assert.ok(rows.some(r=>r.value==='No — no enviarme mensajes de texto'));
 assert.equal(JSON.stringify(intake),original);
});


for (const locale of ['en', 'es']) {
  test(`family-schema memberName headings belong to the selected sibling (${locale})`, () => {
    const clients = [{ firstName: 'Ada', lastName: 'QA' }, { firstName: 'Milo', lastName: 'QA' }];
    const intake = { clients, responses: { clients: [{ personal_hope: 'Ada only' }, { personal_hope: 'Milo only' }] } };
    const before = JSON.stringify(intake);
    const link = { language_code: locale, intake_steps: [{ type: 'questions', label: 'Personal hope — {memberName}',
      fields: [{ key: 'personal_hope', label: 'What does {memberName} hope to gain?', type: 'text' }] }] };
    for (const clientIndex of [0, 1]) {
      const record = buildCompletedIntakeRecord({ link, clients, clientIndex, submission: { intake_data: intake } });
      const text = JSON.stringify(record.sections);
      assert.ok(text.includes(clients[clientIndex].firstName));
      assert.ok(!text.includes(clients[1 - clientIndex].firstName));
      assert.ok(!text.includes('{memberName}'));
      const title = `${locale === 'es' ? 'Deseo personal:' : 'Personal hope —'} ${clients[clientIndex].firstName}`;
      assert.ok(record.sections.some(section => section.title === title));
    }
    assert.equal(JSON.stringify(intake), before);
  });
}

for (const position of ['primary', 'secondary']) {
  test(`individual receipt shows that child's Medicaid ID in the ${position} policy summary`, () => {
    const clients = [{ firstName: 'Ada', lastName: 'QA' }, { firstName: 'Milo', lastName: 'QA' }];
    const insuranceInfo = { primary: { insurerName: 'Commercial carrier', memberId: 'SHARED-COMMERCIAL-SUBSCRIBER' },
      medicaidPlanPosition: position, medicaidByClient: [
        { clientIndex: 0, clientName: 'Ada QA', memberId: 'MEDICAID-ADA' },
        { clientIndex: 1, clientName: 'Milo QA', memberId: 'MEDICAID-MILO' }
      ] };
    insuranceInfo[position] = { insurerName: 'Health First Colorado', isMedicaid: true, memberId: 'MEDICAID-ADA' };
    const intake = { clients, responses: { clients: [{}, {}], submission: { insuranceInfo } } };
    const before = JSON.stringify(intake);
    for (const clientIndex of [0, 1]) {
      const text = JSON.stringify(buildCompletedIntakeRecord({ clientIndex, clients, submission: { intake_data: intake } }).sections);
      const ownId = insuranceInfo.medicaidByClient[clientIndex].memberId;
      assert.ok(text.includes(ownId));
      assert.ok(!text.includes(insuranceInfo.medicaidByClient[1 - clientIndex].memberId));
      if (position === 'secondary') assert.ok(text.includes('SHARED-COMMERCIAL-SUBSCRIBER'));
    }
    assert.equal(JSON.stringify(intake), before, 'readable receipts do not rewrite stored identities or signatures');
  });
}

test('missing per-child Medicaid ID is left blank instead of borrowing a sibling ID', () => {
  const clients = [{ firstName: 'Ada' }, { firstName: 'Milo' }];
  const intake = { clients, responses: { clients: [{}, {}], submission: { insuranceInfo: {
    primary: { insurerName: 'Health First Colorado', memberId: 'MEDICAID-ADA' },
    medicaidByClient: [{ clientIndex: 0, clientName: 'Ada', memberId: 'MEDICAID-ADA' }]
  } } } };
  const text = JSON.stringify(buildCompletedIntakeRecord({ clientIndex: 1, clients, submission: { intake_data: intake } }).sections);
  assert.ok(!text.includes('MEDICAID-ADA'));
});

test('self enrollment receipt preserves an intentional repeated name from stored identity', () => {
  const client = { firstName: 'Anna', middleName: 'Lee', lastName: 'Lee', fullName: 'Anna Lee Lee' };
  const record = buildCompletedIntakeRecord({ clients: [client], submission: { intake_data: {
    intakeForSelf: true, clients: [client], responses: { clients: [{ client_first: 'Anna', client_last: 'Lee' }] }
  } } });
  assert.ok(record.sections.flatMap(s => s.rows || []).some(row => row.label === 'Client' && row.value === 'Anna Lee Lee'));
});


test('a separate commercial child policy is not overwritten by a family Medicaid member ID', () => {
  const clients = [{ firstName: 'Ada' }, { firstName: 'Milo' }];
  const intake = { clients, responses: { clients: [{}, {}], submission: { insuranceInfo: {
    primary: { insurerName: 'Health First Colorado', memberId: 'MEDICAID-ADA' }, medicaidPlanPosition: 'primary',
    clientCoverages: [{ clientIndex: 1, confirmed: true, primary: { insurerName: 'Milo commercial', memberId: 'COMMERCIAL-MILO' } }],
    medicaidByClient: [{ clientIndex: 0, clientName: 'Ada', memberId: 'MEDICAID-ADA' }]
  } } } };
  const text = JSON.stringify(buildCompletedIntakeRecord({ clientIndex: 1, clients, submission: { intake_data: intake } }).sections);
  assert.ok(text.includes('COMMERCIAL-MILO'));
  assert.ok(!text.includes('MEDICAID-ADA'));
});

test('Spanish receipt identity and communication labels never fall back to English application labels', () => {
 const record=buildCompletedIntakeRecord({link:{language_code:'es'},submission:{intake_data:{formLocale:'es',clients:[{fullName:'Primer Menor',dateOfBirth:'2016-03-12'},{fullName:'Segundo Menor',dateOfBirth:'2018-10-22'}],responses:{clients:[{},{}],submission:{communicationPreferences:{smsPreference:'no',programUpdatesOptIn:'no',termsUrl:'/terms',privacyUrl:'/privacypolicy'}}}}}});
 const text=JSON.stringify(record.sections);assert.ok(text.includes('Cliente 1'));assert.ok(text.includes('Fecha de nacimiento 2016-03-12'));assert.ok(text.includes('Mensajes de texto (SMS)'));assert.ok(text.includes('Novedades del programa'));assert.ok(text.includes('Términos de uso'));assert.ok(text.includes('Política de privacidad'));
 for(const label of ['Date of birth','Text messages (SMS)','Terms of Use','Program updates'])assert.ok(!text.includes(label),label);
});
