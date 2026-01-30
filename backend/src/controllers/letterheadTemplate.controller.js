import { validationResult } from 'express-validator';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import LetterheadTemplate from '../models/LetterheadTemplate.model.js';

const parseNullablePositiveInt = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'all') return null;
  const n = parseInt(s, 10);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return n;
};

const parseEnum = (value, allowed, fallback) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return fallback;
  return allowed.includes(v) ? v : undefined;
};

const parseNumber = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) return undefined;
  return n;
};

const validateAgencyOrgScope = async ({ agencyId, organizationId }) => {
  if (organizationId === null) return { ok: true };
  if (agencyId === null) return { ok: false, message: 'organizationId cannot be set for platform letterheads (agencyId is null)' };

  // org exists?
  const [orgRows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [organizationId]);
  if (!orgRows || orgRows.length === 0) return { ok: false, message: `Invalid organizationId: ${organizationId} (organization not found)` };

  // affiliation exists?
  const [aff] = await pool.execute(
    'SELECT id FROM organization_affiliations WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1',
    [agencyId, organizationId]
  );
  if (!aff || aff.length === 0) {
    return { ok: false, message: `organizationId ${organizationId} is not affiliated with agencyId ${agencyId}` };
  }

  return { ok: true };
};

export const listLetterheadTemplates = async (req, res, next) => {
  try {
    const { agencyId, organizationId, includePlatform } = req.query;

    const parsedAgencyId = parseNullablePositiveInt(agencyId);
    if (parsedAgencyId === undefined) return res.status(400).json({ error: { message: 'agencyId must be null or a positive integer' } });

    const parsedOrganizationId = parseNullablePositiveInt(organizationId);
    if (parsedOrganizationId === undefined) {
      return res.status(400).json({ error: { message: 'organizationId must be null or a positive integer' } });
    }

    const includePlat = String(includePlatform || 'true').toLowerCase() !== 'false';

    const rows = await LetterheadTemplate.list({
      agencyId: parsedAgencyId,
      organizationId: parsedOrganizationId,
      includePlatform: includePlat,
      includeInactive: false
    });

    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getLetterheadTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const row = await LetterheadTemplate.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Letterhead not found' } });
    res.json(row);
  } catch (e) {
    next(e);
  }
};

export const createLetterheadTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const {
      name,
      agencyId,
      organizationId,
      templateType,
      headerHtml,
      footerHtml,
      cssContent,
      pageSize,
      orientation,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      headerHeight,
      footerHeight
    } = req.body;

    const createdByUserId = req.user?.id;
    if (!createdByUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const parsedAgencyId = parseNullablePositiveInt(agencyId);
    if (parsedAgencyId === undefined) {
      return res.status(400).json({ error: { message: 'agencyId must be null or a positive integer' } });
    }

    let parsedOrganizationId = parseNullablePositiveInt(organizationId);
    if (parsedOrganizationId === undefined) {
      return res.status(400).json({ error: { message: 'organizationId must be null or a positive integer' } });
    }
    if (parsedOrganizationId !== null && parsedAgencyId !== null && parsedOrganizationId === parsedAgencyId) {
      parsedOrganizationId = null;
    }

    // Permissions: platform scope requires super_admin
    if (parsedAgencyId === null && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only platform admins can create platform letterheads' } });
    }

    // For agency-scoped letterheads, non-super-admins must belong to agency
    if (parsedAgencyId !== null && req.user?.role !== 'super_admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = (userAgencies || []).map(a => a.id);
      if (!agencyIds.includes(parsedAgencyId)) {
        return res.status(403).json({ error: { message: 'Not authorized to create letterheads for this agency' } });
      }
    }

    // Validate agency exists when set
    if (parsedAgencyId !== null) {
      const [rows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [parsedAgencyId]);
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid agencyId: ${parsedAgencyId} (agency not found)` } });
      }
    }

    const scopeOk = await validateAgencyOrgScope({ agencyId: parsedAgencyId, organizationId: parsedOrganizationId });
    if (!scopeOk.ok) return res.status(400).json({ error: { message: scopeOk.message } });

    const tType = parseEnum(templateType, ['svg', 'png', 'html'], 'html');
    if (tType === undefined) {
      return res.status(400).json({ error: { message: 'templateType must be "svg", "png", or "html"' } });
    }
    if (tType !== 'html') {
      return res.status(400).json({ error: { message: 'Use /letterhead-templates/upload for svg/png letterheads' } });
    }

    const pSize = parseEnum(pageSize, ['letter', 'a4'], 'letter');
    if (pSize === undefined) return res.status(400).json({ error: { message: 'pageSize must be "letter" or "a4"' } });

    const orient = parseEnum(orientation, ['portrait', 'landscape'], 'portrait');
    if (orient === undefined) return res.status(400).json({ error: { message: 'orientation must be "portrait" or "landscape"' } });

    const mt = parseNumber(marginTop, 72);
    const mr = parseNumber(marginRight, 72);
    const mb = parseNumber(marginBottom, 72);
    const ml = parseNumber(marginLeft, 72);
    const hh = parseNumber(headerHeight, 96);
    const fh = parseNumber(footerHeight, 72);
    if ([mt, mr, mb, ml, hh, fh].some(v => v === undefined)) {
      return res.status(400).json({ error: { message: 'Margins/heights must be valid numbers' } });
    }

    const created = await LetterheadTemplate.create({
      name: String(name).trim(),
      agencyId: parsedAgencyId,
      organizationId: parsedOrganizationId,
      templateType: 'html',
      filePath: null,
      headerHtml: headerHtml ?? null,
      footerHtml: footerHtml ?? null,
      cssContent: cssContent ?? null,
      pageSize: pSize,
      orientation: orient,
      marginTop: mt,
      marginRight: mr,
      marginBottom: mb,
      marginLeft: ml,
      headerHeight: hh,
      footerHeight: fh,
      createdByUserId
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const uploadLetterheadAsset = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'file is required (SVG or PNG)' } });
    }

    const {
      name,
      agencyId,
      organizationId,
      templateType,
      pageSize,
      orientation,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      headerHeight,
      footerHeight
    } = req.body;

    const createdByUserId = req.user?.id;
    if (!createdByUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const parsedAgencyId = parseNullablePositiveInt(agencyId);
    if (parsedAgencyId === undefined) return res.status(400).json({ error: { message: 'agencyId must be null or a positive integer' } });

    let parsedOrganizationId = parseNullablePositiveInt(organizationId);
    if (parsedOrganizationId === undefined) return res.status(400).json({ error: { message: 'organizationId must be null or a positive integer' } });
    if (parsedOrganizationId !== null && parsedAgencyId !== null && parsedOrganizationId === parsedAgencyId) {
      parsedOrganizationId = null;
    }

    if (parsedAgencyId === null && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only platform admins can create platform letterheads' } });
    }
    if (parsedAgencyId !== null && req.user?.role !== 'super_admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = (userAgencies || []).map(a => a.id);
      if (!agencyIds.includes(parsedAgencyId)) {
        return res.status(403).json({ error: { message: 'Not authorized to create letterheads for this agency' } });
      }
    }
    if (parsedAgencyId !== null) {
      const [rows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [parsedAgencyId]);
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid agencyId: ${parsedAgencyId} (agency not found)` } });
      }
    }
    const scopeOk = await validateAgencyOrgScope({ agencyId: parsedAgencyId, organizationId: parsedOrganizationId });
    if (!scopeOk.ok) return res.status(400).json({ error: { message: scopeOk.message } });

    const tType = parseEnum(templateType, ['svg', 'png'], null);
    if (!tType) return res.status(400).json({ error: { message: 'templateType must be "svg" or "png" for uploads' } });

    // Validate file type
    const mimetype = String(req.file.mimetype || '').toLowerCase();
    if (tType === 'svg' && mimetype !== 'image/svg+xml') {
      return res.status(400).json({ error: { message: 'SVG upload requires image/svg+xml' } });
    }
    if (tType === 'png' && mimetype !== 'image/png') {
      return res.status(400).json({ error: { message: 'PNG upload requires image/png' } });
    }

    const pSize = parseEnum(pageSize, ['letter', 'a4'], 'letter');
    if (pSize === undefined) return res.status(400).json({ error: { message: 'pageSize must be "letter" or "a4"' } });

    const orient = parseEnum(orientation, ['portrait', 'landscape'], 'portrait');
    if (orient === undefined) return res.status(400).json({ error: { message: 'orientation must be "portrait" or "landscape"' } });

    const mt = parseNumber(marginTop, 72);
    const mr = parseNumber(marginRight, 72);
    const mb = parseNumber(marginBottom, 72);
    const ml = parseNumber(marginLeft, 72);
    const hh = parseNumber(headerHeight, 96);
    const fh = parseNumber(footerHeight, 72);
    if ([mt, mr, mb, ml, hh, fh].some(v => v === undefined)) {
      return res.status(400).json({ error: { message: 'Margins/heights must be valid numbers' } });
    }

    const ext = tType === 'svg' ? '.svg' : '.png';
    const unique = `letterhead-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const storageResult = await StorageService.saveLetterheadAsset(req.file.buffer, unique, mimetype);

    const created = await LetterheadTemplate.create({
      name: String(name).trim(),
      agencyId: parsedAgencyId,
      organizationId: parsedOrganizationId,
      templateType: tType,
      filePath: storageResult.relativePath,
      headerHtml: null,
      footerHtml: null,
      cssContent: null,
      pageSize: pSize,
      orientation: orient,
      marginTop: mt,
      marginRight: mr,
      marginBottom: mb,
      marginLeft: ml,
      headerHeight: hh,
      footerHeight: fh,
      createdByUserId
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const updateLetterheadTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const existing = await LetterheadTemplate.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Letterhead not found' } });

    // Permissions: super_admin can edit any; otherwise must belong to agency (when agency scoped)
    if (req.user?.role !== 'super_admin' && existing.agency_id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = (userAgencies || []).map(a => a.id);
      if (!agencyIds.includes(existing.agency_id)) {
        return res.status(403).json({ error: { message: 'Not authorized to edit this letterhead' } });
      }
    }
    if (req.user?.role !== 'super_admin' && existing.agency_id === null) {
      return res.status(403).json({ error: { message: 'Only platform admins can edit platform letterheads' } });
    }

    // If changing scope, validate
    const parsedAgencyId = Object.prototype.hasOwnProperty.call(req.body, 'agencyId')
      ? parseNullablePositiveInt(req.body.agencyId)
      : existing.agency_id;
    if (parsedAgencyId === undefined) return res.status(400).json({ error: { message: 'agencyId must be null or a positive integer' } });

    let parsedOrganizationId = Object.prototype.hasOwnProperty.call(req.body, 'organizationId')
      ? parseNullablePositiveInt(req.body.organizationId)
      : existing.organization_id;
    if (parsedOrganizationId === undefined) return res.status(400).json({ error: { message: 'organizationId must be null or a positive integer' } });
    if (parsedOrganizationId !== null && parsedAgencyId !== null && parsedOrganizationId === parsedAgencyId) {
      parsedOrganizationId = null;
    }

    const scopeOk = await validateAgencyOrgScope({ agencyId: parsedAgencyId, organizationId: parsedOrganizationId });
    if (!scopeOk.ok) return res.status(400).json({ error: { message: scopeOk.message } });

    const updated = await LetterheadTemplate.update(id, {
      name: req.body.name,
      agencyId: parsedAgencyId,
      organizationId: parsedOrganizationId,
      headerHtml: req.body.headerHtml,
      footerHtml: req.body.footerHtml,
      cssContent: req.body.cssContent,
      pageSize: req.body.pageSize,
      orientation: req.body.orientation,
      marginTop: req.body.marginTop,
      marginRight: req.body.marginRight,
      marginBottom: req.body.marginBottom,
      marginLeft: req.body.marginLeft,
      headerHeight: req.body.headerHeight,
      footerHeight: req.body.footerHeight
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const archiveLetterheadTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const existing = await LetterheadTemplate.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Letterhead not found' } });
    const updated = await LetterheadTemplate.setActive(id, false);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const restoreLetterheadTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const existing = await LetterheadTemplate.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Letterhead not found' } });
    const updated = await LetterheadTemplate.setActive(id, true);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

