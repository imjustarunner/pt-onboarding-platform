import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ITSCO_EVALUATION_RUBRICS } from '../../seeds/itscoEmployeeEvaluationRubrics.js';

describe('evaluation appendices', () => {
  it('includes every role, criterion, rating anchor and reflection from the real self-assessment definitions', () => {
    const source = getHandbookSource({ slug: 'itsco' });
    assert.equal(source.forms.employeeSelfAssessments.length, 6);
    for (const form of source.forms.employeeSelfAssessments) {
      const definition = Object.values(ITSCO_EVALUATION_RUBRICS).find(t => t.slug === form.slug);
      assert.deepEqual(form.rubric, definition.rubric);
      const section = source.sections.find(s => s.slug === form.sectionSlug);
      assert.equal(section.parent_slug, 'appendix-i');
      assert.equal(section.body_html, form.sectionBodyHtml);
      const body = plain(section.body_html);
      for (const s of definition.rubric.sections) for (const c of s.criteria) {
        assert.ok(body.includes(c.label), c.label);
        for (const anchor of Object.values(c.anchors)) assert.ok(body.includes(anchor), anchor);
      }
      for (const prompt of definition.rubric.reflectionPrompts) assert.ok(body.includes(prompt.label));
    }
    assert.ok(!source.sections.some(s => s.slug === 'appendix-h'));
  });
  it('snapshots current saved forms and changes the source revision when a rubric changes', () => {
    const saved = { slug: 'current_role', name: 'Current role', version: 3, rubric_json: { sections: [{ key: 's', title: 'New criteria', criteria: [{ key: 'c', label: 'Current expectation', anchors: { 1: '<script>literal</script>' } }] }] }, responses: [{ private: 'Never include this' }] };
    const before = getHandbookSource({ slug: 'itsco' }, { employeeTemplates: [saved] });
    assert.equal(before.forms.employeeSelfAssessments.length, 1);
    assert.equal(before.forms.employeeSelfAssessments[0].version, 3);
    assert.ok(!JSON.stringify(before).includes('Never include this'));
    assert.match(before.forms.employeeSelfAssessments[0].sectionBodyHtml, /&lt;script&gt;literal&lt;\/script&gt;/);
    saved.rubric_json.sections[0].criteria[0].label = 'Revised expectation';
    const after = getHandbookSource({ slug: 'itsco' }, { employeeTemplates: [saved] });
    assert.notEqual(before.revision, after.revision);
    assert.equal(before.forms.employeeSelfAssessments[0].rubric.sections[0].criteria[0].label, 'Current expectation');
    assert.ok(handbookChanges(before.sections, after.sections).some(c => c.slug === 'employee-self-assessment-current-role' && c.kind === 'updated'));
  });
  it('uses the same seven-category intern rubric without losing the original scoring descriptions', () => {
    const source = getHandbookSource({ slug: 'itsco' });
    const form = source.forms.studentTrainingEvaluation;
    assert.equal(form.sections.length, 7);
    assert.equal(form.sections.reduce((total, s) => total + s.maxPoints, 0), 100);
    const original = plain(appendixImport.sections.find(s => s.slug === form.sectionSlug).bodyHtml);
    for (const section of form.sections) for (const band of section.bands) assert.ok(original.includes(band.description), band.description);
    assert.equal(source.sections.find(s => s.slug === form.sectionSlug).body_html, form.sectionBodyHtml);
  });
});
import { getHandbookSource, cleanHandbookHtml, handbookChanges, mergeSuppliedSections, validateHandbookSections, handbookBodyHash, mapHandbookReviewUpdates, handbookMetadata } from '../workplaceHandbookContent.js';

const section = (slug, overrides = {}) => ({ slug, title: slug, body_html: '<p>Original wording</p>', content_status: 'ready', sort_order: 0, parent_slug: null, ...overrides });
const readContent = name => JSON.parse(readFileSync(new URL(`../../content/handbooks/${name}`, import.meta.url), 'utf8'));
const imported = readContent('itsco-before-reconciliation.json');
const attendanceImport = readContent('itsco-attendance-and-supervision-import.json');
const roleImport = readContent('itsco-role-expectations-and-programs-import.json');
const appendixImport = readContent('itsco-organization-and-appendices-import.json');
const batchSections = [...attendanceImport.sections,...roleImport.sections,...appendixImport.sections];
const suppliedBaseline = { sections:[...imported.sections.filter(s => !batchSections.some(a => a.slug === s.slug)), ...batchSections] };
const audit = readContent('itsco-reconciliation.json');
const plain = html => html.replace(/<\/?a\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const normalize = value => value.replace(/\s+/g, ' ').trim();
describe('supplied workplace handbook content', () => {
  it('preserves original outline identities and records the two replacement titles', () => {
    const source = getHandbookSource({ slug: 'itsco' });
    const original = readFileSync(new URL('../../content/handbooks/itsco-contents-original.txt', import.meta.url), 'utf8').trim().split('\n');
    const excerpts = source.importNotes.flatMap(n => n.sourceExcerpts || []);
    for (const line of original) {
      const [title, page] = line.split('\t');
      const alias = source.importNotes.find(n => n.originalTitle === title && n.originalSourcePage === Number(page));
      assert.ok(source.sections.some(s => (s.title === title || s.slug === alias?.sectionSlug) && s.source_page === Number(page)) || excerpts.some(e => e.text === title && e.sourcePage === Number(page)), title);
    }
    assert.equal(source.sections.length, 173);
    assert.equal(source.sections.filter(s => s.content_status === 'ready').length, 154);
    assert.equal(source.sections.filter(s => !s.parent_slug).length, 28);
    assert.equal(source.sections.filter(s => s.content_status === 'pending' && s.body_html).length, 0);
  });
  it('preserves all role/program source text, including repeated program headings and the original classification conflict', () => {
    const lines=readFileSync(new URL('../../content/handbooks/itsco-role-expectations-and-programs-original.txt',import.meta.url),'utf8').split('\n');
    for (const s of roleImport.sections) {
      assert.equal(lines[s.sourceStartLine-1].trim(),s.title,s.slug);
      const body=lines.slice(s.sourceStartLine,s.sourceEndLine).map(l=>l.trim()).filter(Boolean).join(' ');
      assert.equal(normalize(plain(s.bodyHtml)),normalize(body),s.slug);
    }
    assert.equal(roleImport.sections.filter(s=>s.status==='ready').length,18);
    assert.match(roleImport.sections.find(s=>s.slug==='student-classification').bodyHtml,/classified as employees and not as 1099 contractors/);
    assert.match(roleImport.sections.find(s=>s.slug==='section-b-intern-mental-health-providers').bodyHtml,/do not hold independent clinical authority or employee status unless/);
  });
  it('archives the complete attendance and supervision paste before replacing 17 conflicting sections', () => {
    const original = readFileSync(new URL('../../content/handbooks/itsco-attendance-and-supervision-original.txt', import.meta.url), 'utf8');
    const byTitle = new Map(attendanceImport.sections.map(s => [s.title,s]));
    const supplied = new Map();
    let current;
    for (const line of original.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (byTitle.has(line)) { current=byTitle.get(line); supplied.set(current.slug,[]); }
      else { assert.ok(current); supplied.get(current.slug).push(line.replace(/^\d+\.\s+/, '')); }
    }
    for (const [slug,lines] of supplied) {
      const section = attendanceImport.sections.find(s => s.slug === slug);
      assert.equal(normalize(plain(section.bodyHtml)), normalize(lines.join(' ')), slug);
    }
    assert.equal([...supplied.values()].filter(lines => lines.length).length,20);
    assert.equal(audit.sections.filter(s => s.sourceArchive === 'itsco-attendance-and-supervision-import.json').length,17);
  });
  for (const [name, count] of [
    ['itsco-foundations-and-workplace-original.txt', 13],
    ['itsco-safety-workforce-and-roles-original.txt', 20],
    ['itsco-leave-benefits-and-compensation-original.txt', 46]
  ]) it(`archives all ${count} supplied sections in ${name} before authorized replacements`, () => {
    const original = readFileSync(new URL(`../../content/handbooks/${name}`, import.meta.url), 'utf8').replace(/actions bas\s+ed on/, 'actions based on');
    const byTitle = new Map(imported.sections.map(s => [s.title, s]));
    const supplied = new Map();
    let current;
    for (const line of original.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (byTitle.has(line)) { current = byTitle.get(line); supplied.set(current.slug, []); }
      else { assert.ok(current); supplied.get(current.slug).push(line.replace(/^- /, '')); }
    }
    for (const [slug, lines] of supplied) {
      const originalSection = imported.sections.find(s => s.slug === slug);
      assert.equal(normalize(plain(originalSection.bodyHtml)), normalize(lines.join(' ')), slug);
    }
    assert.equal([...supplied.values()].filter(lines => lines.length).length, count);
  });
  it('records each replaced or added policy and keeps unrelated supplied text intact', () => {
    const current = readContent('itsco.json');
    const changes = new Map(audit.sections.map(s => [s.slug, s]));
    for (const section of current.sections) {
      const before = suppliedBaseline.sections.find(s => s.slug === section.slug);
      const change = changes.get(section.slug);
      if (!before || before.bodyHtml !== section.bodyHtml) {
        assert.ok(change?.updateEntryIds.length, section.slug);
        assert.equal(change.bodySha256, createHash('sha256').update(section.bodyHtml).digest('hex'), section.slug);
      }
    }
    assert.equal(current.sections.find(s => s.slug === 'welcome').bodyHtml, imported.sections.find(s => s.slug === 'welcome').bodyHtml);
    const source = getHandbookSource({ slug: 'itsco' });
    const before = imported.sections.map((s, i) => ({ slug:s.slug, title:s.title, body_html:s.bodyHtml, content_status:s.status, parent_slug:s.parentSlug, sort_order:i }));
    const delta = handbookChanges(before, source.sections);
    assert.ok(delta.length > 30);
    const moved = delta.filter(change=>change.kind==='moved').map(change=>change.slug);
    assert.ok(moved.every(slug => ['program-overview','program-structure','expectations-of-facilitators','disclosure-and-liability','expectations-of-the-practice'].includes(slug)));
  });
  it('organizes missing Section C and Skill Builders without changing permanent links or inventing pages', () => {
    const source=getHandbookSource({slug:'itsco'});
    const roleC=source.sections.find(s=>s.slug==='section-c-pre-licensed-and-unlicensed-masters-level-providers-tier-2');
    assert.equal(roleC.parent_slug,'role-based-practice-expectations');
    assert.equal(roleC.source_page,null);
    assert.equal(source.sections[source.sections.indexOf(roleC)-1].slug,'section-b-intern-mental-health-providers');
    assert.equal(source.sections[source.sections.indexOf(roleC)+1].slug,'section-d-licensed-providers-and-clinical-supervisors-tier-3');
    for(const slug of ['program-overview','program-structure','expectations-of-facilitators','disclosure-and-liability','expectations-of-the-practice']) {
      const section=source.sections.find(s=>s.slug===slug);
      assert.equal(section.parent_slug,'skill-builders-program');
      assert.equal(section.source_page,imported.sections.find(s=>s.slug===slug).sourcePage);
    }
    assert.equal(source.sections.find(s=>s.slug==='student-training-program-program-overview').parent_slug,'student-training-program');
    assert.equal(source.sections.find(s=>s.slug==='diagnosis-codes-allowed-for-sb23-174-services').content_status,'pending');
  });
  it('archives every supplied organization and appendix line before reconciling policies', () => {
    const lines=readFileSync(new URL('../../content/handbooks/itsco-organization-and-appendices-original.txt',import.meta.url),'utf8').split('\n');
    for(const section of appendixImport.sections) {
      assert.equal(lines[section.sourceStartLine-1].trim(),section.title,section.slug);
      const body=lines.slice(section.sourceStartLine,section.sourceEndLine).map(l=>l.trim()).filter(Boolean).join(' ');
      assert.equal(normalize(plain(section.bodyHtml)),normalize(body),section.slug);
    }
    assert.equal(appendixImport.sections.filter(s=>s.status==='ready').length,11);
    const source=getHandbookSource({slug:'itsco'});
    const body=slug=>source.sections.find(s=>s.slug===slug).body_html;
    for(const slug of ['organizational-structure','administrative-responsibilities','billing-and-support-responsibilities','management-company','overview-of-the-collective','pay-periods-compensation-schedule','vacation-out-of-office-prompt']) {
      assert.equal(body(slug),appendixImport.sections.find(s=>s.slug===slug).bodyHtml,slug);
    }
    const pay=body('pay-periods-compensation-schedule');
    assert.equal((pay.match(/<tbody>[\s\S]*?<\/tbody>/g)[0].match(/<tr>/g)||[]).length,27);
    assert.match(pay,/<th>12\/6\/25 to 12\/19\/25<\/th><td>12\/26\/25<\/td>/);
    assert.match(pay,/<th>12\/5\/26 to 12\/18\/26<\/th><td>12\/25\/26<\/td>/);
    const rubric=body('clinical-development-supervision-rubric');
    assert.equal((rubric.match(/<table>/g)||[]).length,7);
    assert.equal((rubric.match(/<tr>/g)||[]).length,28);
    assert.equal([...rubric.matchAll(/<h4>[^<]+\((\d+) points\)<\/h4>/g)].reduce((sum,m)=>sum+Number(m[1]),0),100);
    assert.match(body('responsibilities-of-the-supervisor'),/href="#handbook-clinical-development-supervision-rubric"/);
    assert.match(body('responsibilities-of-the-supervisor'),/Appendix H for billing\/compliance/);
    assert.ok(!source.sections.some(s=>s.slug==='appendix-h'));
    assert.match(body('billable-diagnoses'),/Appendix C · Diagnosis reference/);
    assert.equal(body('diagnosis-codes-allowed-for-sb23-174-services'),'');
    assert.match(body('vacation-out-of-office-prompt'),/mailto:support@itsco.health/);
    assert.equal((body('vacation-out-of-office-prompt').match(/THIS LINK/g)||[]).length,2);
  });
  it('preserves all fee amounts while applying current billing, group and compensation restrictions to appendices', () => {
    const source=getHandbookSource({slug:'itsco'});
    const body=slug=>source.sections.find(s=>s.slug===slug).body_html;
    const fees=body('company-fees-and-associated-policy');
    const feeAmounts=html=>[...html.matchAll(/<tr><th>([^<]+)<\/th><td>[\s\S]*?<\/td><td>([^<]+)<\/td><\/tr>/g)].map(m=>[m[1],m[2]]);
    const originalFees=appendixImport.sections.find(s=>s.slug==='company-fees-and-associated-policy').bodyHtml;
    assert.equal(feeAmounts(fees).length,34);
    assert.deepEqual(feeAmounts(fees),feeAmounts(originalFees));
    assert.match(fees,/client fees, not employee compensation rates/);
    assert.match(fees,/Do not charge this fee to clients with Medicaid/);
    assert.match(fees,/after 5:00 p.m. on weekdays/);
    assert.doesNotMatch(fees,/two consecutive 90834|regardless if it occurs at an alternative time|outside of Monday through Friday between 8-5pm|reserve the right to modify these rates at their discretion/);
    assert.match(fees,/#handbook-mileage-reimbursement-policy/);
    const codes=body('services-codes-included-in-the-sb23-174-coverage-policy');
    assert.equal((codes.match(/<tbody>[\s\S]*?<\/tbody>/g)[0].match(/<tr>/g)||[]).length,18);
    assert.match(codes,/<th>H2014<\/th><td>[^<]+<\/td><td>Skill Builders only, with express written approval. Not approved for individual services./);
    assert.match(codes,/<th>H2017<\/th><td>[^<]+<\/td><td>Express written permission required before any use/);
    for(const code of ['90849','90853','H0005']) assert.match(codes,new RegExp(`<th>${code}</th><td>[^<]+</td><td>Group moratorium`));
    assert.match(body('billable-diagnoses'),/denied claim or self-pay funding does not erase earned pay/);
    for(const change of audit.sections.filter(s=>s.sourceArchive==='itsco-organization-and-appendices-import.json')) {
      for(const id of change.updateEntryIds) assert.ok(source.reviewUpdates.find(e=>e.id===id).policy_section_slugs.includes(change.slug),`Update ${id}: ${change.slug}`);
    }
  });
  it('transcribes Appendix C exactly and retains the source date and current-policy links', () => {
    const archive=readContent('itsco-appendix-c-image-import.json');
    const source=getHandbookSource({slug:'itsco'});
    const section=source.sections.find(s=>s.slug==='billable-diagnoses');
    const tables=section.body_html.match(/<table>[\s\S]*?<\/table>/g);
    const rows=table=>[...table.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)].map(m=>[m[1],m[2]]);
    assert.equal(tables.length,2);
    assert.equal(archive.mentalHealthRanges.length,12);
    assert.equal(archive.substanceUseRanges.length,10);
    assert.deepEqual(rows(tables[0]),archive.mentalHealthRanges);
    assert.deepEqual(rows(tables[1]),archive.substanceUseRanges);
    assert.match(section.body_html,/January 1, 2024/);
    assert.match(section.body_html,/under 21/);
    assert.match(section.body_html,/not a newly verified coverage list/);
    assert.match(section.body_html,/#handbook-group-services-moratorium-and-exceptions/);
    assert.ok(section.body_html.includes(archive.autism.serviceCodes.join(', ')));
    assert.equal(section.source_page,140);
    assert.equal(archive.screenshotPage,163);
    const metadata=handbookMetadata(source);
    assert.equal(metadata.presentation.theme,'itsco-foundations');
    assert.deepEqual(metadata.presentation.founders.map(p=>p.name),['Rachel Finch','Michael Mendez']);
    metadata.presentation.founders[0].name='Changed copy';
    assert.equal(source.presentation.founders[0].name,'Rachel Finch');
    for(const slug of ['history-and-background-of-itsco','vision','mission','goals','values']) assert.equal(source.sections.find(s=>s.slug===slug).body_html,imported.sections.find(s=>s.slug===slug).bodyHtml,slug);
  });
  it('keeps role permissions subject to the group moratorium and removes pay-forfeiture language', () => {
    const source=getHandbookSource({slug:'itsco'});
    const body=slug=>source.sections.find(s=>s.slug===slug).body_html;
    for(const slug of ['section-a-clinical-support-providers-tier-1','section-b-intern-mental-health-providers','section-c-pre-licensed-and-unlicensed-masters-level-providers-tier-2','section-d-licensed-providers-and-clinical-supervisors-tier-3','program-overview','program-structure','expectations-of-student']) assert.match(body(slug),/#handbook-group-services-moratorium-and-exceptions/);
    assert.match(body('section-a-clinical-support-providers-tier-1'),/may not provide or bill H0004/);
    assert.match(body('program-overview'),/H2014.*not approved for individual services/);
    assert.match(body('program-overview'),/H0025 and H2032 are not currently approved/);
    assert.match(body('expectations-of-facilitators'),/Do not withhold earned compensation or lower a completed service to an Indirect Service rate/);
    assert.match(body('expectations-of-facilitators'),/included 20% indirect allowance/);
    assert.match(body('expectations-of-facilitators'),/planning and review measures, not compensation caps/);
    assert.match(body('section-e-non-clinical-staff'),/#handbook-compensation-support-activity/);
    assert.match(body('section-c-pre-licensed-and-unlicensed-masters-level-providers-tier-2'),/60 completed individual\/triadic hours plus 40 group opportunities offered/);
    assert.match(body('supervision-and-professional-development'),/at least once weekly/);
    assert.match(body('supervision-and-professional-development'),/separate from the pre-licensed 60\/40 benefit transition/);
    const current=roleImport.sections.map(s=>body(s.slug)).join('\n');
    for(const obsolete of ['Services delivered outside authorization parameters are not compensable','Late Documentation Penalty','Compensation for direct services may be withheld','classified as employees and not as 1099 contractors']) assert.ok(!current.includes(obsolete),obsolete);
    assert.match(body('student-classification'),/Employee status requires a separate written employment agreement/);
    for(const change of audit.sections.filter(s=>s.sourceArchive==='itsco-role-expectations-and-programs-import.json')) assert.ok(source.reviewUpdates.some(e=>e.policy_section_slugs.includes(change.slug)),`Missing updater destination: ${change.slug}`);
  });
  it('applies the confirmed 60/40 milestone and separates required-work pay from supervision benefits', () => {
    const source = getHandbookSource({ slug:'itsco' });
    const body = slug => source.sections.find(s => s.slug === slug).body_html;
    for (const slug of ['supervision-procedures','roles-of-the-supervisor','responsibilities-of-the-supervisee']) {
      assert.match(body(slug), /60 completed individual\/triadic supervision hours plus 40 group supervision opportunities offered/);
      assert.doesNotMatch(body(slug), /At 100 total supervision hours|At 60 hours \(individual\/triadic\)/);
    }
    assert.match(body('supervision-procedures'), /two 30-minute sessions/);
    assert.match(body('supervision-procedures'), /Offered group opportunities are not recorded as hours attended/);
    assert.match(body('supervision-procedures'), /Required supervision and other compensable employee work remain payable/);
    assert.match(body('responsibilities-of-the-supervisor'), /50% of the individually contracted supervision hourly rate per actual review hour/);
    assert.match(body('legal-and-ethical-compliance'), /Supervisor-mandated oversight is assigned work/);
    const batch = attendanceImport.sections.map(s => body(s.slug)).join('\n');
    for (const obsolete of ['generated by Gemini','generated by Google’s Gemini','All supervision sessions are conducted via Google Meet','Providers acknowledge that reduced rates result in reduced compensation','Providers acknowledge that pro-bono services are uncompensated','compensation may be denied or adjusted','Compensation: Logged as Indirect Time']) assert.ok(!batch.includes(obsolete),obsolete);
    assert.match(body('organizational-meetings-policy'), /Support Activity Rate/);
    assert.match(body('voluntary-training-opportunities'), /My Payroll/);
    assert.match(body('non-mandatory-company-events'), /eight-hour total while school-assigned/);
    assert.match(body('attendance-non-provider-employees'), /general advance-approval rule does not override protected leave/);
    assert.match(body('performance-and-expectations'), /does not automatically reduce the employee’s compensation/);
    assert.match(body('performance-and-expectations'), /Pro-bono describes the charge to the client/);
    assert.match(body('attendance-providers-and-facilitators'), /app’s authorized school communication workflow/);
    assert.doesNotMatch(body('attendance-providers-and-facilitators'), /href="mailto:wyatt@itsco.health"/);
    assert.match(body('client-policies-and-attendance'), /\$100/);
    assert.match(body('client-policies-and-attendance'), /\$80/);
    assert.match(body('client-policies-and-attendance'), /Under no circumstances will clients with Medicaid be charged/);
    assert.equal(body('crisis-management-policy'), attendanceImport.sections.find(s => s.slug === 'crisis-management-policy').bodyHtml);
    assert.equal(body('missed-sessions-due-to-snow-day-or-unexpected-absences'),'');
  });
  it('keeps all policy cross-references valid after the attendance and supervision import', () => {
    const source = getHandbookSource({slug:'itsco'});
    const slugs = new Set(source.sections.map(s=>s.slug));
    for (const section of source.sections) for (const match of section.body_html.matchAll(/href="#handbook-([^"]+)"/g)) assert.ok(slugs.has(match[1]), `${section.slug}: ${match[1]}`);
    for (const [id,slug] of [[4,'supervision-procedures'],[15,'attendance-providers-and-facilitators'],[23,'continuing-education'],[25,'performance-and-expectations']]) assert.ok(source.reviewUpdates.find(e=>e.id===id).policy_section_slugs.includes(slug));
    for (const change of audit.sections.filter(s => s.sourceArchive === 'itsco-attendance-and-supervision-import.json')) assert.ok(source.reviewUpdates.some(e => e.policy_section_slugs.includes(change.slug)), `Missing updater destination: ${change.slug}`);
  });
  it('removes superseded allowance, revenue-share, and late-payment rules from current policy', () => {
    const source = getHandbookSource({ slug: 'itsco' });
    const current = source.sections.map(s => s.body_html).join('\n');
    for (const phrase of ['10 minutes per direct-hour', '10/60', '7/6 accrual', 'retain approximately 90%', 'retain 92%', 'Are not guaranteed payment', '60-calendar-day waiver', 'Grasshopper Employee Texting Policy']) assert.ok(!current.includes(phrase), phrase);
    assert.match(source.sections.find(s => s.slug === 'compensation-integrated-service-compensation').body_html, /20%/);
    assert.match(source.sections.find(s => s.slug === 'compensation-minimum-workload-rate').body_html, /November 13, 2026/);
    assert.match(source.sections.find(s => s.slug === 'increased-self-pay-rates').body_html, /individual service and duty rates/);
    assert.match(source.sections.find(s => s.slug === 'health-insurance-employer-contribution').body_html, /employee-only coverage/);
    const rates = source.sections.filter(s => s.slug.startsWith('compensation-rate-category-'));
    assert.equal(rates.length, 3);
    for (const category of rates) for (const table of category.body_html.match(/<table[^>]*>[\s\S]*?<\/table>/g)) {
      const rows = table.match(/<tr>[\s\S]*?<\/tr>/g);
      assert.ok(rows.every(row => (row.match(/<(?:th|td)(?:\s|>)/g) || []).length === 3));
    }
  });
  it('gives all 19 updater entries real policy destinations and matching source mappings', () => {
    const source = getHandbookSource({ slug: 'itsco' });
    assert.equal(source.reviewUpdates.length, 19);
    for (const entry of source.reviewUpdates) {
      assert.ok(entry.policy_section_slugs.length, entry.subject);
      for (const slug of entry.policy_section_slugs) {
        assert.ok(source.sections.some(s => s.slug === slug && s.content_status === 'ready' && s.body_html), slug);
      }
      const [live] = mapHandbookReviewUpdates(source, [{ id:entry.id, subject:entry.subject, changed_content:'live' }]);
      assert.deepEqual(live.policy_section_slugs, entry.policy_section_slugs);
      assert.equal(live.changed_content, 'live');
    }
  });
  it('never supplies ITSCO content to another organization and returns isolated source copies', () => {
    assert.equal(getHandbookSource({ slug: 'demo', name: 'ITSCO' }), null);
    const source = getHandbookSource({ slug: 'itsco' });
    source.sections[0].title = 'Changed';
    assert.equal(getHandbookSource({ slug: 'itsco' }).sections[0].title, 'FOUNDATIONS OF ITSCO');
  });
  it('retains the original updates and insurance clarification as drafts and prefers live wording and saved section links', () => {
    const source = getHandbookSource({ slug: 'itsco' });
    assert.equal(source.reviewUpdates.length, 19);
    assert.ok(source.reviewUpdates.every(e => e.status === 'draft'));
    const keys = new Set(source.sections.map(s => s.slug));
    assert.ok(source.reviewUpdates.every(e => keys.has(e.handbook_section_slug) && e.related_section_slugs.every(k => keys.has(k))));
    const [entry] = source.reviewUpdates;
    const [mapped] = mapHandbookReviewUpdates(source, [{ subject: entry.subject, changed_content: 'New live wording', status: 'draft' }]);
    assert.equal(mapped.changed_content, 'New live wording');
    assert.equal(mapped.handbook_section_slug, entry.handbook_section_slug);
    const [saved] = mapHandbookReviewUpdates(source, [{ subject: entry.subject, handbook_section_slug: 'welcome' }]);
    assert.equal(saved.handbook_section_slug, 'welcome');
    const digital = source.reviewUpdates.find(e => e.subject === 'Digital workplace and transition procedures');
    assert.ok(digital.related_section_slugs.includes('professional-conduct'));
    assert.match(source.sections.find(s => s.slug === 'professional-conduct').body_html, /Secure workplace communication/);
    const groups = source.reviewUpdates.find(e => e.id === 13);
    for (const slug of ['direct-behavioral-health-services-hcpcs', 'typical-duties-mental-health-counselor', 'typical-duties-mental-health-facilitator', 'typical-duties-intern-mental-health-provider', 'typical-duties-skill-development-coordinator']) {
      assert.ok(groups.related_section_slugs.includes(slug), slug);
    }
    assert.ok(source.reviewUpdates.find(e => e.id === 4).related_section_slugs.includes('indirect-services'));
    assert.ok(source.reviewUpdates.find(e => e.id === 14).related_section_slugs.includes('career-pathway-overview'));
    assert.equal(getHandbookSource({ slug: 'demo' }), null);
  });
  it('keeps existing complete policy when the next paste only has an outline', () => {
    const old = section('leave', { body_html: '<p>Approved leave policy.</p>' });
    const merged = mergeSuppliedSections([section('leave', { content_status: 'pending', body_html: '' })], [old, section('custom')]);
    assert.equal(merged[0].body_html, old.body_html);
    assert.equal(merged[0].content_status, 'ready');
    assert.equal(merged[1].slug, 'custom');
  });
  it('tracks additions, changes, renames and removals but does not announce missing text', () => {
    const before = [section('welcome'), section('leave'), section('benefits'), section('hours')];
    const after = [section('welcome', { body_html: '<p>New wording</p>' }), section('leave', { title: 'Time off' }), section('new'), section('hours', { content_status: 'pending', body_html: '' }), section('outline', { content_status: 'pending', body_html: '' })];
    assert.deepEqual(handbookChanges(before, after).map(c => [c.slug, c.kind]), [['welcome','updated'], ['leave','renamed'], ['new','added'], ['hours','removed'], ['benefits','removed']]);
    assert.equal(handbookChanges(before, before).length, 0);
  });
  it('preserves newer in-app wording when that source section has not changed', () => {
    const original = section('leave');
    original.source_body_hash = handbookBodyHash(original.body_html);
    const edited = { ...original, body_html: '<p>New approved wording in the app.</p>' };
    assert.equal(mergeSuppliedSections([original], [edited])[0].body_html, edited.body_html);
    const incoming = { ...original, body_html: '<p>A different source change.</p>', source_body_hash: handbookBodyHash('<p>A different source change.</p>') };
    assert.throws(() => mergeSuppliedSections([incoming], [edited]), /newer in-app wording/);
  });
  it('requires explicit source removals and preserves the removed wording in the change record', () => {
    const previous = [section('welcome'), section('leave')];
    const merged = mergeSuppliedSections([section('welcome')], previous, ['leave']);
    assert.equal(merged.length, 1);
    const changes = handbookChanges(previous, merged);
    assert.equal(changes[0].kind, 'removed');
    assert.equal(changes[0].beforeHtml, '<p>Original wording</p>');
  });
  it('does not announce every existing section as moved when a new section is inserted', () => {
    const before = [section('a'), section('b', { sort_order: 1 })];
    const after = [section('new'), section('a', { sort_order: 1 }), section('b', { sort_order: 2 })];
    assert.deepEqual(handbookChanges(before, after).map(s => [s.slug, s.kind]), [['new','added']]);
  });
  it('rejects broken outline links, duplicates and cycles', () => {
    for (const sections of [[section('a'), section('a')], [section('a', { parent_slug: 'missing' })], [section('a', { parent_slug: 'b' }), section('b', { parent_slug: 'a' })]]) assert.throws(() => validateHandbookSections(sections));
  });
  it('removes active HTML while keeping handbook structure', () => {
    const clean = cleanHandbookHtml('<script>steal()</script><p onclick="steal()">Policy <strong>text</strong></p><a href="javascript:steal()">Unsafe</a><table><tr><td colspan="2">Table</td></tr></table>');
    assert.doesNotMatch(clean, /script|onclick|steal/);
    assert.match(clean, /<strong>text<\/strong>/);
    assert.match(clean, /colspan="2"/);
  });
});
