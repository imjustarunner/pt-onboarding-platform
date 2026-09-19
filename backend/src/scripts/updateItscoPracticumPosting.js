/** Targeted, idempotent update; preserves application keys, custom page design and other jobs. */
import pool from '../config/database.js';
import { ITSCO_HIRING_JOB_SECTIONS, buildPostingTextFromSections } from '../seeds/itscoHiringJobSections.js';
import { ITSCO_HIRING_JOBS_BATCH } from '../seeds/itscoHiringJobsBatch.js';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
try {
  const [jobs] = await pool.execute(`SELECT j.* FROM hiring_job_descriptions j JOIN agencies a ON a.id=j.agency_id
    WHERE a.slug='itsco' AND j.is_active=1 AND (j.title LIKE '%Intern%' OR j.title LIKE '%Practicum%')`);
  if (jobs.length !== 1) throw new Error('Expected exactly one active ITSCO practicum/internship posting; no changes made.');
  const job=jobs[0];
  const batch=ITSCO_HIRING_JOBS_BATCH.find(item=>item.syncKey==='intern_mhp_cos');
  const source=ITSCO_HIRING_JOB_SECTIONS.intern_mhp_cos;
  const sections={...(parse(job.description_sections_json)||{}),aboutTheRole:source.aboutTheRole};
  sections.benefits=(sections.benefits||source.benefits).filter(line=>!/^\$24|^Paid practicum and internship:/i.test(line));
  sections.benefits.unshift(source.benefits[0]);
  const tags=[...new Set([...(parse(job.tags_json)||[]),...batch.tags])];
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({id:job.id,title:batch.title,city:batch.city,sections,tags},null,2));
  } else {
    const [result]=await pool.execute(`UPDATE hiring_job_descriptions SET title=?,city=?,description_text=?,description_sections_json=?,tags_json=? WHERE id=? AND agency_id=? AND is_active=1`,
      [batch.title,batch.city,buildPostingTextFromSections(batch,sections),JSON.stringify(sections),JSON.stringify(tags),job.id,job.agency_id]);
    console.log(`Updated ${result.affectedRows} ITSCO practicum/internship posting. Application link and page design preserved.`);
  }
} finally { await pool.end(); }
