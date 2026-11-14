import {describe,it,expect} from 'vitest';
import {TESTING_SERVICE_CODES} from '../../content/testingServicePolicy.js';
import {testingReferenceCatalog,TESTING_ROOT_SLUG,TESTING_PROTOCOL_SLUG,TESTING_EXAMPLES_SLUG} from '../../content/testingHandbookReference.js';
import {TESTING_CODE_EXAMPLES,testingExampleSummary} from '../../content/testingServiceExamples.js';
import {planTestingReferenceSeed,testingSeedHash} from '../testingReferenceSeed.service.js';
import {getHandbookSource,handbookMetadata} from '../workplaceHandbookContent.js';
const snapshot=()=>({agency:{id:2,slug:'itsco'},version:{id:1,is_draft:1,metadata_json:{existing:'preserve'}},sections:[{id:9,slug:'custom-section',title:'Unrelated wording',body_html:'<p>Keep exactly.</p>',content_status:'ready',parent_slug:null}],digest:{id:3,status:'draft',period_label:'November 2026'},entries:[{id:70,handbook_section_slug:'custom-section',subject:'Keep this entry',changed_content:'Existing draft changes'}]});
describe('source-backed Testing examples and seed categories',()=>{
 it.each(TESTING_SERVICE_CODES.map(d=>[d.code]))('has a precise sourced component and exclusion for %s',code=>{
  const entry=TESTING_CODE_EXAMPLES[code],summary=testingExampleSummary(code);
  expect(entry.activity.length).toBeGreaterThan(20);expect(entry.notThis.length).toBeGreaterThan(15);
  expect(summary.sourceUrl).toMatch(/^https:\/\/(hcpf\.colorado\.gov|www\.apaservices\.org|www\.molinahealthcare\.com)\//);expect(summary.sourcePage).toBeGreaterThan(0);
 });
 it('seeds one complete versioned map without making a test name an automatic code',()=>{
  const catalog=testingReferenceCatalog();expect(catalog.codes).toHaveLength(16);
  expect(catalog.codes.filter(c=>c.bucket==='credit').map(c=>c.code)).toEqual(['96116','96121','96130','96131','96132','96133']);
  expect(catalog.codes.filter(c=>c.bucket==='hcode').map(c=>c.code)).toEqual(['96136','96137','96138','96139','96146','98966','98967','98968','H0001','H0004']);
  expect(catalog.buckets.indirect).toContain('no clinical CPT code substituted');
  expect(catalog.activation).toBe('prospective_signed_schedule_only');
 });
 it.each(['itsco','nlu','tisi'])('includes the Testing tree and one November Testing update for %s',slug=>{
  const source=getHandbookSource({slug}),root=source.sections.find(s=>s.slug===TESTING_ROOT_SLUG);
  expect(root).toBeDefined();
  for(const key of [TESTING_PROTOCOL_SLUG,TESTING_EXAMPLES_SLUG])expect(source.sections.find(s=>s.slug===key)?.parent_slug).toBe(TESTING_ROOT_SLUG);
  const html=source.sections.find(s=>s.slug===TESTING_EXAMPLES_SLUG).body_html;
  for(const d of TESTING_SERVICE_CODES)expect(html).toContain(d.code);
  expect(html).toContain('Wisconsin Card Sorting Test');expect(html).toContain('California Verbal Learning Test');expect(html).toContain('Trail Making Test');
  expect(html).toContain('No product-specific mapping has been verified');
  const updates=source.reviewUpdates.filter(u=>u.handbook_section_slug===TESTING_ROOT_SLUG);
  expect(updates).toHaveLength(1);expect(updates[0].period_label).toBe('November 2026');expect(updates[0].changed_content).toContain('96139');expect(updates[0].changed_content).toContain('Sourced');
  expect(handbookMetadata(source).testingReference.codes).toHaveLength(16);
  if(slug==='nlu')expect(source.sections.find(s=>s.slug==='nlu-testing-compensation').parent_slug).toBe(TESTING_ROOT_SLUG);
 });
});
describe('targeted draft-only seed planner',()=>{
 it('preserves unrelated sections, metadata and November entries without mutating input',()=>{
  const before=snapshot(),retained=structuredClone(before),plan=planTestingReferenceSeed(before);
  expect(before).toEqual(retained);expect(plan.sectionWrites).toHaveLength(3);expect(plan.sectionWrites.some(s=>s.slug==='custom-section')).toBe(false);
  expect(plan.metadataAfter.existing).toBe('preserve');expect(plan.removeDuplicateEntryIds).toEqual([]);
  expect(plan.digestEntry.handbook_section_slug).toBe(TESTING_ROOT_SLUG);expect(plan.digestEntry.changed_content).toContain('96146');
 });
 it('is idempotent after the seed, including MySQL JSON key reordering',()=>{
  const before=snapshot(),plan=planTestingReferenceSeed(before);
  const sections=plan.sectionWrites.map((s,i)=>({id:100+i,slug:s.slug,title:s.title,body_html:s.bodyHtml,parent_slug:s.parentSlug,content_status:s.status}));
  const sortJson=value=>Array.isArray(value)?value.map(sortJson):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortJson(value[k])])):value;
  const after={...before,version:{...before.version,metadata_json:sortJson(plan.metadataAfter)},sections:[...before.sections,...sections],entries:[...before.entries,{id:80,...plan.digestEntry}]};
  const again=planTestingReferenceSeed(after);expect(again.sectionWrites).toEqual([]);expect(again.metadataChanged).toBe(false);expect(again.digestWrite).toBe(false);
 });
 it('consolidates only current draft Testing entries and keeps earlier text for backup/history',()=>{
  const before=snapshot();before.entries.push({id:71,handbook_section_slug:TESTING_PROTOCOL_SLUG,changed_content:'Original testing text'},{id:72,handbook_section_slug:'nlu-testing-compensation',changed_content:'Original compensation text'});
  const plan=planTestingReferenceSeed(before);expect(plan.digestEntryId).toBe(71);expect(plan.removeDuplicateEntryIds).toEqual([72]);expect(plan.removeDuplicateEntryIds).not.toContain(70);expect(plan.previousTestingContent).toContain('Original testing text');
 });
 it('refuses published content and duplicate section slugs',()=>{
  const before=snapshot();expect(()=>planTestingReferenceSeed({...before,version:{is_draft:0}})).toThrow('editable handbook draft');
  expect(()=>planTestingReferenceSeed({...before,digest:{status:'published',period_label:'November 2026'}})).toThrow('draft digest');
  const duplicate={id:3,slug:TESTING_PROTOCOL_SLUG};expect(()=>planTestingReferenceSeed({...before,sections:[duplicate,{...duplicate,id:4}]})).toThrow('Duplicate Testing section');
 });
 it('retains published-base metadata when preparing a missing draft and detects stale source state',()=>{
  const before=snapshot();const fresh={...before,version:null,baseVersionId:4,versions:[{id:4,metadata_json:{existing:'published metadata'}}]};
  expect(planTestingReferenceSeed(fresh).metadataAfter.existing).toBe('published metadata');
  expect(testingSeedHash([before])).not.toBe(testingSeedHash([{...before,entries:[]} ]));
 });
});
