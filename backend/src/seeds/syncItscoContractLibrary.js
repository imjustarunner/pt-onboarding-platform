/**
 * Upsert ITSCO employment contract clauses + configs from seed data.
 * Run: node backend/src/seeds/syncItscoContractLibrary.js
 */
import pool from '../config/database.js';
import {
  ITSCO_CONTRACT_CLAUSES,
  ITSCO_CONTRACT_CONFIGS,
  ITSCO_TEMPLATE_NAME,
  mdToHtml
} from './itscoContractClauseLibrary.js';

async function resolveItscoAgencyId() {
  const [rows] = await pool.execute(
    `SELECT id FROM agencies
     WHERE organization_type = 'agency'
       AND (slug = 'itsco' OR LOWER(name) LIKE '%itsco%')
     ORDER BY id ASC
     LIMIT 1`
  );
  return rows[0]?.id || null;
}

export async function syncItscoContractLibrary({ agencyId: forcedAgencyId } = {}) {
  const agencyId = forcedAgencyId || (await resolveItscoAgencyId());
  if (!agencyId) {
    throw new Error('ITSCO agency not found');
  }

  let templateId;
  const [existingTpl] = await pool.execute(
    `SELECT id FROM contract_templates WHERE agency_id = ? AND name = ? LIMIT 1`,
    [agencyId, ITSCO_TEMPLATE_NAME]
  );
  if (existingTpl[0]?.id) {
    templateId = existingTpl[0].id;
    await pool.execute(
      `UPDATE contract_templates SET name = ?, font_family = 'Georgia, serif', is_active = 1 WHERE id = ?`,
      [ITSCO_TEMPLATE_NAME, templateId]
    );
  } else {
    const [ins] = await pool.execute(
      `INSERT INTO contract_templates (agency_id, name, font_family, is_active) VALUES (?, ?, 'Georgia, serif', 1)`,
      [agencyId, ITSCO_TEMPLATE_NAME]
    );
    templateId = ins.insertId;
  }

  let clauseCount = 0;
  for (const clause of ITSCO_CONTRACT_CLAUSES) {
    const bodyHtml = mdToHtml(clause.body_md || '');
    await pool.execute(
      `INSERT INTO contract_clauses (agency_id, clause_key, title, body_html, sort_hint, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         body_html = VALUES(body_html),
         sort_hint = VALUES(sort_hint),
         is_active = 1`,
      [
        agencyId,
        clause.clause_key,
        String(clause.title || '').slice(0, 255) || clause.clause_key,
        bodyHtml,
        Number(clause.sort_hint) || 0
      ]
    );
    clauseCount += 1;
  }

  let configCount = 0;
  for (const cfg of ITSCO_CONTRACT_CONFIGS) {
    await pool.execute(
      `INSERT INTO contract_configs
        (agency_id, name, slug, contract_template_id, pay_mode, rate_config_key, clause_keys_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         contract_template_id = VALUES(contract_template_id),
         pay_mode = VALUES(pay_mode),
         rate_config_key = VALUES(rate_config_key),
         clause_keys_json = VALUES(clause_keys_json),
         is_active = 1`,
      [
        agencyId,
        cfg.name,
        cfg.slug,
        templateId,
        cfg.pay_mode || 'hourly',
        cfg.rate_config_key || null,
        JSON.stringify(cfg.clause_keys || [])
      ]
    );
    configCount += 1;
  }

  return { agencyId, templateId, clauseCount, configCount };
}

const isMain = process.argv[1]?.includes('syncItscoContractLibrary');
if (isMain) {
  syncItscoContractLibrary()
    .then((r) => {
      console.log('Synced ITSCO contract library:', r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
