import { describe,it,expect,vi,beforeEach } from 'vitest';
const { execute,getConnection }=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute,getConnection},onTableWrite:vi.fn()}));
import { createAgreement,saveAgreement,approveAgreement,issueAgreement,signAgreement,reviseAgreement,agreementHash } from '../auricwell/agreements.js';
import { assertAdministrator,scopeFor,completedParties,validateExternalReview,uploadOriginal,downloadOriginal,verifyExternal,listArchive } from '../organizationAgreements.js';
import { agreementHtml } from '../organizationAgreementHtml.js';
import { hash } from '../auricwell/policy.js';
const ctx={agencyId:2,accountId:'11',userId:11,actorType:'staff',permissions:['agreements'],profile:{operator:true,name:'Alex Operator'}};
const parties={practice:{legalName:'Example Practice LLC',address:'100 Example Street',noticeContact:'privacy@example.com',hipaaRole:'Covered entity'},operator:{legalName:'Example Technology LLC',address:'200 Example Street',noticeContact:'security@example.com',hipaaRole:'Business associate'}};
const input={revision:1,body:'Previously reviewed agreement text.\nExact UTF-8: sí.',terms:'Reviewed service scope and completed schedules.',effectiveDate:'2026-11-03',parties,signers:[{accountId:'11',capacity:'Technology operator'},{accountId:'22',capacity:'Practice administrator'}]};
function fixture(){
 const records=new Map();let seq=0;
 const store={
  get:async(c,kind,id)=>{const r=records.get(`${c.agencyId}:${kind}:${id}`);if(!r)throw Object.assign(Error('Record not found'),{status:404});return structuredClone(r);},
  create:async(c,kind,data,options={})=>{const id=options.id || `00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`,r={id,kind,revision:1,data:structuredClone(data)};records.set(`${c.agencyId}:${kind}:${id}`,r);return structuredClone(r);},
  update:async(c,r,data)=>{const key=`${c.agencyId}:${r.kind}:${r.id}`,current=records.get(key);if(current.revision!==r.revision)throw Object.assign(Error('stale revision'),{status:409});const next={...r,revision:r.revision+1,data:structuredClone(data)};records.set(key,next);return structuredClone(next);},
  transaction:async fn=>fn({}),lockPractice:vi.fn(),audit:vi.fn(),
  signerAuthority:async(c,s)=>({operator:s.accountId==='11',practice:s.accountId==='22'}),
  signatureEvidence:c=>({userId:c.userId,authenticatedName:c.profile.name})
 };
 return {store,records};
}
async function issued(){const f=fixture();let r=await createAgreement(ctx,{type:'baa'},f.store);r=await saveAgreement(ctx,r.id,input,f.store);r=await approveAgreement(ctx,r.id,f.store);r=await issueAgreement(ctx,r.id,f.store);return {...f,r};}
beforeEach(()=>{execute.mockReset();getConnection.mockReset();vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));});
describe('shared organization agreement engine',()=>{
 it('retains two human signatures, exact PDF/source, and preserves the original when revised',async()=>{
  const {store,records,r}=await issued();
  const first=await signAgreement(ctx,r.id,{name:'Alex Operator',consent:true,contentHash:r.data.contentHash},store);
  expect(first.data.status).toBe('partially_signed');
  expect([...records.values()].filter(r=>r.kind==='agreement_pdf')).toHaveLength(0);
  const signer={...ctx,accountId:'22',userId:22,profile:{operator:false,name:'Sam Practice'}};
  const signed=await signAgreement(signer,r.id,{name:'Sam Practice',consent:true,contentHash:r.data.contentHash},store);
  expect(signed.data.status).toBe('completed');expect(signed.data.signatures.map(s=>s.userId)).toEqual([11,22]);
  const pdf=[...records.values()].find(r=>r.kind==='agreement_pdf').data,bytes=Buffer.from(pdf.base64,'base64');
  expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(hash(bytes)).toBe(pdf.pdfHash);expect(pdf.contentHash).toBe(agreementHash(signed.data));
  const revision=await reviseAgreement(ctx,r.id,store);expect(revision.data.status).toBe('draft');expect(revision.data.supersedesId).toBe(r.id);expect(revision.data.signatures).toEqual([]);expect((await store.get(ctx,'agreement',r.id)).data.status).toBe('completed');
 });
 it('rejects stale edits, changed approval, missing consent, wrong hash, wrong signer and duplicate signatures',async()=>{
  const {store,r}=await issued();
  await expect(saveAgreement(ctx,r.id,{...input,revision:r.revision},store)).rejects.toThrow('immutable');
  for(const patch of [{consent:false},{contentHash:'changed'}])await expect(signAgreement(ctx,r.id,{name:'Alex',consent:true,contentHash:r.data.contentHash,...patch},store)).rejects.toThrow('exact document');
  await expect(signAgreement({...ctx,accountId:'99'},r.id,{name:'Other',consent:true,contentHash:r.data.contentHash},store)).rejects.toThrow('awaiting your signature');
  await signAgreement(ctx,r.id,{name:'Alex',consent:true,contentHash:r.data.contentHash},store);
  await expect(signAgreement(ctx,r.id,{name:'Alex',consent:true,contentHash:r.data.contentHash},store)).rejects.toThrow('already signed');
  const d=await createAgreement(ctx,{type:'baa'},store);const saved=await saveAgreement(ctx,d.id,input,store);await expect(saveAgreement(ctx,d.id,input,store)).rejects.toThrow('Refresh');
  await approveAgreement(ctx,d.id,store);const newer=await store.get(ctx,'agreement',d.id);await saveAgreement(ctx,d.id,{...input,revision:newer.revision,terms:'Changed terms'},store);await expect(issueAgreement(ctx,d.id,store)).rejects.toThrow('Approve this exact');
  expect(saved.data.signatures).toEqual([]);
  await expect(approveAgreement(ctx,d.id,store,agreementHash(saved.data))).rejects.toThrow('exact saved document');
 });
 it('rejects cross-organization access and missing active signer authority before issuance',async()=>{
  const {store,r}=await issued();await expect(store.get({...ctx,agencyId:6},'agreement',r.id)).rejects.toThrow('not found');
  const d=await createAgreement(ctx,{type:'baa'},store);await saveAgreement(ctx,d.id,input,store);await approveAgreement(ctx,d.id,store);store.signerAuthority=async()=>({operator:true});await expect(issueAgreement(ctx,d.id,store)).rejects.toThrow('one operator signer and one practice signer');
 });
 it('rechecks revoked signer authority against the locked issued version before accepting a signature',async()=>{
  const {store,r}=await issued();store.signerAuthority=async()=>({});await expect(signAgreement(ctx,r.id,{name:'Alex',consent:true,contentHash:r.data.contentHash},store)).rejects.toThrow('no longer active');expect((await store.get(ctx,'agreement',r.id)).data.signatures).toEqual([]);
 });
 it('renders downloadable HTML without scripts and identifies unexecuted copies',async()=>{
  const {r}=await issued();const html=agreementHtml({...r,data:{...r.data,body:'<script>injected</script> & original'}});expect(html).toContain('UNEXECUTED COPY');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain(r.data.contentHash);
 });
});
describe('organization boundary and external originals',()=>{
 it('requires an active administrator membership, while operators may administer across organizations',()=>{
  expect(()=>assertAdministrator({role:'provider'},true)).toThrow('administrator');expect(()=>assertAdministrator({role:'admin'},false)).toThrow('administrator');expect(()=>assertAdministrator({role:'admin'},true)).not.toThrow();expect(()=>assertAdministrator({role:'super_admin'},false)).not.toThrow();
 });
 it('does not trust the caller agency or role for the scope',async()=>{
  execute.mockImplementation(async sql=>sql.includes('FROM users u')?[[{id:4,role:'admin',first_name:'Sam'}]]:sql.includes('FROM agencies')?[[{id:2,name:'Practice',slug:'practice'}]]:[[]]);
  await expect(scopeFor(4,2)).rejects.toThrow('administrator');
  await expect(scopeFor(4,'anything')).rejects.toThrow('Choose an organization');
 });
 it('requires exact original hash, both actual signatures/dates, and distinct real legal entities',()=>{
  const original={hash:'abc'},review={sha256:'abc',effectiveDate:'2026-01-01',reviewNotes:'Checked complete PDF and both signatures against signers.',parties:{practice:{legalName:'Practice LLC',signerName:'Sam',capacity:'Owner',signedDate:'2026-01-02'},operator:{legalName:'Technology LLC',signerName:'Alex',capacity:'Owner',signedDate:'2026-01-03'}}};
  expect(validateExternalReview(review,original).parties.practice.signerName).toBe('Sam');expect(()=>validateExternalReview({...review,sha256:'changed'},original)).toThrow('exact uploaded original');expect(()=>validateExternalReview({...review,parties:{...review.parties,operator:{...review.parties.operator,signedDate:''}}},original)).toThrow('signature date');expect(()=>validateExternalReview({...review,parties:{...review.parties,operator:{...review.parties.operator,legalName:'Practice LLC'}}},original)).toThrow('distinct');
 });
 it('rejects brand names and self-agreements without inventing entities',()=>{
  expect(completedParties(parties)).toEqual(parties);expect(()=>completedParties({...parties,practice:{...parties.practice,legalName:'SchoolCareBridge'}})).toThrow('actual legal entity');expect(()=>completedParties({...parties,operator:{...parties.operator,legalName:parties.practice.legalName}})).toThrow('distinct');
 });
});

function databaseFixture(){
 const rows=new Map(),events=[];
 const query=async(sql,args)=>{
  if(sql.startsWith('INSERT INTO organization_agreement_records')){const [id,agency_id,kind,source_key,payload]=args;rows.set(id,{id,agency_id,kind,source_key,payload,revision:1});return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO organization_agreement_audit')){events.push(args);return [{insertId:events.length}];}
  if(sql.startsWith('UPDATE organization_agreement_records')){const [payload,agency_id,kind,id,revision]=args,r=rows.get(id);if(!r || r.agency_id!==agency_id || r.kind!==kind || r.revision!==revision)return [{affectedRows:0}];r.payload=payload;r.revision++;return [{affectedRows:1}];}
  if(sql.includes('SELECT id FROM agencies'))return [[{id:args[0]}]];
  if(sql.includes("kind='agreement_original'"))return [[...rows.values()].filter(r=>r.agency_id===args[0] && r.kind==='agreement_original' && r.source_key===args[1])];
  if(sql.includes("kind IN ('agreement','agreement_upload')"))return [[...rows.values()].filter(r=>r.agency_id===args[0] && ['agreement','agreement_upload'].includes(r.kind))];
  if(sql.includes('FROM organization_agreement_records'))return [[...rows.values()].filter(r=>r.agency_id===args[0] && (!args[1] || r.kind===args[1]) && (!args[2] || r.id===args[2]))];
  throw Error('Unexpected query: '+sql);
 };
 execute.mockImplementation(query);const conn={execute:vi.fn(query),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};getConnection.mockResolvedValue(conn);return {rows,events,conn};
}
describe('encrypted original archive',()=>{
 it('preserves original bytes, agency binding and hash, and separates external review from electronic execution',async()=>{
  const {rows,events}=databaseFixture(),bytes=Buffer.from('%PDF-1.7\nsynthetic signed original bytes');
  const uploaded=await uploadOriginal(ctx,{title:'Previously signed BAA'},{buffer:bytes,mimetype:'application/pdf',originalname:'signed-original.pdf'});
  expect(uploaded.data.status).toBe('uploaded_unverified');expect(rows.get(uploaded.id).payload).not.toContain(bytes.toString('base64'));
  const listed=await listArchive(ctx);expect(listed[0].data.base64).toBeUndefined();expect(listed[0].data.hash).toBe(hash(bytes));
  expect((await downloadOriginal(ctx,uploaded.id)).bytes.equals(bytes)).toBe(true);
  await expect(downloadOriginal({...ctx,agencyId:6},uploaded.id)).rejects.toThrow('unavailable');
  await expect(verifyExternal({...ctx,profile:{operator:false}},uploaded.id,{})).rejects.toThrow('Operator review');
  const review={sha256:hash(bytes),effectiveDate:'2026-01-01',reviewNotes:'Verified both names and signatures on the complete original.',parties:{practice:{legalName:'Practice LLC',signerName:'Sam',capacity:'Owner',signedDate:'2026-01-02'},operator:{legalName:'Technology LLC',signerName:'Alex',capacity:'Owner',signedDate:'2026-01-03'}}};
  const reviewed=await verifyExternal(ctx,uploaded.id,review);expect(reviewed.data.status).toBe('verified_external');expect(reviewed.data.base64).toBeUndefined();expect(reviewed.data.signatures).toBeUndefined();expect((await downloadOriginal(ctx,uploaded.id)).bytes.equals(bytes)).toBe(true);
  await expect(verifyExternal(ctx,uploaded.id,review)).rejects.toThrow('already been reviewed');expect(events.some(e=>e[3]==='agreement_upload.externally_verified')).toBe(true);expect([...rows.values()].some(r=>r.kind==='agreement_pdf')).toBe(false);
 });
 it('rejects cross-agency association and non-PDF uploads before inserting an archive entry',async()=>{
  const {rows}=databaseFixture();
  await expect(uploadOriginal(ctx,{title:'Signed BAA',agreementId:'00000000-0000-4000-8000-000000000099'},{buffer:Buffer.from('%PDF-original'),mimetype:'application/pdf',originalname:'signed.pdf'})).rejects.toThrow('unavailable');expect(rows.size).toBe(0);
  await expect(uploadOriginal(ctx,{title:'Signed BAA'},{buffer:Buffer.from('plain text'),mimetype:'text/plain',originalname:'file.txt'})).rejects.toThrow('original signed PDF');expect(rows.size).toBe(0);
 });
});
