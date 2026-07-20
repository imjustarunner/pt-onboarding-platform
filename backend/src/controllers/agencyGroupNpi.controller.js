import multer from 'multer';
import path from 'path';
import AgencyGroupNpi from '../models/AgencyGroupNpi.model.js';
import AgencyGroupNpiPayerCredentialing from '../models/AgencyGroupNpiPayerCredentialing.model.js';
import InsuranceCredentialingDefinition from '../models/InsuranceCredentialingDefinition.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import StorageService from '../services/storage.service.js';
import { encryptChatText } from '../services/chatEncryption.service.js';
import { userHasCredentialingAccessForAgency } from '../utils/capabilities.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

export const payerCredentialDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif'
    ];
    if (allowed.includes(String(file.mimetype || '').toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF or image files are allowed'));
  }
});

async function assertCredentialPrivilege(req, agencyId) {
  if (req.user.role === 'super_admin') return;
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'support', 'staff'].includes(role)) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
  const allowed = await userHasCredentialingAccessForAgency(req.user.id, agencyId, { role });
  if (allowed) return;
  const err = new Error('Access denied');
  err.statusCode = 403;
  throw err;
}

function parseAgencyId(req) {
  const agencyId = parseInt(req.params.agencyId, 10);
  if (!Number.isInteger(agencyId) || agencyId <= 0) return null;
  return agencyId;
}

async function assertGroupNpiBelongsToAgency(groupNpiId, agencyId) {
  const row = await AgencyGroupNpi.findById(groupNpiId);
  if (!row || Number(row.agency_id) !== Number(agencyId)) {
    const err = new Error('Agency group NPI not found');
    err.statusCode = 404;
    throw err;
  }
  return row;
}

async function listOfficeOptions(agencyId) {
  let rows = [];
  try {
    rows = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: false });
  } catch {
    rows = [];
  }
  if (!rows?.length) {
    try {
      rows = await OfficeLocation.findByAgency(agencyId, { includeInactive: false });
    } catch {
      rows = [];
    }
  }
  return (rows || []).map((o) => ({
    id: o.id,
    name: o.name,
    street_address: o.street_address || null,
    city: o.city || null,
    state: o.state || null,
    postal_code: o.postal_code || null
  }));
}

function serializeGroupNpi(row) {
  if (!row) return null;
  return {
    id: row.id,
    agency_id: row.agency_id,
    npi_number: row.npi_number,
    label: row.label || null,
    taxonomy_code: row.taxonomy_code || null,
    medicaid_provider_type: row.medicaid_provider_type || null,
    office_location_id: row.office_location_id || null,
    office_location_name: row.office_location_name || null,
    office_street_address: row.office_street_address || null,
    office_city: row.office_city || null,
    office_state: row.office_state || null,
    office_postal_code: row.office_postal_code || null,
    notes: row.notes || null,
    is_active: !!row.is_active,
    payer_credential_count: Number(row.payer_credential_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function serializePayerCred(r) {
  return {
    id: r.id,
    agency_group_npi_id: r.agency_group_npi_id,
    insurance_credentialing_definition_id: r.insurance_credentialing_definition_id,
    insurance_name: r.insurance_name,
    insurance_logo_path: r.insurance_logo_path || null,
    insurance_logo_url: r.insurance_logo_path ? publicUploadsUrlFromStoredPath(r.insurance_logo_path) : null,
    effective_date: r.effective_date,
    submitted_date: r.submitted_date,
    resubmitted_date: r.resubmitted_date,
    returned_date: r.returned_date || null,
    pin_or_reference: r.pin_or_reference,
    notes: r.notes,
    welcome_letter_path: r.welcome_letter_path || null,
    welcome_letter_url: r.welcome_letter_path ? publicUploadsUrlFromStoredPath(r.welcome_letter_path) : null,
    contract_path: r.contract_path || null,
    contract_url: r.contract_path ? publicUploadsUrlFromStoredPath(r.contract_path) : null,
    has_group_credentials: !!(r.group_level_username_ciphertext || r.group_level_password_ciphertext)
  };
}

export const listAgencyGroupNpis = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    await assertCredentialPrivilege(req, agencyId);
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const rows = await AgencyGroupNpi.listByAgencyId(agencyId, { includeInactive });
    const offices = await listOfficeOptions(agencyId);
    res.json({
      groupNpis: (rows || []).map(serializeGroupNpi),
      offices
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: { message: 'Agency group NPIs are not available yet. Run migration 1012 and retry.' }
      });
    }
    next(e);
  }
};

export const createAgencyGroupNpi = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    await assertCredentialPrivilege(req, agencyId);
    const body = req.body || {};
    const npiNumber = String(body.npiNumber || body.npi_number || '').trim();
    if (!npiNumber) {
      return res.status(400).json({ error: { message: 'npiNumber is required' } });
    }
    if (!/^\d{10}$/.test(npiNumber)) {
      return res.status(400).json({ error: { message: 'npiNumber must be a 10-digit NPI' } });
    }
    let officeLocationId = body.officeLocationId ?? body.office_location_id ?? null;
    if (officeLocationId != null && officeLocationId !== '') {
      officeLocationId = parseInt(officeLocationId, 10);
      if (!Number.isInteger(officeLocationId) || officeLocationId <= 0) {
        return res.status(400).json({ error: { message: 'Invalid officeLocationId' } });
      }
      const offices = await listOfficeOptions(agencyId);
      if (!offices.some((o) => Number(o.id) === officeLocationId)) {
        return res.status(400).json({ error: { message: 'Office location not found for this agency' } });
      }
    } else {
      officeLocationId = null;
    }
    const created = await AgencyGroupNpi.create({
      agencyId,
      npiNumber,
      label: body.label || null,
      taxonomyCode: body.taxonomyCode ?? body.taxonomy_code ?? null,
      medicaidProviderType: body.medicaidProviderType ?? body.medicaid_provider_type ?? null,
      officeLocationId,
      notes: body.notes || null,
      isActive: body.isActive !== false && body.is_active !== 0 && body.is_active !== false,
      updatedByUserId: req.user.id
    });
    res.status(201).json(serializeGroupNpi(created));
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'This agency already has that NPI number' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: { message: 'Agency group NPIs are not available yet. Run migration 1012 and retry.' }
      });
    }
    next(e);
  }
};

export const updateAgencyGroupNpi = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    await assertGroupNpiBelongsToAgency(id, agencyId);
    const body = req.body || {};
    const patch = { updatedByUserId: req.user.id };
    if (body.npiNumber != null || body.npi_number != null) {
      const npiNumber = String(body.npiNumber ?? body.npi_number ?? '').trim();
      if (!/^\d{10}$/.test(npiNumber)) {
        return res.status(400).json({ error: { message: 'npiNumber must be a 10-digit NPI' } });
      }
      patch.npiNumber = npiNumber;
    }
    if (body.label !== undefined) patch.label = body.label;
    if (body.taxonomyCode !== undefined || body.taxonomy_code !== undefined) {
      patch.taxonomyCode = body.taxonomyCode ?? body.taxonomy_code;
    }
    if (body.medicaidProviderType !== undefined || body.medicaid_provider_type !== undefined) {
      patch.medicaidProviderType = body.medicaidProviderType ?? body.medicaid_provider_type;
    }
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.isActive !== undefined || body.is_active !== undefined) {
      patch.isActive = body.isActive ?? body.is_active;
    }
    if (body.officeLocationId !== undefined || body.office_location_id !== undefined) {
      let officeLocationId = body.officeLocationId ?? body.office_location_id;
      if (officeLocationId == null || officeLocationId === '') {
        patch.officeLocationId = null;
      } else {
        officeLocationId = parseInt(officeLocationId, 10);
        if (!Number.isInteger(officeLocationId) || officeLocationId <= 0) {
          return res.status(400).json({ error: { message: 'Invalid officeLocationId' } });
        }
        const offices = await listOfficeOptions(agencyId);
        if (!offices.some((o) => Number(o.id) === officeLocationId)) {
          return res.status(400).json({ error: { message: 'Office location not found for this agency' } });
        }
        patch.officeLocationId = officeLocationId;
      }
    }
    const updated = await AgencyGroupNpi.update(id, patch);
    res.json(serializeGroupNpi(updated));
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: { message: e.message } });
    if (e?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'This agency already has that NPI number' } });
    }
    next(e);
  }
};

export const deleteAgencyGroupNpi = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    await assertGroupNpiBelongsToAgency(id, agencyId);
    const hard = String(req.query.hard || '').toLowerCase() === 'true';
    if (hard) {
      await AgencyGroupNpi.hardDelete(id);
    } else {
      await AgencyGroupNpi.softDelete(id, req.user.id);
    }
    res.json({ ok: true });
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: { message: e.message } });
    next(e);
  }
};

export const listAgencyGroupNpiPayerCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const groupNpiId = parseInt(req.params.id, 10);
    if (!agencyId || !Number.isInteger(groupNpiId) || groupNpiId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    await assertGroupNpiBelongsToAgency(groupNpiId, agencyId);
    const rows = await AgencyGroupNpiPayerCredentialing.listByGroupNpiId(groupNpiId);
    const byAgency = await InsuranceCredentialingDefinition.listByAgencyId(agencyId);
    const agencyInsIds = new Set((byAgency || []).map((i) => i.id));
    const filtered = (rows || []).filter((r) => agencyInsIds.has(r.insurance_credentialing_definition_id));
    res.json({ credentialing: filtered.map(serializePayerCred) });
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: { message: e.message } });
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: { message: 'Agency group NPIs are not available yet. Run migration 1012 and retry.' }
      });
    }
    next(e);
  }
};

export const upsertAgencyGroupNpiPayerCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    await assertCredentialPrivilege(req, agencyId);
    const body = req.body || {};
    const agencyGroupNpiId = parseInt(body.agencyGroupNpiId || body.agency_group_npi_id, 10);
    const insuranceCredentialingDefinitionId = parseInt(
      body.insuranceCredentialingDefinitionId || body.insurance_credentialing_definition_id,
      10
    );
    if (!agencyGroupNpiId || !insuranceCredentialingDefinitionId) {
      return res.status(400).json({
        error: { message: 'agencyGroupNpiId and insuranceCredentialingDefinitionId required' }
      });
    }
    await assertGroupNpiBelongsToAgency(agencyGroupNpiId, agencyId);
    const def = await InsuranceCredentialingDefinition.findById(insuranceCredentialingDefinitionId);
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(400).json({ error: { message: 'Insurance definition not found or wrong agency' } });
    }
    const created = await AgencyGroupNpiPayerCredentialing.upsert({
      agencyGroupNpiId,
      insuranceCredentialingDefinitionId,
      effectiveDate: body.effectiveDate || null,
      submittedDate: body.submittedDate || null,
      resubmittedDate: body.resubmittedDate || null,
      returnedDate: body.returnedDate || null,
      pinOrReference: body.pinOrReference ? String(body.pinOrReference).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      updatedByUserId: req.user.id
    });
    res.json(serializePayerCred(created));
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateAgencyGroupNpiPayerCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.credId, 10);
    if (!agencyId || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or credId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const row = await AgencyGroupNpiPayerCredentialing.findById(id);
    if (!row || Number(row.group_npi_agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Group NPI payer credentialing not found' } });
    }
    const body = req.body || {};
    const patch = { updatedByUserId: req.user.id };
    if (body.effectiveDate !== undefined) patch.effectiveDate = body.effectiveDate || null;
    if (body.submittedDate !== undefined) patch.submittedDate = body.submittedDate || null;
    if (body.resubmittedDate !== undefined) patch.resubmittedDate = body.resubmittedDate || null;
    if (body.returnedDate !== undefined) patch.returnedDate = body.returnedDate || null;
    if (body.pinOrReference !== undefined) {
      patch.pinOrReference = body.pinOrReference ? String(body.pinOrReference).trim() : null;
    }
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).trim() : null;
    await AgencyGroupNpiPayerCredentialing.update(id, patch);

    if (
      (body.loginUsername != null && body.loginUsername !== '') ||
      (body.loginPassword != null && body.loginPassword !== '')
    ) {
      const usernameEnc =
        body.loginUsername != null && body.loginUsername !== ''
          ? encryptChatText(body.loginUsername)
          : null;
      const passwordEnc =
        body.loginPassword != null && body.loginPassword !== ''
          ? encryptChatText(body.loginPassword)
          : null;
      await AgencyGroupNpiPayerCredentialing.updateCredentials(id, { usernameEnc, passwordEnc }, req.user.id);
    }

    const updated = await AgencyGroupNpiPayerCredentialing.findById(id);
    res.json(serializePayerCred(updated));
  } catch (e) {
    next(e);
  }
};

export const deleteAgencyGroupNpiPayerCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    await assertCredentialPrivilege(req, agencyId);
    const { agencyGroupNpiId, insuranceCredentialingDefinitionId } = req.body || req.query || {};
    const groupNpiId = parseInt(agencyGroupNpiId, 10);
    const defId = parseInt(insuranceCredentialingDefinitionId, 10);
    if (!groupNpiId || !defId) {
      return res.status(400).json({
        error: { message: 'agencyGroupNpiId and insuranceCredentialingDefinitionId required' }
      });
    }
    await assertGroupNpiBelongsToAgency(groupNpiId, agencyId);
    const def = await InsuranceCredentialingDefinition.findById(defId);
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(400).json({ error: { message: 'Insurance definition not found or wrong agency' } });
    }
    await AgencyGroupNpiPayerCredentialing.delete(groupNpiId, defId);
    res.json({ ok: true });
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: { message: e.message } });
    next(e);
  }
};

export const uploadAgencyGroupNpiPayerDocument = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const id = parseInt(req.params.credId, 10);
    const docType = String(req.params.docType || req.body?.docType || '').trim().toLowerCase();
    if (!agencyId || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or credId' } });
    }
    if (!['welcome_letter', 'contract'].includes(docType)) {
      return res.status(400).json({ error: { message: 'docType must be welcome_letter or contract' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: { message: 'File is required' } });
    }
    const row = await AgencyGroupNpiPayerCredentialing.findById(id);
    if (!row || Number(row.group_npi_agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Group NPI payer credentialing not found' } });
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext =
      path.extname(req.file.originalname || '') ||
      (String(req.file.mimetype || '').includes('pdf') ? '.pdf' : '.jpg');
    const filename = `group-payer-${docType}-${row.agency_group_npi_id}-${id}-${uniqueSuffix}${ext}`;
    const storageResult = await StorageService.saveComplianceDocument(
      req.file.buffer,
      filename,
      req.file.mimetype || 'application/pdf'
    );

    const patch =
      docType === 'welcome_letter'
        ? { welcomeLetterPath: storageResult.relativePath, updatedByUserId: req.user?.id || null }
        : { contractPath: storageResult.relativePath, updatedByUserId: req.user?.id || null };

    await AgencyGroupNpiPayerCredentialing.update(id, patch);
    const updated = await AgencyGroupNpiPayerCredentialing.findById(id);
    res.json({
      ok: true,
      docType,
      path: storageResult.relativePath,
      url: publicUploadsUrlFromStoredPath(storageResult.relativePath),
      record: serializePayerCred(updated)
    });
  } catch (e) {
    next(e);
  }
};
