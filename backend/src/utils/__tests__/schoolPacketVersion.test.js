import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSchoolPacketVersionLabel,
  parseSchoolPacketVersionLabel,
  canonicalSchoolPacketVersionLabel,
  computeNextSchoolPacketVersion,
  inferPacketChangeReason,
  resolveAgencyPacketMajorVersion
} from '../schoolPacketVersion.util.js';

test('formatSchoolPacketVersionLabel', () => {
  assert.equal(formatSchoolPacketVersionLabel(1, 0), '1.0');
  assert.equal(formatSchoolPacketVersionLabel(1, 1), '1.01');
  assert.equal(formatSchoolPacketVersionLabel(1, 2), '1.02');
  assert.equal(formatSchoolPacketVersionLabel(1, 3), '1.03');
  assert.equal(formatSchoolPacketVersionLabel(1, 10), '1.10');
  assert.equal(formatSchoolPacketVersionLabel(2, 0), '2.0');
  assert.equal(formatSchoolPacketVersionLabel(2, 1), '2.01');
});

test('resolveAgencyPacketMajorVersion from agency label', () => {
  assert.equal(resolveAgencyPacketMajorVersion('1.0'), 1);
  assert.equal(resolveAgencyPacketMajorVersion('2.0'), 2);
  assert.equal(resolveAgencyPacketMajorVersion(null), 1);
});

test('user scenario — disclosure then per-school ROI then disclosure again', () => {
  // All schools start at 1.0
  let schoolA = computeNextSchoolPacketVersion(null, 1);
  let schoolB = computeNextSchoolPacketVersion(null, 1);
  assert.equal(schoolA.label, '1.0');
  assert.equal(schoolB.label, '1.0');

  // Disclosure for everyone: 1.01
  schoolA = computeNextSchoolPacketVersion(
    { version_major: schoolA.major, version_minor: schoolA.minor },
    1
  );
  schoolB = computeNextSchoolPacketVersion(
    { version_major: schoolB.major, version_minor: schoolB.minor },
    1
  );
  assert.equal(schoolA.label, '1.01');
  assert.equal(schoolB.label, '1.01');

  // Second disclosure: 1.02
  schoolA = computeNextSchoolPacketVersion(
    { version_major: schoolA.major, version_minor: schoolA.minor },
    1
  );
  schoolB = computeNextSchoolPacketVersion(
    { version_major: schoolB.major, version_minor: schoolB.minor },
    1
  );
  assert.equal(schoolA.label, '1.02');
  assert.equal(schoolB.label, '1.02');

  // School A ROI only: A → 1.03, B stays 1.02
  schoolA = computeNextSchoolPacketVersion(
    { version_major: schoolA.major, version_minor: schoolA.minor },
    1
  );
  assert.equal(schoolA.label, '1.03');
  assert.equal(schoolB.label, '1.02');

  // Disclosure again: A → 1.04, B → 1.03
  schoolA = computeNextSchoolPacketVersion(
    { version_major: schoolA.major, version_minor: schoolA.minor },
    1
  );
  schoolB = computeNextSchoolPacketVersion(
    { version_major: schoolB.major, version_minor: schoolB.minor },
    1
  );
  assert.equal(schoolA.label, '1.04');
  assert.equal(schoolB.label, '1.03');
});

test('agency major bump resets school to 2.0 then minor resumes', () => {
  const latest = { version_major: 1, version_minor: 15 };
  const bumped = computeNextSchoolPacketVersion(latest, 2);
  assert.deepEqual(bumped, { major: 2, minor: 0, label: '2.0' });

  const afterDisclosure = computeNextSchoolPacketVersion(
    { version_major: bumped.major, version_minor: bumped.minor },
    2
  );
  assert.equal(afterDisclosure.label, '2.01');
});

test('inferPacketChangeReason', () => {
  const latest = {
    version_major: 1,
    template_version_snapshot: 3,
    providers_json: JSON.stringify([{ id: 1 }]),
    staff_json: JSON.stringify([{ school_staff_user_id: 10 }])
  };
  assert.equal(inferPacketChangeReason({ latestRow: null }), 'initial');
  assert.equal(
    inferPacketChangeReason({ latestRow: latest, agencyMajorVersion: 2 }),
    'major_document_updated'
  );
  assert.equal(
    inferPacketChangeReason({ latestRow: latest, templateVersionSnapshot: 4 }),
    'disclosure_updated'
  );
  assert.equal(
    inferPacketChangeReason({
      latestRow: latest,
      providers: [{ id: 2 }],
      staffRows: [{ school_staff_user_id: 10 }]
    }),
    'provider_roster_updated'
  );
  assert.equal(
    inferPacketChangeReason({
      latestRow: latest,
      providers: [{ id: 1 }],
      staffRows: [{ school_staff_user_id: 11 }]
    }),
    'staff_roster_updated'
  );
});

test('parseSchoolPacketVersionLabel and canonical normalization', () => {
  assert.deepEqual(parseSchoolPacketVersionLabel('V1.03'), { major: 1, minor: 3 });
  assert.deepEqual(parseSchoolPacketVersionLabel('Version 1.01'), { major: 1, minor: 1 });
  assert.equal(canonicalSchoolPacketVersionLabel('1.1'), '1.01');
});
