import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),membership:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.getConnection}}));
vi.mock('../enrollmentAgencyAccess.service.js',()=>({assertEnrollmentAgencyMembership:mocks.membership}));
import {splitFoundationDocuments,listFoundationDocuments,applyEnrollmentFoundationOverrides,saveFoundationDocument,assertFoundationAccess} from '../enrollmentFoundations.service.js';
const source='<header>Agency shell</header><h1>INTAKE QUESTIONNAIRE</h1><p>Live form</p><h2>INFORMED CONSENT</h2><p>Original agency terms</p><div class="page-break"></div><h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2><p>Intro</p><p>{{DISCLOSURE_CARE_TEAM}}</p><h2>CONSENT TO RELEASE AND EXCHANGE PROTECTED HEALTH INFORMATION</h2><p>ROI intro</p><p>{{SCHOOL_STAFF_TABLE}}</p><p>Separate authorization signature</p>';
const context={agencyId:2,channel:'school',locale:'en'};
beforeEach(()=>{vi.resetAllMocks();mocks.execute.mockResolvedValue([[]]);mocks.membership.mockResolvedValue();});
it('protects the complete roster wrapper and ROI authorization, while preserving custom shell',async()=>{
 const docs=splitFoundationDocuments(source);expect(docs.find(d=>d.key==='intake-questionnaire').editable).toBe(false);
 const disclosure=docs.find(d=>d.key==='disclosure');expect(disclosure.editableHtml).toBe('<p>Intro</p>');expect(disclosure.protectedHtml).toBe('<p>{{DISCLOSURE_CARE_TEAM}}</p>');
 const roi=docs.find(d=>d.key==='school-roi');expect(roi.editableHtml).toBe('<p>ROI intro</p>');expect(roi.protectedHtml).toContain('Separate authorization signature');
 mocks.execute.mockResolvedValue([[{document_key:'disclosure',content_html:'<p>New introduction</p>',version:2}]]);
 const html=await applyEnrollmentFoundationOverrides({...context,html:source});expect(html).toContain('<header>Agency shell</header>');expect(html).toContain('<p>New introduction</p><p>{{DISCLOSURE_CARE_TEAM}}</p>');expect(html).toContain('Original agency terms');expect(html).toContain('Separate authorization signature');
});
it('allows providers to read only and restricts source edits to administrators within the agency',async()=>{
 await assertFoundationAccess({id:7,role:'provider'},2);expect(mocks.membership).toHaveBeenCalledWith({id:7,role:'provider'},2);
 await expect(assertFoundationAccess({id:7,role:'provider'},2,{edit:true})).rejects.toMatchObject({status:403});
 await expect(assertFoundationAccess({id:7,role:'admin',switchedFromUserId:8},2,{edit:true})).rejects.toMatchObject({status:403});
 mocks.membership.mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));await expect(assertFoundationAccess({id:7,role:'admin'},3,{edit:true})).rejects.toMatchObject({status:403});
});
it('does not accept changes to generated sections or injection of protected roster tokens',async()=>{
 const user={id:1,role:'admin'};
 await expect(saveFoundationDocument(user,{...context,key:'intake-questionnaire',html:'Changed',version:0,sourceHtml:source})).rejects.toMatchObject({status:403});
 await expect(saveFoundationDocument(user,{...context,key:'disclosure',html:'{{DISCLOSURE_CARE_TEAM}}',version:0,sourceHtml:source})).rejects.toMatchObject({status:400});
 expect(mocks.getConnection).not.toHaveBeenCalled();
});
it.each([
 {key:'disclosure',title:'MENTAL HEALTH PROFESSIONAL INFORMATION',token:'{{DISCLOSURE_CARE_TEAM}}'},
 {key:'school-roi',title:'CONSENT TO RELEASE AND EXCHANGE PROTECTED HEALTH INFORMATION',token:'{{SCHOOL_STAFF_TABLE}}'}
])('blocks edits and legacy packet generation when $key has no automatic roster',async({key,title,token})=>{
 const legacy=`<h2>${title}</h2><p>Manually copied historical roster</p>`;
 const document=splitFoundationDocuments(legacy)[0];expect(document.editable).toBe(false);expect(document.editableHtml).toBe('');expect(document.protectedSourceError).toContain(title);expect(document.protectedNote).toContain(token);
 await expect(saveFoundationDocument({id:1,role:'admin'},{...context,key,html:'<p>Replacement</p>',version:0,sourceHtml:legacy})).rejects.toMatchObject({status:409,message:expect.stringContaining(token)});
 expect(mocks.getConnection).not.toHaveBeenCalled();
 await expect(applyEnrollmentFoundationOverrides({...context,html:legacy})).rejects.toMatchObject({status:409,message:expect.stringContaining(title)});
});
it('requires the correct protected token for each document rather than any roster token',()=>{
 const wrong=splitFoundationDocuments('<h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2>{{SCHOOL_STAFF_TABLE}}')[0];expect(wrong.editable).toBe(false);expect(wrong.protectedSourceError).toContain('{{DISCLOSURE_CARE_TEAM}}');
});
it('saves sanitized content and immutable revision together, preserving generated data',async()=>{
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([{insertId:9}]).mockResolvedValueOnce([{}])};mocks.getConnection.mockResolvedValue(db);
 const result=await saveFoundationDocument({id:1,role:'admin'},{...context,key:'disclosure',html:'<p onclick="steal()">New intro<script>evil()</script></p><img src="https://evil.test">',version:0,sourceHtml:source});
 expect(result.html).toBe('<h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2><p>New intro</p><p>{{DISCLOSURE_CARE_TEAM}}</p>');expect(result.version).toBe(1);
 expect(db.execute.mock.calls[2][0]).toContain('enrollment_foundation_document_versions');expect(db.execute.mock.calls[2][1]).toEqual([9,1,'<p>New intro</p>',1]);expect(db.commit).toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
it('rejects stale edits without replacing a newer version',async()=>{
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValue([[{id:9,version:2}]])};mocks.getConnection.mockResolvedValue(db);
 await expect(saveFoundationDocument({id:1,role:'admin'},{...context,key:'disclosure',html:'<p>Stale</p>',version:1,sourceHtml:source})).rejects.toMatchObject({status:409});expect(db.execute).toHaveBeenCalledTimes(1);expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
});
it('hashes the actual projected source and keeps a stable unmodified version',async()=>{const docs=await listFoundationDocuments({...context,html:source});expect(docs[1].version).toBe(0);expect(docs[1].hash).toMatch(/^[a-f0-9]{64}$/);});
it('keeps office self and guardian edits separate while school foundations are shared',async()=>{
 await listFoundationDocuments({...context,channel:'office',audience:'self',html:source});expect(mocks.execute.mock.lastCall[1]).toEqual([2,'office','en','self']);
 await listFoundationDocuments({...context,channel:'office',audience:'guardian',html:source});expect(mocks.execute.mock.lastCall[1]).toEqual([2,'office','en','guardian']);
 await listFoundationDocuments({...context,audience:'self',html:source});expect(mocks.execute.mock.lastCall[1]).toEqual([2,'school','en','all']);
});
