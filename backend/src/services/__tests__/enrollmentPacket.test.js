import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({master:{version:3,intake_steps:[{type:'questions',label:'Current enrollment',fields:[{key:'current_question',label:'Current custom question',type:'textarea'}]}]},agency:{id:2,name:'ITSCO',slug:'itsco',portal_url:'itsco'},overrides:{}}));
vi.mock('../enrollmentAgencyAccess.service.js',()=>({assertEnrollmentAgencyMembership:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async id=>id===2?state.agency:{id,name:'Example School'})}}));
vi.mock('../../models/AgencyOfficeIntakeMaster.model.js',()=>({default:{findByAgencyLanguage:vi.fn(async()=>state.master)}}));
vi.mock('../../models/AgencySchoolIntakeMaster.model.js',()=>({default:{findByAgencyLanguage:vi.fn(async()=>state.master)}}));
vi.mock('../../models/AgencyChannelIntakeMaster.model.js',()=>({default:{findByAgencyChannelLanguage:vi.fn(async()=>state.master)}}));
vi.mock('../../models/SchoolPacketTemplate.model.js',()=>({default:{getOrCreateForAgency:vi.fn(async()=>({html_content:'<h1>INTAKE QUESTIONNAIRE</h1><p>Old intake</p><h2>CONSENT TO RELEASE AND EXCHANGE PROTECTED HEALTH INFORMATION</h2><p>{{SCHOOL_NAME}}</p>{{SCHOOL_STAFF_TABLE}}<p>Separate ROI signature</p><h2>INSURANCE INFORMATION</h2><p>Custom insurance terms</p><h2>INFORMED CONSENT</h2><p>Custom agency consent</p><h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2><p>Disclosure introduction</p>{{DISCLOSURE_CARE_TEAM}}<h2>Signatures</h2><p>Old signature</p>'}))},normalizeLocale:v=>v==='es'?'es':'en'}));
vi.mock('../../models/OfficePacketTemplate.model.js',()=>({default:{getOrCreateForAgency:vi.fn(async()=>({html_content:'<h2>INFORMED CONSENT</h2><p>Custom office consent</p><h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2>{{DISCLOSURE_CARE_TEAM}}'}))}}));
vi.mock('../../models/DocumentTemplate.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/ClientSchoolStaffRoiAccess.model.js',()=>({default:{listSchoolStaffRosterForOrganization:vi.fn(async()=>[{first_name:'School Contact'}])}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{hasActiveAffiliation:vi.fn(async(a,s)=>s===40)}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{getActiveAgencyIdForSchool:vi.fn(async()=>null)}}));
vi.mock('../packetBrandChrome.service.js',()=>({isNluPacketChromeAgency:()=>false,isItscoPacketChromeAgency:()=>true,resolvePacketBrandChrome:vi.fn(async()=>({versionLabel:'1'}))}));
vi.mock('../smartDisclosure.service.js',()=>({listDisclosureProviders:vi.fn(async()=>[{fullName:'Current Provider'}])}));
vi.mock('../schoolPrintablePacket.service.js',()=>({buildSchoolPrintablePacketContext:vi.fn(),expandYourCareTeamProviders:vi.fn(async p=>p),buildDisclosureCareTeamHtml:p=>`<div>${p.map(x=>x.fullName).join(', ')}</div>`,buildSchoolStaffTableHtml:p=>`<div>${p.map(x=>x.first_name).join(', ')||'Blank school contacts'}</div>`,buildPacketStyleBlock:()=>'',buildPdfChromeTemplates:()=>({})}));
vi.mock('../documentSigning.service.js',()=>({default:{convertHTMLToPDF:vi.fn()}}));
vi.mock('../storage.service.js',()=>({default:{readObject:vi.fn(),readTemplate:vi.fn()}}));
vi.mock('../enrollmentFoundations.service.js',async original=>{const actual=await original();return {...actual,listFoundationDocuments:vi.fn(async({html})=>actual.splitFoundationDocuments(html).map(d=>({...d,html:state.overrides[d.key]||d.html,version:1})))};});
import {writeFileSync} from 'node:fs';
import {DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML} from '../../content/schoolPacketTemplateDefault.en.js';
import {DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES} from '../../content/schoolPacketTemplateDefault.es.js';
import {defaultOfficePacketHtml} from '../../content/officePacketTemplateDefault.js';
import SchoolPacketTemplate from '../../models/SchoolPacketTemplate.model.js';
import OfficePacketTemplate from '../../models/OfficePacketTemplate.model.js';
import DocumentTemplate from '../../models/DocumentTemplate.model.js';
import {getEnrollmentPacketDocuments,enrollmentCampaignDocument,enrollmentSections,buildEnrollmentPacketContext,buildEnrollmentPacketHtml} from '../enrollmentPacket.service.js';
import {listDisclosureProviders} from '../smartDisclosure.service.js';
beforeEach(()=>{state.overrides={};});
it.each(['school','office'].flatMap(channel=>['self','guardian'].map(audience=>({channel,audience}))))('assembles current $channel $audience packet',async options=>{const data=await getEnrollmentPacketDocuments({agencyId:2,...options});const html=data.documents.map(d=>d.html).join('');expect(html).toContain('Current custom question');expect(html).not.toContain('Old intake');expect(html).not.toContain('Old signature');expect(html).toContain('Current Provider');expect(html).toContain('AuricWell');expect(html).toContain('front and back');expect(html).toContain('Medicaid');expect(html).toContain(options.audience==='guardian'?'PSC-17':'PHQ-9');expect(html.includes('Separate ROI signature')).toBe(options.channel==='school');expect(html.includes('SchoolCareBridge')).toBe(options.channel==='school');});
it('populates school roster only for the same agency and preserves blank generic school packet',async()=>{const generic=await getEnrollmentPacketDocuments({agencyId:2,channel:'school'});expect(generic.documents.find(d=>d.key==='school-roi').html).toContain('Blank school contacts');const named=await getEnrollmentPacketDocuments({agencyId:2,channel:'school',organizationId:40});expect(named.documents.find(d=>d.key==='school-roi').html).toContain('School Contact');await expect(getEnrollmentPacketDocuments({agencyId:2,channel:'school',organizationId:99})).rejects.toMatchObject({status:403});});
it('propagates editable insurance and consent text into packet',async()=>{state.overrides['insurance-information']='<h2>INSURANCE INFORMATION</h2><p>Updated insurance terms</p>';state.overrides['informed-consent']='<h2>INFORMED CONSENT</h2><p>Updated consent</p>';const data=await getEnrollmentPacketDocuments({agencyId:2,channel:'school'});expect(data.documents.find(d=>d.key==='insurance-information').html).toContain('Updated insurance terms');expect(data.documents.find(d=>d.key==='informed-consent').html).toContain('Updated consent');});
it('does not silently print an empty roster when current provider lookup fails',async()=>{vi.mocked(listDisclosureProviders).mockRejectedValueOnce(new Error('Roster unavailable'));await expect(getEnrollmentPacketDocuments({agencyId:2})).rejects.toThrow('Roster unavailable');});
it('keeps tutoring nonclinical and prints both platform brands for schools',async()=>{const data=await getEnrollmentPacketDocuments({agencyId:2,service:'tutoring'});expect(data.documents.some(d=>d.key==='screening-questionnaires')).toBe(false);expect(data.documents.some(d=>d.key==='disclosure')).toBe(false);const context=await buildEnrollmentPacketContext({agencyId:2,channel:'school'});expect(buildEnrollmentPacketHtml(context)).toContain('<strong>AuricWell</strong> · SchoolCareBridge');});
it('keeps wrong-audience and provider selection questions out of paper forms',()=>{const sections=enrollmentSections([{id:'counseling_dep_x',audience:'dependent',type:'questions',fields:[{key:'child_x',label:'Child'}]},{audience:'self',type:'questions',fields:[{key:'preferred_provider_ids',label:'Pick a provider'},{key:'self_x',label:'Self',defaultValue:'yes'}]}],{audience:'self'});expect(JSON.stringify(sections)).not.toContain('child_x');expect(JSON.stringify(sections)).not.toContain('Pick a provider');expect(sections.flatMap(s=>s.fields).find(f=>f[0]==='self_x')[2]).not.toHaveProperty('defaultValue');});
it('prints separate active client opt-in choices without staff campaigns or preselected consent',()=>{const profile={brandName:'ITSCO',legalName:'ITSCO LLC',supportContact:'support@example.test',portalUrl:'https://example.test',website:'https://example.test',organizationPrivacyUrl:'https://example.test/privacy',organizationTermsUrl:'https://example.test/terms',ownership:'own',volume:'low'};const agency={...state.agency,feature_flags:{smsCampaignPackets:Object.fromEntries(['operations','marketing','account','workforce','polling'].map(k=>[k,{published:{profile,at:'2026-10-18'}}]))}};const document=enrollmentCampaignDocument(agency,{audience:'guardian'});const fields=document.sections.flatMap(s=>s.fields);expect(fields.find(f=>f[0]==='sms_marketing_marketing')[2].options.map(o=>o.value)).toEqual(['yes','no']);expect(fields.some(f=>/workforce|polling/.test(f[0]))).toBe(false);expect(document.html).toContain('Nothing is preselected');expect(document.html).toContain('Staff must review');});

it('renders complete production source documents with synthetic enrollment data',async()=>{
 vi.mocked(SchoolPacketTemplate.getOrCreateForAgency).mockResolvedValueOnce({html_content:DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,version:1});
 const school=await buildEnrollmentPacketContext({agencyId:2,channel:'school',audience:'guardian',organizationId:40});
 vi.mocked(OfficePacketTemplate.getOrCreateForAgency).mockResolvedValueOnce({html_content:defaultOfficePacketHtml('self','en'),version:1});
 const office=await buildEnrollmentPacketContext({agencyId:2,channel:'office',audience:'self'});
 for(const [key,value] of Object.entries({school,office})){
  const html=buildEnrollmentPacketHtml(value);
  expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  expect(html).not.toContain('By signing this document you consent to');
  expect(html).toContain('Current Provider');
  expect(html).not.toContain('class="page-break"');
  expect(value.documents.at(-1).html).not.toMatch(/ · [a-f0-9]{12}/);
  if(key==='school')expect(html).toContain('☐ Deny School communication');
  if(process.env.ENROLLMENT_PACKET_ARTIFACTS)writeFileSync(`/tmp/enrollment-full-${key}.html`,html);
 }
});
it.each(['school','office'].flatMap(channel=>['en','es'].map(locale=>({channel,locale}))))('uses unrelated agency details in the actual $channel $locale defaults',async({channel,locale})=>{
 const prior=state.agency;
 state.agency={id:2,name:'Synthetic Cedar Agency',slug:'synthetic-cedar',portal_url:'synthetic-cedar',support_team_email:'support@cedar.example',phone_number:'555-0101',website_url:'https://cedar.example',street_address:'100 Example Lane',city:'Example City',state:'CO',postal_code:'80000'};
 try{
  const source=channel==='school'?(locale==='es'?DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES:DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML):defaultOfficePacketHtml('parent',locale);
  vi.mocked(channel==='school'?SchoolPacketTemplate.getOrCreateForAgency:OfficePacketTemplate.getOrCreateForAgency).mockResolvedValueOnce({html_content:source,version:1});
  const context=await buildEnrollmentPacketContext({agencyId:2,channel,locale,audience:'guardian'});
  const html=buildEnrollmentPacketHtml(context);
  expect(html).toContain('Synthetic Cedar Agency');expect(html).toContain('support@cedar.example');expect(html).toContain('100 Example Lane');expect(html).toContain('555-0101');expect(html).toContain('https://cedar.example');
  expect(html).not.toMatch(/Mental Range Collective|Next Level Up|The Inner Strength Institute|MH4kidz|Michael Mendez|Windchime|833-444-8726|719-657-7444|itsco\.health|@Synthetic Cedar Agency|\{\{[A-Z_]+\}\}/i);
  expect(context.documents.find(d=>d.key==='disclosure').html).toContain('Current Provider');
 }finally{state.agency=prior;}
});
it('retains required source questions and conditional metadata for portal completion',()=>{
 const sections=enrollmentSections([{type:'questions',fields:[{key:'required_answer',label:'Required question',required:true,showIf:{fieldKey:'first',equals:'yes'}}]}]);
 expect(sections.flatMap(s=>s.fields).find(f=>f[0]==='required_answer')[2]).toMatchObject({required:true,showIf:{fieldKey:'first',equals:'yes'}});
});

it('preserves additional authoritative screening items without duplicating the standard battery',()=>{
 const fields=[{key:'cssrs_1',label:'Current suicide screening item',instrument:'cssrs_screener',type:'radio',options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]},{key:'audit_c_1',label:'Alcohol screen',instrument:'audit_c'},{key:'phq9_1',label:'PHQ item',instrument:'phq9'}];
 const all=enrollmentSections([{type:'questions',fields}],{audience:'self'}).flatMap(s=>s.fields);
 expect(all.map(f=>f[0])).toContain('cssrs_1');expect(all.map(f=>f[0])).toContain('audit_c_1');expect(all.map(f=>f[0])).not.toContain('phq9_1');
});

it('preserves a document-only enrollment master alongside fallback questions',async()=>{
 const original=state.master;state.master={version:5,intake_steps:[{type:'document',templateId:81}]};
 vi.mocked(DocumentTemplate.findById).mockResolvedValueOnce({id:81,agency_id:2,is_active:1,name:'Additional agency consent',html_content:'<p>Keep this agency-specific document.</p>'});
 try{const result=await getEnrollmentPacketDocuments({agencyId:2});expect(result.documents.find(d=>d.key==='agency-document-81').html).toContain('agency-specific');expect(result.sections.length).toBeGreaterThan(2);}finally{state.master=original;}
});
it('labels English screen fallbacks honestly inside Spanish packets and keeps their wording intact',async()=>{
 const result=await getEnrollmentPacketDocuments({agencyId:2,locale:'es'});const screen=result.documents.find(d=>d.key==='screening-questionnaires');
 expect(screen.html).toContain('conservan el texto original en inglés');expect(screen.html).toContain('Little interest or pleasure in doing things');expect(result.documents[0].html).toContain('Información del cliente y de contacto');
});

it('preserves existing agency guardian guidance in school source documents',async()=>{
 const original=state.agency;
 state.agency={...original,theme_settings:{intakeLegal:{en:{ageOfConsentNote:'Agency-specific guardian consent guidance.'}}}};
 vi.mocked(SchoolPacketTemplate.getOrCreateForAgency).mockResolvedValueOnce({html_content:DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML,version:1});
 try {
  const result=await getEnrollmentPacketDocuments({agencyId:2,channel:'school',audience:'guardian'});
  expect(result.documents.find(d=>d.key==='minor-consent').html).toContain('Agency-specific guardian consent guidance.');
 } finally {state.agency=original;}
});
it.each([
 {channel:'office',title:'MENTAL HEALTH PROFESSIONAL INFORMATION',token:'{{DISCLOSURE_CARE_TEAM}}'},
 {channel:'school',title:'CONSENT TO RELEASE AND EXCHANGE PROTECTED HEALTH INFORMATION',token:'{{SCHOOL_STAFF_TABLE}}'}
])('refuses a $channel packet with a legacy manually copied roster',async({channel,title,token})=>{
 vi.mocked(channel==='school'?SchoolPacketTemplate.getOrCreateForAgency:OfficePacketTemplate.getOrCreateForAgency).mockResolvedValueOnce({html_content:`<h2>${title}</h2><p>Historical people copied as text</p>`,version:1});
 await expect(getEnrollmentPacketDocuments({agencyId:2,channel})).rejects.toMatchObject({status:409,message:expect.stringContaining(token)});
});
