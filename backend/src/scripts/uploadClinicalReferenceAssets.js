// Original-file Library import requested by the owner. No training, AI indexing, or notifications.
// Dry run by default; --apply uploads to the configured application storage/database.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import pool from '../config/database.js';
import Library from '../models/Library.model.js';
import StorageService from '../services/storage.service.js';
const root = new URL('../../../', import.meta.url);
const entries = [
  ['MandatedReportingTipSheetforEducators.pdf', 'Mandated Reporting Tip Sheet for Educators', ['itsco'], 'Mandated reporting'],
  ['The_Golden_Thread_of_Clinical_Documentation.pdf', 'The Golden Thread of Clinical Documentation', ['itsco','nlu','tisi'], 'Clinical documentation'],
  ['Information Gathering and Referral Process Guide - Mandated Reporter Info.pdf', 'Information Gathering and Referral Process Guide · Mandated Reporter Information', ['itsco','nlu','tisi'], 'Mandated reporting'],
  ['Colorado-Basic-Documentation-Training-Slides-and-Notes.pdf', 'Colorado Basic Documentation · Training Slides and Notes', ['itsco','nlu','tisi'], 'Clinical documentation'],
  ['Treatment Plan Infographic.png', 'The Anatomy of an Effective Treatment Plan', ['itsco','nlu','tisi'], 'Treatment planning'],
  ['Intake_Progress Note Infographic.png', 'Effective Documentation · Intake and Progress Notes', ['itsco','nlu','tisi'], 'Clinical documentation']
];
const sha = b => createHash('sha256').update(b).digest('hex');
const result = { database: process.env.DB_NAME || 'onboarding_stage', uploadedAt: new Date().toISOString(), apply: process.argv.includes('--apply'), resources: [] };
const report = new URL('deliverables/library-resource-upload/results.json', root);
try {
  // Validate every input before any write.
  const files = [];
  for (const [filename,name,tenants,topic] of entries) {
    const bytes = await readFile(new URL(`assets/libaryresources/${encodeURIComponent(filename)}`, root));
    const pdf = filename.endsWith('.pdf');
    if (pdf ? !bytes.subarray(0,5).equals(Buffer.from('%PDF-')) : !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error(`Unexpected file format: ${filename}`);
    const pages = pdf ? (await PDFDocument.load(bytes)).getPageCount() : null;
    files.push({filename,name,tenants,topic,bytes,pdf,pages,hash:sha(bytes)});
  }
  const [agencies] = await pool.query("SELECT id,slug FROM agencies WHERE slug IN ('itsco','nlu','tisi')");
  if (agencies.length !== 3) throw Error('Expected exactly the three requested agencies.');
  const [actors] = await pool.execute("SELECT id FROM users WHERE LOWER(email) = ? AND role = 'super_admin'", ['michael@plottwistco.com']);
  if (actors.length !== 1) throw Error('Uploader account could not be verified.');
  const actor = actors[0].id;
  for (const file of files) for (const slug of file.tenants) {
    const agency = agencies.find(a => a.slug === slug);
    const [existing] = await pool.execute('SELECT id,file_path FROM library_resources WHERE agency_id = ? AND original_filename = ? AND archived_at IS NULL', [agency.id,file.filename]);
    const entry = { agencyId:agency.id, slug, filename:file.filename, name:file.name, bytes:file.bytes.length, pages:file.pages, sha256:file.hash };
    if (existing.length) {
      if (existing.length !== 1 || sha(await StorageService.readObjectBuffer(existing[0].file_path)) !== file.hash) throw Error(`Existing content differs: ${slug}/${file.filename}`);
      result.resources.push({...entry,id:existing[0].id,status:'already-uploaded-verified'}); continue;
    }
    if (!result.apply) { result.resources.push({...entry,status:'ready'}); continue; }
    const categories = await Library.ensureDefaultCategories(agency.id);
    const category = categories.find(c => c.slug === 'guides_resources');
    const saved = await StorageService.saveLibraryResource({agencyId:agency.id,uploadedByUserId:actor,fileBuffer:file.bytes,filename:file.filename,contentType:file.pdf?'application/pdf':'image/png'});
    // Verify the remote bytes before making the resource visible.
    if (sha(await StorageService.readObjectBuffer(saved.path)) !== file.hash) throw Error(`Upload verification failed: ${file.filename}`);
    const resource = await Library.createResource({agencyId:agency.id,name:file.name,description:`${file.topic}. Original supplied ${file.pdf?'PDF':'infographic'}; reference only, not an onboarding assignment. Consult current agency policies for requirements.`,resourceType:'file',fileType:file.pdf?'pdf':'image',mimeType:file.pdf?'application/pdf':'image/png',originalFilename:file.filename,filePath:saved.path,fileSizeBytes:file.bytes.length,categoryId:category.id,ownerUserId:actor,scope:'organization',visibility:'internal',audience:[],featured:false,clientShareable:false,tags:[file.topic,'Reference resource',file.pdf?'PDF':'Infographic'],createdBy:actor});
    if (!resource?.id) throw Error('Resource was not readable after creation.');
    result.resources.push({...entry,id:resource.id,status:'uploaded-verified'});
    await writeFile(report,JSON.stringify(result,null,2)+'\n');
    console.log(`${slug}: ${file.name} → resource ${resource.id}`);
  }
  await mkdir(new URL('deliverables/library-resource-upload/',root),{recursive:true});
  await writeFile(report,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({apply:result.apply,resources:result.resources.length,database:result.database}));
} catch(e) { console.error(e.code || e.message); process.exitCode=1; }
finally { await pool.end(); }
