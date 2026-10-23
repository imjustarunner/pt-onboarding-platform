// Local rendering check with synthetic data. Requires backend + frontend dependencies and Chrome.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildExchangeAuditReport} from '../src/utils/clientExchangeAuditReport.js';
import {renderExchangeAuditPdf} from '../src/services/clientExchangeAuditPdf.service.js';
import {getDocument} from '../../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const providers=Array.from({length:141},(_,i)=>({userId:i+1,name:`Test Provider ${String(i+1).padStart(3,'0')}`,email:`provider${i+1}@example.test`,matched:i<12,
  checks:i<12?[{status:'pass',reason:'Provider sees clients and has intake availability.'},{status:'pass',reason:'A compatible visit format is open for new clients.'},{status:'pass',reason:'Provider serves the requested client age range.'},{status:'pass',reason:'Provider covers every recognized diagnosis category.'},{status:'pass',reason:'Recognized clinical needs overlap provider specialties.'},{status:'unknown',reason:'Days, times and exact office availability need manual confirmation.'}]:[{status:'fail',reason:i%2?'Provider is not accepting new clients.':'Provider does not cover the requested client age range.'},{status:'unknown',reason:'Schedule needs manual confirmation.'}],
  emailDelivery:i<11?{status:'sent',sentAt:'2026-10-23T12:00:00Z'}:{status:'skipped',reason:i===11?'Provider opted out of email.':'Not currently matched.'},smsDelivery:i<6?{status:'sent'}:{status:'skipped',reason:'Text notifications are not enabled.'},views:i<4?1:0}));
const report=buildExchangeAuditReport({agencyName:'Example Agency',listing:{id:9,fullName:'PRIVATE_CLIENT_NAME',clientInitials:'PRIVATE_INITIALS'},ordinal:1,link:'https://example.test/client-exchange?listingId=9',generatedAt:'2026-10-23T12:00:00Z',audit:{providers,run:{evaluated_at:'2026-10-23T11:59:00Z'},trackingStartedAt:'2026-10-22T23:07:38Z',views:{total:5,unique_viewers:5},viewers:[{user_id:200,first_name:'Support',last_name:'Reviewer',view_count:1,last_viewed_at:'2026-10-23T11:58:00Z'}]}});
const bytes=await renderExchangeAuditPdf(report.reportHtml);
const path=join(tmpdir(),'client-exchange-audit-example.pdf');
await writeFile(path,bytes);
const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
const pages=[];
for(let n=1;n<=pdf.numPages;n++) {
  const page=await pdf.getPage(n),text=await page.getTextContent();
  for(const item of text.items.filter(item=>item.str?.trim())) {
    assert.ok(item.transform[4]>=-1 && item.transform[4]+item.width<=page.view[2]+1, `Text overflows page ${n}: ${item.str}`);
    assert.ok(item.transform[5]>=0 && item.transform[5]<=page.view[3], `Text is outside page ${n}`);
  }
  pages.push(text.items.map(item=>item.str||'').join(' '));
}
const text=pages.join('\n');
for(const provider of providers) assert.ok(text.includes(provider.name), `Missing provider ${provider.userId}`);
for(const phrase of ['Matched providers','Not matched / needs review','Viewing activity','Provider opted out of email.','Support Reviewer','Earlier listing views were not tracked']) assert.ok(text.includes(phrase),`Missing ${phrase}`);
assert.ok(!text.includes('PRIVATE_CLIENT_NAME') && !text.includes('PRIVATE_INITIALS'));
assert.ok(pdf.numPages>2 && pdf.numPages<30, 'Report should be paginated without a page per provider');
for(const [index,page] of pages.entries()) assert.ok(page.includes(`Page ${index+1} of ${pdf.numPages}`),'Missing page numbering');
assert.ok(bytes.length<5*1024*1024,'PDF is too large to email comfortably');
await pdf.destroy();
console.log(JSON.stringify({result:'PASS',providers:providers.length,pages:pages.length,bytes:bytes.length,path}));
