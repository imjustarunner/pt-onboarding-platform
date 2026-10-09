/** Append the requested level-review policy to editable ITSCO drafts only. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {commonAmendmentClauses, renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {
  LEVEL_EXPECTATIONS_VERSION, LEVEL_EXPECTATIONS_SLUG, LEVEL_EXPECTATIONS_TITLE,
  addLevelExpectationsToClauses, levelExpectationsHandbookSection
} from '../content/compensationLevelExpectations.js';

const apply = process.argv.includes('--apply');
const parse = value => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
const rationale = 'Define separately paid annual paid event-work commitments, transparent performance considerations, one to two evaluations per year, and a documented process for maintaining or changing compensation levels.';
const trackerHeading = '<h3>Compensation-level expectations and annual paid event work</h3>';
const trackerAddition = trackerHeading + '<ul><li>Add a minimum of four actual paid event-work hours per calendar year (January–December), increasing to eight total while school-assigned, paid separately at the agreed indirect rate.</li><li>Add a dedicated compensation-level review section covering documentation, reliability, outreach, professional standing, client engagement, treatment progress and school/client action items.</li><li>Conduct formal evaluations one to two times per year; document evidence, employee input and prospective level/rate changes.</li><li>Exclude protected leave and activity, evaluate complaints before acting, and consider clinical outcomes in context without discharge quotas.</li><li>Keep session-based Tier 3 bonuses separate from compensation-level reviews. No automatic payroll hours or level reductions are activated by this draft.</li></ul>';

async function main() {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT id,name FROM agencies WHERE id=2');
    const [[digest]] = await db.execute('SELECT * FROM workplace_handbook_digests WHERE id=1 AND agency_id=2 FOR UPDATE');
    const [[version]] = await db.execute('SELECT * FROM workplace_handbook_versions WHERE agency_id=2 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
    if (agency?.name !== 'ITSCO' || digest?.status !== 'draft' || !version) throw new Error('Expected the editable ITSCO handbook drafts. Nothing was changed.');
    const [sections] = await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? ORDER BY sort_order,id FOR UPDATE', [version.id]);
    const [entries] = await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=1 AND agency_id=2 ORDER BY sort_order,id FOR UPDATE');
    const [drafts] = await db.execute(`SELECT * FROM contract_generations WHERE agency_id=2
      AND task_id IS NULL AND user_specific_document_id IS NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE`);
    const [clauses] = await db.execute("SELECT * FROM contract_clauses WHERE agency_id=2 AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0 FOR UPDATE");
    const revised = drafts.map(row => {
      const data = parse(row.token_values_json);
      data.commonClausesHtml = addLevelExpectationsToClauses(data.commonClausesHtml || commonAmendmentClauses(data.leaveChoice));
      data.levelExpectationsPolicyVersion = LEVEL_EXPECTATIONS_VERSION;
      return {id: row.id, data, html: renderAmendment(data)};
    });
    const revisedClauses = clauses.map(row => ({id: row.id, body: addLevelExpectationsToClauses(row.body_html)}));
    const policy = levelExpectationsHandbookSection();

    if (apply) {
      if (!process.env.UPDATE_BACKUP_PATH) throw new Error('Set an exclusive UPDATE_BACKUP_PATH before applying draft changes.');
      fs.writeFileSync(process.env.UPDATE_BACKUP_PATH, JSON.stringify({digest, version, sections, entries, drafts, clauses}, null, 2), {mode: 0o600, flag: 'wx'});
      if (!sections.some(s => s.slug === LEVEL_EXPECTATIONS_SLUG)) {
        const anchor = sections.find(s => s.slug === 'category-level-rate-schedule');
        const position = anchor ? sections.indexOf(anchor) + 1 : sections.length;
        const [inserted] = await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html) VALUES (?,2,?,?,?,?)', [version.id, position, policy.slug, policy.title, policy.bodyHtml]);
        const ordered = [...sections]; ordered.splice(position, 0, {id: inserted.insertId});
        for (const [i, row] of ordered.entries()) await db.execute('UPDATE workplace_handbook_sections SET sort_order=? WHERE id=? AND version_id=?', [i, row.id, version.id]);
      }
      if (!entries.some(e => e.subject === LEVEL_EXPECTATIONS_TITLE)) {
        const anchor = entries.find(e => e.subject === 'Category and level rate schedule');
        const position = anchor ? entries.indexOf(anchor) + 1 : entries.length;
        const [inserted] = await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES (1,2,?,?,?,?)', [position, policy.title, rationale, policy.bodyHtml]);
        const ordered = [...entries]; ordered.splice(position, 0, {id: inserted.insertId});
        for (const [i, row] of ordered.entries()) await db.execute('UPDATE workplace_handbook_digest_entries SET sort_order=? WHERE id=? AND digest_id=1 AND agency_id=2', [i, row.id]);
      }
      for (const s of sections.filter(s => s.slug === 'october-2026-editor-change-map' && !s.body_html.includes(trackerHeading))) {
        await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=? AND version_id=?', [s.body_html + trackerAddition, s.id, version.id]);
      }
      for (const e of entries.filter(e => e.subject === 'Handbook change tracker — October compensation revision' && !e.changed_content.includes(trackerHeading))) {
        await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=? AND digest_id=1 AND agency_id=2', [e.changed_content + trackerAddition, e.id]);
      }
      for (const row of revised) await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL', [JSON.stringify(row.data), row.html, row.id]);
      for (const row of revisedClauses) await db.execute('UPDATE contract_clauses SET body_html=? WHERE id=? AND agency_id=2 AND is_active=0', [row.body, row.id]);
      await db.commit();
    } else {
      await db.rollback();
    }
    if (process.env.AMENDMENT_REVIEW_DIR) for (const row of revised.filter(r => r.data.example || [465,496].includes(Number(r.data.employee.userId)))) {
      const name = row.data.employee.name.replace(/[^a-zA-Z0-9]+/g, '-');
      fs.writeFileSync(`${process.env.AMENDMENT_REVIEW_DIR}/${name}-amendment-level-review.html`, `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.65 system-ui;max-width:1080px;margin:32px auto;padding:24px;color:#173346}table{border-collapse:collapse;width:100%}th,td{padding:12px;border:1px solid #cad6df;text-align:left}thead th{background:#173346;color:white}h2,h3{margin-top:30px}</style>${row.html}`, {mode: 0o600});
    }
    console.log(JSON.stringify({mode: apply ? 'applied-drafts-only' : 'dry-run', amendments: revised.length, handbookSection: policy.title, messagesSent: 0, payrollChanged: false, published: false}));
  } catch (error) {
    await db.rollback(); throw error;
  } finally { db.release(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
