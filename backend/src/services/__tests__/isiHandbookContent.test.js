import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getHandbookSource, validateHandbookSections } from '../workplaceHandbookContent.js';

const source = getHandbookSource({ slug: 'tisi' });
const section = slug => source.sections.find(s => s.slug === slug);
const body = slug => section(slug).body_html;

describe('Inner Strength counseling handbook', () => {
  it('selects explicit configured ISI aliases and isolates sources and saved forms', () => {
    for (const slug of ['tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute', 'TISI']) assert.equal(getHandbookSource({ slug }).organization, 'Inner Strength Institute');
    assert.equal(getHandbookSource({ slug: 'unrelated', name: 'Inner Strength Institute' }), null);
    assert.equal(source.forms.employeeSelfAssessments.length, 0);
    const withForms = getHandbookSource({ slug: 'tisi' }, { employeeTemplates: [{ slug: 'counselor', name: 'Counselor', version: 3, rubric_json: { sections: [] } }] });
    assert.deepEqual(withForms.forms.employeeSelfAssessments.map(f => f.slug), ['counselor']);
    assert.equal(section('appendix-i').content_status, 'pending');
    assert.notEqual(withForms.revision, source.revision);
    withForms.sections[0].title = 'Changed';
    assert.equal(getHandbookSource({ slug: 'tisi' }).sections[0].title, 'FOUNDATIONS OF INNER STRENGTH INSTITUTE');
  });
  it('has a complete counseling edition without inherited program duties or foreign branding', () => {
    assert.equal(source.sections.length, 165);
    assert.ok(source.sections.every(s => s.content_status === 'ready' || s.slug === 'appendix-i'));
    for (const s of source.sections) assert.doesNotMatch(s.title+' '+s.body_html, /tutoring|Skill Builders|facilitator|\bNLU\b|ITSCO|Next Level|nextleveluplcc|school-assigned|school-based|&lt;a /i, s.slug);
    for (const u of source.reviewUpdates) assert.doesNotMatch(u.subject+' '+u.changed_content, /tutoring|Skill Builders|facilitator|\bNLU\b|ITSCO|Next Level|nextleveluplcc/i, u.subject);
    assert.match(body('service-focus-assignment'), /counseling-only practice/);
    assert.match(body('service-focus-assignment'), /approved telehealth/);
    assert.doesNotMatch(body('direct-behavioral-health-services-hcpcs'), /H2014|H2021|97535|T1017/);
    assert.match(body('direct-behavioral-health-services-hcpcs'), /H0004/);
    assert.match(body('group-services-moratorium-and-exceptions'), /express written leadership approval/);
    assert.match(body('isi-parent-pickup'), /authorized caregiver/);
    assert.match(body('isi-client-elopement'), /adult’s departure/);
  });
  it('retains compensation, leave and the distinct supervision milestone and clinical placement rules', () => {
    const shared = getHandbookSource({ slug: 'nlu' });
    for (const slug of ['compensation-rate-category-1','compensation-rate-category-2','compensation-rate-category-3','compensation-included-indirect-service-component']) assert.equal(body(slug), shared.sections.find(s => s.slug === slug).body_html);
    assert.match(body('supervision-procedures'), /60 completed individual\/triadic supervision hours plus 40 group supervision opportunities offered/);
    assert.match(body('supervision-and-professional-development'), /at least once weekly/);
    assert.match(body('student-training-agreement'), /agreement in the app before clinical placement begins/);
    assert.equal(source.forms.studentTrainingEvaluation.sections.length, 7);
    assert.equal(body(source.forms.studentTrainingEvaluation.sectionSlug), source.forms.studentTrainingEvaluation.sectionBodyHtml);
    assert.match(body('student-training-program-program-overview'), /clinical counseling practicum and internship/);
  });
  it('has valid links and exact current policy destinations in every updater entry', () => {
    validateHandbookSections(source.sections);
    for (const s of source.sections) for (const [,slug] of s.body_html.matchAll(/href="#handbook-([^"]+)"/g)) assert.ok(section(slug), `${s.slug} → ${slug}`);
    assert.equal(source.reviewUpdates.length, 19);
    for (const u of source.reviewUpdates) {
      assert.match(u.id, /^isi-source-/);
      for (const slug of u.policy_section_slugs) assert.equal(section(slug)?.content_status, 'ready', slug);
    }
    assert.ok(source.reviewUpdates.some(u => u.policy_section_slugs.includes('student-training-agreement')));
  });
  it('uses website-based proposed foundations, actual brand assets and verifiable provenance', () => {
    assert.match(body('mission'), /compassionate, evidence-informed counseling/);
    assert.match(body('purpose-and-background-of-inner-strength-institute'), /Heal, Grow, Perform and Belong/);
    assert.equal(source.presentation.founders.length, 0);
    assert.equal((body('values').match(/<h4>/g)||[]).length, 7);
    assert.equal(source.coverUrl, '/assets/handbooks/isi-cover.png');
    for (const url of [source.coverUrl, source.presentation.logoUrl]) assert.ok(existsSync(new URL('../../../../frontend/public'+url, import.meta.url)));
    const audit = JSON.parse(readFileSync(new URL('../../content/handbooks/isi-reconciliation.json', import.meta.url)));
    const raw = JSON.parse(readFileSync(new URL('../../content/handbooks/isi.json', import.meta.url)));
    const hash = value => createHash('sha256').update(value).digest('hex');
    assert.equal(audit.websiteSha256, hash(readFileSync(new URL('../../../../'+audit.websiteSource, import.meta.url))));
    for (const e of audit.sections) assert.equal(e.bodySha256, hash(raw.sections.find(s => s.slug === e.slug).bodyHtml));
  });
});

describe('confirmed insurance across all company handbooks', () => {
  for (const slug of ['itsco','nlu','tisi']) it(`${slug}: replaces the malpractice exclusion and links the correction`, () => {
    const book = getHandbookSource({ slug });
    const coverage = book.sections.filter(s => /liability insurance|malpractice/i.test(s.body_html));
    assert.ok(coverage.length >= 2);
    for (const s of coverage) {
      assert.match(s.body_html, /liability insurance and clinical malpractice insurance/);
      assert.match(s.body_html, /clinical students\/interns/);
      assert.doesNotMatch(s.body_html, /excluding coverage for malpractice/);
      assert.ok(book.reviewUpdates.some(u => u.policy_section_slugs.includes(s.slug)), s.slug);
    }
    assert.ok(!book.importNotes.some(n => n.key === 'student-liability-confirmation'));
  });
});
