// Owner-requested payer setup only. Never uploads claims or starts enrollments.
import { readFile } from 'node:fs/promises';
import pool from '../src/config/database.js';
import { importPayerSetupCatalog } from '../src/services/payerSetupCatalog.service.js';
import { fetchPayers } from '../src/services/claimMd.service.js';
const apply = process.argv.includes('--apply');
const option = name => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const config = JSON.parse(await readFile(new URL('../../docs/billing/payer-import-2026-09-26.json', import.meta.url), 'utf8'));
const requestedIds = option('--agencies')?.split(',').map(Number);
const agencies = requestedIds ? config.agencies.filter(a => requestedIds.includes(a.id)) : config.agencies;
let db;
try {
  if (!agencies.length || requestedIds?.some(id => !agencies.some(a => a.id === id))) throw new Error('Use only the agency IDs in the reviewed catalog');
  const directoryFile = option('--directory');
  if (!directoryFile && !process.env.CLAIM_MD_ACCOUNT_KEY) throw new Error('Provide a current payer directory file or the runtime Claim.MD credential');
  const result = directoryFile ? JSON.parse(await readFile(directoryFile, 'utf8')) : await fetchPayers({accountKey:process.env.CLAIM_MD_ACCOUNT_KEY});
  if (!Array.isArray(result.payer) || !result.payer.length) throw new Error('A nonempty verified Claim.MD directory is required');
  db = await pool.getConnection();
  const input = {agencies,payers:config.payers,directory:result.payer};
  let plan = await importPayerSetupCatalog(input,db);
  if (apply) {
    await db.query(await readFile(new URL('../../database/migrations/1499_medical_payer_setup_details.sql',import.meta.url),'utf8'));
    plan = await importPayerSetupCatalog({...input,apply:true},db);
  }
  console.log(JSON.stringify({agencies:plan.agencies,applied:plan.applied,payersPerAgency:plan.rows.length,
    directoryMatches:plan.rows.filter(r=>r.directoryStatus==='id_match').length,
    legacyIdReview:plan.rows.filter(r=>r.directoryStatus==='alias_review').map(r=>({name:r.name,source:r.sourcePayerId,candidate:r.claimmdPayerId})),
    manualReview:plan.rows.filter(r=>!r.claimmdPayerId).map(r=>r.name)},null,2));
} catch (error) {
  // Do not log driver exceptions: they may contain credentials or SQL values.
  console.error('Payer setup import failed. Check database access, catalog agency identities and directory availability.');
  process.exitCode=1;
} finally { if(db)db.release(); await pool.end(); }
