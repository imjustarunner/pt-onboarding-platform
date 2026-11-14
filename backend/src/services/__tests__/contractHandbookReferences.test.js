import {describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {contractHandbookAnchor,linkContractHandbookHtml,readContractHandbookReference,portalContractHandbookAgency,annotateCompensationHandbookHtml} from '../contractHandbookReferences.service.js';
const agency={id:6,slug:'nlu',name:'Next Level Up'};
const sections=[{id:1,slug:'employee-contract-policy',title:'Employment agreements and handbook policies',parent_slug:null,body_html:'<p>Current employee policy.</p>'},{id:2,slug:'testing-services',title:'Testing',parent_slug:null,body_html:'<p>Approved Testing services.</p>'},{id:3,slug:'testing-code-examples-and-pay-buckets',title:'Testing code examples and pay buckets',parent_slug:'testing-services',body_html:'<p>Verified code references.</p>'}];
const index={document_id:7,version_id:18,version_number:2,sections};
describe('versioned in-contract handbook references',()=>{
 it('annotates only a newly rendered full amendment and keeps policy references inside its body',async()=>{
  const db={execute:vi.fn(async sql=>sql.includes('FROM workplace_handbook_documents')?[[{document_id:7,version_id:18,version_number:2,source_revision:'published'}]]:[sections])};
  const original='<html><body><p>Refer to the Workplace Handbook Testing area.</p></body></html>';
  const result=await annotateCompensationHandbookHtml(original,{agencyId:6,agency:{...agency,color_palette:{primary:'#6FCFBE',secondary:'#1F2A44',accent:'#9FB7A5'}},db,serviceRoles:['psychological_testing']});
  expect(result.reference).toMatchObject({agencyId:6,versionId:18,versionNumber:2});expect(result.html).toContain('data-handbook-section="testing-services"');
  expect(result.html.indexOf('contract-handbook-references')).toBeLessThan(result.html.indexOf('</body>'));expect(original).not.toContain('data-handbook');
  expect(result.html).toContain('data-agency-document-palette="6"');expect(result.html).toContain('color:#1F2A44');
 });
 it('gates an explicit new amendment on a real published handbook instead of inventing draft references',async()=>{
  const db={execute:vi.fn(async()=>[[]])};await expect(annotateCompensationHandbookHtml('<p>Workplace Handbook.</p>',{agencyId:6,agency,db})).rejects.toMatchObject({status:409});
 });
 it('scopes bearer portal reads to an active membership and requested published version',async()=>{
  const db={execute:vi.fn(async()=>[[{id:6}]])};expect(await portalContractHandbookAgency(11,18,db)).toBe(6);
  expect(db.execute.mock.calls[0][0]).toContain('COALESCE(ua.is_active,1)=1');expect(db.execute.mock.calls[0][0]).toContain('v.is_draft=0');expect(db.execute.mock.calls[0][1]).toEqual([11,18]);
  db.execute.mockResolvedValueOnce([[]]);await expect(portalContractHandbookAgency(11,99,db)).rejects.toMatchObject({status:403});
 });
 it('links Testing and generic handbook references without nested anchors or invented section URLs',()=>{
  const html='<p>Refer to the Workplace Handbook Testing area and Workplace Handbook.</p><a href="https://example.com">Workplace Handbook</a>';
  const linked=linkContractHandbookHtml(html,{agency,index,clauseKey:'ROLE_PSYCHOLOGICAL_TESTING'});
  expect(linked).toContain('data-handbook-version-id="18"');expect(linked).toContain('data-handbook-section="testing-services"');
  expect(linked).toContain('href="https://app.nextleveluplcc.com/workplace-handbook?agencyId=6&amp;versionId=18#handbook-testing-services"');
  expect(linked).not.toContain('psychological-testing-and-telephone-protocol');
  expect(linked).toContain('<a href="https://example.com">Workplace Handbook</a>');
  expect(linked).not.toMatch(/<a[^>]*>[^<]*<a/);expect(html).not.toContain('data-handbook');
 });
 it('escapes company slugs, labels and sections and keeps ordinary PDF-readable anchors',()=>{
  const linked=contractHandbookAnchor(agency,index,{slug:'testing-services',title:'Testing & consent'},'Workplace Handbook');
  expect(linked).toContain('data-handbook-title="Testing &amp; consent"');expect(linked).toContain('>Workplace Handbook</a>');
 });
 it('resolves only the requested company’s published version and returns exact location and branding',async()=>{
  const db={execute:vi.fn(async sql=>sql.includes('FROM workplace_handbook_documents')?[[{document_id:7,version_id:18,version_number:2,published_at:'2026-11-13'}]]:sql.includes('FROM workplace_handbook_sections')?[sections]:[[{...agency,color_palette:{primary:'#6FCFBE',secondary:'#1F2A44',accent:'#9FB7A5'}}]])};
  const reference=await readContractHandbookReference({agencyId:6,slug:sections[2].slug,versionId:18},db);
  expect(reference.version).toMatchObject({id:18,number:2});expect(reference.location.map(s=>s.title)).toEqual(['Testing','Testing code examples and pay buckets']);
  expect(reference.metadata.presentation.agencyBrand.primary).toBe('#6FCFBE');
  expect(db.execute.mock.calls[0][0]).toContain('v.is_draft=0');expect(db.execute.mock.calls[0][1]).toEqual([6,6,18]);
  expect(db.execute.mock.calls.every(([sql])=>/^SELECT/.test(sql))).toBe(true);
 });
 it('rejects another company’s or an unpublished version before returning any section',async()=>{
  const db={execute:vi.fn(async()=>[[]])};await expect(readContractHandbookReference({agencyId:6,slug:'testing-services',versionId:99},db)).rejects.toMatchObject({status:404});expect(db.execute).toHaveBeenCalledOnce();
 });
});
