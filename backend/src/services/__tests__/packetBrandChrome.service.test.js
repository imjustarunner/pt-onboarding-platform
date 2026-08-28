import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNluPacketChromeAgency,
  isItscoPacketChromeAgency,
  resolvePacketBrandChrome,
  resolveNluPacketCoverKind
} from '../packetBrandChrome.service.js';

const DATA_IMAGE = /^data:image\/(png|jpeg);base64,/;

test('detects NLU agencies without treating ITSCO as NLU', () => {
  assert.equal(isNluPacketChromeAgency({ slug: 'nlu' }), true);
  assert.equal(isNluPacketChromeAgency({ portal_url: 'nextleveluplcc' }), true);
  assert.equal(isNluPacketChromeAgency({ official_name: 'Next Level Up' }), true);
  assert.equal(isNluPacketChromeAgency({ slug: 'itsco' }), false);
  assert.equal(isItscoPacketChromeAgency({ slug: 'itsco' }), true);
});

test('resolveNluPacketCoverKind maps channel/title to counseling, tutoring, skill-enriched', () => {
  assert.equal(resolveNluPacketCoverKind({ packetKind: 'counseling' }), 'counseling');
  assert.equal(resolveNluPacketCoverKind({ packetKind: 'tutoring' }), 'tutoring');
  assert.equal(resolveNluPacketCoverKind({ packetKind: 'therapy_plus_tutoring' }), 'skill_enriched_tutoring');
  assert.equal(resolveNluPacketCoverKind({}, { master_channel: 'tutoring', title: 'Tutoring Enrollment' }), 'tutoring');
  assert.equal(
    resolveNluPacketCoverKind({}, { title: 'Skill-Enriched Tutoring Enrollment' }),
    'skill_enriched_tutoring'
  );
  assert.equal(resolveNluPacketCoverKind({ packetKind: 'office' }), 'counseling');
  assert.equal(resolveNluPacketCoverKind({}, { title: 'Counseling Enrollment' }), 'counseling');
});

test('NLU chrome uses bundled header, footer, watermark, logo, and program covers', async () => {
  const brand = await resolvePacketBrandChrome({ slug: 'nlu', name: 'Next Level Up' });
  assert.equal(brand.useItscoChrome, false);
  assert.equal(brand.coverKind, 'counseling');
  assert.match(String(brand.headerImageDataUrl || ''), DATA_IMAGE);
  assert.match(String(brand.headerLogoDataUrl || ''), DATA_IMAGE);
  assert.match(String(brand.footerMarkDataUrl || ''), DATA_IMAGE);
  assert.match(String(brand.watermarkDataUrl || ''), DATA_IMAGE);
  assert.match(String(brand.coverDataUrl || ''), DATA_IMAGE);
  assert.match(brand.bodyFontFamily, /Montserrat/);

  const tutoring = await resolvePacketBrandChrome(
    { slug: 'nlu' },
    { packetKind: 'tutoring' }
  );
  const skill = await resolvePacketBrandChrome(
    { slug: 'nlu' },
    { packetKind: 'skill_enriched_tutoring' }
  );
  assert.equal(tutoring.coverKind, 'tutoring');
  assert.equal(skill.coverKind, 'skill_enriched_tutoring');
  assert.notEqual(brand.coverDataUrl, tutoring.coverDataUrl);
  assert.notEqual(tutoring.coverDataUrl, skill.coverDataUrl);
});

test('ITSCO school and office packets use bundled enrollment covers', async () => {
  const school = await resolvePacketBrandChrome({ slug: 'itsco' }, { packetKind: 'school' });
  const office = await resolvePacketBrandChrome({ slug: 'itsco' }, { packetKind: 'office' });
  const intake = await resolvePacketBrandChrome({ slug: 'itsco' }, { packetKind: 'intake' });
  assert.equal(school.useItscoChrome, true);
  assert.match(String(school.coverDataUrl || ''), DATA_IMAGE);
  assert.match(String(office.coverDataUrl || ''), DATA_IMAGE);
  // Shared NewITSCOPacketCover / ITSCOEnrollmentPacketCover is preferred for both kinds.
  assert.equal(office.coverDataUrl, intake.coverDataUrl);
});
