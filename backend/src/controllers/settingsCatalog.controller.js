import pool from '../config/database.js';

function toKeyName(displayName) {
  return String(displayName || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 64) || 'Unknown';
}

const CATALOGS = {
  client_statuses: {
    table: 'client_status_definitions'
  },
  paperwork_statuses: {
    table: 'paperwork_status_definitions'
  },
  paperwork_deliveries: {
    table: 'paperwork_delivery_definitions'
  },
  insurances: {
    table: 'insurance_definitions'
  },
  provider_credentials: {
    table: 'provider_credential_definitions'
  }
};

export async function listCatalog(req, res, next) {
  try {
    const { agencyId, catalog } = req.params;
    const cfg = CATALOGS[catalog];
    if (!cfg) {
      return res.status(400).json({ error: { message: 'Unknown catalog' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, key_name, display_name, description, is_active, created_at, updated_at
       FROM ${cfg.table}
       WHERE agency_id = ?
       ORDER BY display_name ASC`,
      [parseInt(agencyId, 10)]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createCatalogItem(req, res, next) {
  try {
    const { agencyId, catalog } = req.params;
    const cfg = CATALOGS[catalog];
    if (!cfg) {
      return res.status(400).json({ error: { message: 'Unknown catalog' } });
    }

    const displayName = String(req.body.display_name || req.body.displayName || '').trim();
    if (!displayName) {
      return res.status(400).json({ error: { message: 'display_name is required' } });
    }
    const description = req.body.description !== undefined ? String(req.body.description || '') : null;
    const isActive = req.body.is_active !== undefined ? !!req.body.is_active : (req.body.isActive !== undefined ? !!req.body.isActive : true);

    const keyName = toKeyName(displayName);

    const [result] = await pool.execute(
      `INSERT INTO ${cfg.table} (agency_id, key_name, display_name, description, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [parseInt(agencyId, 10), keyName, displayName, description, isActive ? 1 : 0]
    );

    const [rows] = await pool.execute(
      `SELECT id, key_name, display_name, description, is_active, created_at, updated_at
       FROM ${cfg.table}
       WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    // Handle unique conflicts cleanly.
    if (String(e.code || '').includes('ER_DUP_ENTRY')) {
      return res.status(409).json({ error: { message: 'An item with this name already exists for this agency' } });
    }
    next(e);
  }
}

export async function updateCatalogItem(req, res, next) {
  try {
    const { agencyId, catalog, id } = req.params;
    const cfg = CATALOGS[catalog];
    if (!cfg) {
      return res.status(400).json({ error: { message: 'Unknown catalog' } });
    }

    const updates = [];
    const values = [];

    if (req.body.display_name !== undefined || req.body.displayName !== undefined) {
      const displayName = String(req.body.display_name || req.body.displayName || '').trim();
      if (!displayName) {
        return res.status(400).json({ error: { message: 'display_name cannot be empty' } });
      }
      updates.push('display_name = ?');
      values.push(displayName);
      updates.push('key_name = ?');
      values.push(toKeyName(displayName));
    }

    if (req.body.description !== undefined) {
      updates.push('description = ?');
      values.push(String(req.body.description || '') || null);
    }

    if (req.body.is_active !== undefined || req.body.isActive !== undefined) {
      const isActive = req.body.is_active !== undefined ? !!req.body.is_active : !!req.body.isActive;
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }

    if (!updates.length) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    values.push(parseInt(agencyId, 10), parseInt(id, 10));
    await pool.execute(
      `UPDATE ${cfg.table}
       SET ${updates.join(', ')}
       WHERE agency_id = ? AND id = ?`,
      values
    );

    const [rows] = await pool.execute(
      `SELECT id, key_name, display_name, description, is_active, created_at, updated_at
       FROM ${cfg.table}
       WHERE agency_id = ? AND id = ?`,
      [parseInt(agencyId, 10), parseInt(id, 10)]
    );
    res.json(rows[0] || null);
  } catch (e) {
    next(e);
  }
}

export async function getProviderCredentialInsuranceRules(req, res, next) {
  try {
    const { agencyId } = req.params;
    const aid = parseInt(agencyId, 10);

    const [credentials] = await pool.execute(
      `SELECT id, key_name, display_name, description, is_active
       FROM provider_credential_definitions
       WHERE agency_id = ?
       ORDER BY display_name ASC`,
      [aid]
    );

    const [insurances] = await pool.execute(
      `SELECT id, key_name, display_name, description, is_active
       FROM insurance_definitions
       WHERE agency_id = ?
       ORDER BY display_name ASC`,
      [aid]
    );

    const [rules] = await pool.execute(
      `SELECT id, credential_id, insurance_id, is_allowed
       FROM provider_credential_insurance_rules
       WHERE agency_id = ?`,
      [aid]
    );

    res.json({ credentials, insurances, rules });
  } catch (e) {
    next(e);
  }
}

export async function upsertProviderCredentialInsuranceRules(req, res, next) {
  try {
    const { agencyId } = req.params;
    const aid = parseInt(agencyId, 10);
    const rules = Array.isArray(req.body.rules) ? req.body.rules : null;
    if (!rules) {
      return res.status(400).json({ error: { message: 'rules array is required' } });
    }

    for (const r of rules) {
      const credentialId = parseInt(r.credential_id ?? r.credentialId, 10);
      const insuranceId = parseInt(r.insurance_id ?? r.insuranceId, 10);
      const isAllowed = r.is_allowed !== undefined ? !!r.is_allowed : !!r.isAllowed;
      if (!credentialId || !insuranceId) continue;

      await pool.execute(
        `INSERT INTO provider_credential_insurance_rules (agency_id, credential_id, insurance_id, is_allowed)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed)`,
        [aid, credentialId, insuranceId, isAllowed ? 1 : 0]
      );
    }

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

