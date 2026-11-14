import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {TESTING_PROTOCOL_HTML} from '../content/providerRolesNovember2026.js';
import {testingReferenceSections,testingReferenceCatalog,testingDigestBody,TESTING_ROOT_SLUG,TESTING_SECTION_SLUGS,TESTING_REFERENCE_VERSION} from '../content/testingHandbookReference.js';
import {cleanHandbookHtml,validateHandbookSections} from './workplaceHandbookContent.js';
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{throw Error('Handbook metadata must be valid JSON before seeding.');}};
const equal=isDeepStrictEqual;
export const testingSeedHash=snapshots=>createHash('sha256').update(JSON.stringify({reference:testingReferenceCatalog(),snapshots})).digest('hex');
/** Only draft Testing sections, its one draft digest entry and versioned metadata. */
export function planTestingReferenceSeed(snapshot) {
 const {agency,version,sections=[],digest,entries=[]}=snapshot;
 if(version&&Number(version.is_draft)!==1)throw Error('Only an editable handbook draft may be changed.');
 if(digest&&(digest.status!=='draft'||digest.period_label!=='November 2026'))throw Error('Only a November 2026 draft digest may be changed.');
 const desired=testingReferenceSections(TESTING_PROTOCOL_HTML).map(s=>({...s,bodyHtml:cleanHandbookHtml(s.bodyHtml)}));
 const compensation=sections.find(s=>s.slug==='nlu-testing-compensation');
 if(compensation)desired.push({slug:compensation.slug,title:compensation.title,bodyHtml:compensation.body_html,parentSlug:TESTING_ROOT_SLUG,status:compensation.content_status||'ready'});
 const sectionWrites=desired.flatMap(s=>{
  const matches=sections.filter(row=>row.slug===s.slug);
  if(matches.length>1)throw Error(`Duplicate Testing section ${agency.id}/${s.slug}; reconcile before seeding.`);
  const before=matches[0];
  return !before||before.title!==s.title||before.body_html!==s.bodyHtml||(before.parent_slug||null)!==s.parentSlug||before.content_status!==s.status?[{...s,id:before?.id||null}]:[];
 });
 const all=[...sections.filter(s=>!desired.some(d=>d.slug===s.slug)).map(s=>({slug:s.slug,title:s.title,parent_slug:s.parent_slug})),...desired.map(s=>({slug:s.slug,title:s.title,parent_slug:s.parentSlug}))];
 validateHandbookSections(all);
 const baseVersion=version||snapshot.versions?.find(v=>v.id===snapshot.baseVersionId);
 const metadataBefore=parse(baseVersion?.metadata_json),metadataAfter={...metadataBefore,testingReference:testingReferenceCatalog()};
 const testingEntries=entries.filter(e=>TESTING_SECTION_SLUGS.includes(e.handbook_section_slug));
 const canonical=testingEntries.find(e=>e.handbook_section_slug===TESTING_ROOT_SLUG)||testingEntries[0];
 const digestEntry={subject:'Testing — verified code examples, compensation buckets and eligibility',rationale:'Document the sourced service components, actual-time pay mappings, approved Testing role, Medicaid-only testing scope and current payer review. Preserve signed terms; reference seeding does not activate payroll or billing.',changed_content:cleanHandbookHtml(testingDigestBody(desired)),handbook_section_slug:TESTING_ROOT_SLUG};
 const digestWrite=!canonical||Object.entries(digestEntry).some(([key,value])=>canonical[key]!==value)||testingEntries.length>1;
 return {agency,sectionWrites,metadataAfter,metadataChanged:!equal(metadataBefore,metadataAfter),digestEntry,digestWrite,digestEntryId:canonical?.id||null,removeDuplicateEntryIds:testingEntries.filter(e=>e.id!==canonical?.id).map(e=>e.id),previousTestingContent:testingEntries.map(e=>e.previous_content||e.changed_content||'').filter(Boolean).join('\n'),referenceVersion:TESTING_REFERENCE_VERSION};
}
