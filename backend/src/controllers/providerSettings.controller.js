import pool from '../config/database.js';
import { validationResult } from 'express-validator';

const parseAgencyId = (req) => {
  const raw = req.params.agencyId || req.query.agencyId || req.body.agencyId || req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const listProviderCredentials = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM provider_credentials WHERE agency_id = ? ORDER BY is_active DESC, label ASC`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertProviderCredential = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });

    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const { id, credentialKey, label, isActive } = req.body;
    const is_active = isActive === undefined ? true : (isActive === true || isActive === 'true');

    if (id) {
      await pool.execute(
        `UPDATE provider_credentials SET credential_key = ?, label = ?, is_active = ? WHERE id = ? AND agency_id = ?`,
        [String(credentialKey).trim(), String(label).trim(), is_active, parseInt(id, 10), agencyId]
      );
      const [rows] = await pool.execute(`SELECT * FROM provider_credentials WHERE id = ?`, [parseInt(id, 10)]);
      return res.json(rows[0] || null);
    }

    await pool.execute(
      `INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = VALUES(is_active)`,
      [agencyId, String(credentialKey).trim(), String(label).trim(), is_active]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM provider_credentials WHERE agency_id = ? AND credential_key = ? LIMIT 1`,
      [agencyId, String(credentialKey).trim()]
    );
    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

export const listCredentialInsuranceMatrix = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [credentials] = await pool.execute(
      `SELECT * FROM provider_credentials WHERE agency_id = ? AND is_active = TRUE ORDER BY label ASC`,
      [agencyId]
    );
    const [insurances] = await pool.execute(
      `SELECT * FROM insurance_types WHERE agency_id = ? AND is_active = TRUE ORDER BY label ASC`,
      [agencyId]
    );
    const [elig] = await pool.execute(
      `SELECT * FROM credential_insurance_eligibility WHERE credential_id IN (${
        credentials.length ? credentials.map(() => '?').join(',') : 'NULL'
      })`,
      credentials.length ? credentials.map(c => c.id) : []
    );

    // Build lookup: credential_id -> insurance_id -> is_allowed
    const map = {};
    elig.forEach(r => {
      if (!map[r.credential_id]) map[r.credential_id] = {};
      map[r.credential_id][r.insurance_type_id] = !!r.is_allowed;
    });

    res.json({ credentials, insurances, eligibility: map });
  } catch (e) {
    next(e);
  }
};

export const setCredentialInsuranceEligibility = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });

    const { credentialId, insuranceTypeId, isAllowed } = req.body;
    const cId = parseInt(credentialId, 10);
    const iId = parseInt(insuranceTypeId, 10);
    if (!cId || !iId) return res.status(400).json({ error: { message: 'credentialId and insuranceTypeId are required' } });

    await pool.execute(
      `INSERT INTO credential_insurance_eligibility (credential_id, insurance_type_id, is_allowed)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed)`,
      [cId, iId, isAllowed === true || isAllowed === 'true' ? 1 : 0]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

