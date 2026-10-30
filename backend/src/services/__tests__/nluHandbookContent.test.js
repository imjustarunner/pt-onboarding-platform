import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getHandbookSource, handbookMetadata, validateHandbookSections } from '../workplaceHandbookContent.js';

const source = getHandbookSource({ slug: 'nlu' });
const section = slug => source.sections.find(s => s.slug === slug);
const body = slug => section(slug).body_html;
const active = source.sections.map(s => s.title + ' ' + s.body_html).join('\n');

describe('NLU handbook reconciliation', () => {
  it('selects only explicit tenant slugs and never reuses ITSCO foundations or default employee forms', () => {
    for (const slug of ['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up', 'NLU']) {
      assert.equal(getHandbookSource({ slug }).organization, 'Next Level Up');
    }
    assert.equal(getHandbookSource({ slug: 'another', name: 'Next Level Up' }), null);
    assert.equal(source.forms.employeeSelfAssessments.length, 0);
    assert.equal(section('appendix-i').content_status, 'pending');
    assert.equal(source.presentation.founders[1].name, 'Melissa Mendez');
    for (const s of source.sections) assert.ok(!/ITSCO|Rachel Finch|Skill Builders|school-assigned|school-based|Grasshopper/i.test((s.title + s.body_html).replace('ITSCO retains its separate policy.', '')), s.slug);
    assert.match(body('history-and-background-of-next-level-up'), /Melissa/);
    assert.match(body('history-and-background-of-next-level-up'), /Michael/);
    assert.match(getHandbookSource({ slug: 'itsco' }).presentation.founders[0].name, /Rachel/);
  });
  it('preserves all supplied outline entries and the source archive hash', () => {
    const original = readFileSync(new URL('../../content/handbooks/nlu-contents-and-foundations-original.txt', import.meta.url));
    assert.equal(source.sourceSha256, createHash('sha256').update(original).digest('hex'));
    assert.equal(source.sourceOutline.length, 378);
    const supplied = JSON.parse(readFileSync(new URL('../../content/handbooks/nlu-foundations-import.json', import.meta.url)));
    for (const title of ['VISION', 'MISSION', 'GOALS', 'VALUES']) {
      const text = body(title.toLowerCase()).replace(/&amp;/g, '&');
      for (const paragraph of supplied.foundations[title]) assert.ok(text.includes(paragraph), paragraph);
    }
    assert.doesNotMatch(body('welcome'), /school bell|hand-in-hand with schools/);
  });
  it('keeps approved shared compensation and supervision while removing school-only commitments', () => {
    assert.match(active, /20%/);
    assert.match(body('compensation-included-indirect-service-component'), /10 minutes/);
    assert.doesNotMatch(body('compensation-included-indirect-service-component'), /20%|12 minutes/);
    assert.match(body('supervision-procedures'), /60 completed individual\/triadic supervision hours plus 40 group supervision opportunities offered/);
    assert.match(body('compensation-level-expectations-and-review'), /four \(4\) hours/);
    assert.doesNotMatch(body('compensation-level-expectations-and-review'), /\beight\b|school/i);
    assert.doesNotMatch(body('non-mandatory-company-events'), /\beight\b|school/i);
    assert.equal(section('school-support-activity-hours'), undefined);
  });
  it('permits eligible individual H2014 and pays a distinct supplement only for actual groups', () => {
    assert.match(body('therapy-plus-tutoring-groups'), /at least three clients/);
    assert.match(body('therapy-plus-tutoring-groups'), /at least two actual participants/);
    assert.match(body('therapy-plus-tutoring-groups'), /one client attends, an eligible individual H2014 skills session may proceed/);
    assert.match(body('therapy-plus-tutoring-groups'), /\$5 per attendee/);
    assert.match(body('therapy-plus-tutoring-groups'), /Count the base service compensation once/);
    assert.match(body('therapy-plus-tutoring-groups'), /An individual session has no group supplement/);
    assert.doesNotMatch(active, /Individual skills services are not (?:offered|currently provided) through insurance/);
    assert.match(body('therapy-plus-tutoring-blended-visit'), /sequential, separately identifiable service periods/);
    assert.match(body('therapy-plus-tutoring-documentation-and-billing'), /not automatically a two-unit claim/);
    assert.match(body('therapy-plus-tutoring-documentation-and-billing'), /must not be automatically transferred to the family/);
  });
  it('keeps actual missing NLU operational text pending and retains the shared student evaluation', () => {
    for (const slug of ['company-fees-and-associated-policy', 'scheduling-and-consistent-hours-policy']) {
      assert.equal(section(slug).content_status, 'pending');
      assert.equal(body(slug), '');
    }
    assert.match(body('student-training-program-program-structure'), /approved NLU centers/);
    assert.equal(source.forms.studentTrainingEvaluation.sections.length, 7);
    assert.equal(body(source.forms.studentTrainingEvaluation.sectionSlug), source.forms.studentTrainingEvaluation.sectionBodyHtml);
  });
  it('has valid navigation and exact ready policy destinations without foreign update IDs', () => {
    validateHandbookSections(source.sections);
    for (const s of source.sections) for (const [, target] of s.body_html.matchAll(/href="#handbook-([^"]+)"/g)) assert.ok(section(target), `${s.slug} → ${target}`);
    assert.equal(source.reviewUpdates.length, 35);
    assert.ok(source.reviewUpdates.every(update => update.period_label === 'October 2026'));
    for (const update of source.reviewUpdates) {
      assert.match(update.id, /^nlu-source-/);
      for (const target of update.policy_section_slugs) assert.equal(section(target)?.content_status, 'ready', target);
      assert.doesNotMatch(update.changed_content.replace('ITSCO retains its separate policy.', ''), /Skill Builders|ITSCO|school-assigned/i);
    }
    assert.equal(handbookMetadata(source).presentation.theme, 'nlu-foundations');
  });
  it('uses only NLU saved self-assessment templates when supplied', () => {
    const nlu = getHandbookSource({ slug: 'nlu' }, { employeeTemplates: [{ slug: 'academic_tutor', name: 'Academic tutor', version: 2, rubric_json: { sections: [] } }] });
    assert.deepEqual(nlu.forms.employeeSelfAssessments.map(f => f.slug), ['academic_tutor']);
    assert.ok(nlu.sections.find(s => s.slug === 'employee-self-assessment-academic-tutor'));
    assert.notEqual(nlu.revision, source.revision);
  });
  it('preserves every line of the new roles, safety/workforce and attendance/separation archives', () => {
    const imported = JSON.parse(readFileSync(new URL('../../content/handbooks/nlu-operations-import.json', import.meta.url)));
    assert.equal(imported.batches.length, 3);
    assert.equal(imported.batches.flatMap(b => b.sections).length, 15);
    for (const batch of imported.batches) {
      const raw = readFileSync(new URL(`../../content/handbooks/${batch.sourceArchive}`, import.meta.url));
      assert.equal(createHash('sha256').update(raw).digest('hex'), batch.sourceSha256);
      const lines = raw.toString().trimEnd().split('\n');
      const covered = batch.sections.flatMap(s => s.lines).join('\n').trimEnd();
      assert.equal(covered, lines.join('\n'));
      for (const s of batch.sections) assert.equal(s.lines.length, s.sourceEndLine - s.sourceStartLine + 1);
    }
  });
  it('imports NLU duties with scope, group restrictions and app timekeeping instead of school assignments', () => {
    assert.equal(section('typical-duties-mental-health-facilitator').title, 'Typical Duties – Learning & Wellness Facilitator');
    for (const slug of ['typical-duties-mental-health-facilitator', 'typical-duties-academic-tutor', 'typical-duties-mental-health-counselor']) {
      assert.equal(section(slug).content_status, 'ready');
      assert.match(body(slug), /Eligible individual H2014 skills services are permitted/);
      assert.match(body(slug), /actual-time reporting in the app/);
      assert.match(body(slug), /two or more actual participants/);
    }
    assert.match(body('typical-duties-academic-tutor'), /Provide one-on-one tutoring/);
    assert.match(body('typical-duties-mental-health-counselor'), /Conduct clinical assessments/);
    assert.match(body('student-training-program-program-overview'), /non-clinical academic placement requires an appropriate learning plan/);
    assert.match(body('supervision-and-professional-development'), /at least once weekly/);
  });
  it('gives safety procedures exact destinations, preserves urgent calls and imports attendance without pay forfeiture', () => {
    for (const slug of ['nlu-general-safety', 'nlu-unlocked-unattended-building', 'nlu-client-elopement', 'nlu-parent-pickup', 'nlu-crisis-response', 'nlu-emergency-contacts', 'nlu-safety-training-review']) {
      assert.equal(section(slug).parent_slug, 'workplace-safety-policy-and-procedures');
      assert.equal(section(slug).content_status, 'ready');
      assert.ok(source.reviewUpdates.some(u => u.policy_section_slugs.includes(slug)));
    }
    assert.match(body('nlu-parent-pickup'), /15–30 minutes/);
    assert.match(body('nlu-parent-pickup'), /safe, supervised area/);
    assert.match(body('nlu-emergency-contacts'), /call 911 first/);
    assert.doesNotMatch(body('nlu-emergency-contacts'), /Insert main office number/);
    assert.match(body('client-policies-and-attendance'), /client’s applicable signed agreement/);
    assert.match(body('client-policies-and-attendance'), /package.*exemption/i);
    assert.match(body('client-policies-and-attendance'), /Medicaid-only/);
    assert.match(body('client-policies-and-attendance'), /primary/i);
    assert.match(body('client-policies-and-attendance'), /does not cancel wages earned/);
    assert.doesNotMatch(body('client-policies-and-attendance'), /will not be paid out|Charge a Fee for this Missed Appointment/);
    assert.match(body('employee-separation-and-transitions-resignation-and-termination'), /protected leave/);
  });
});
