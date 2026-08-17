import AgencyOfficeIntakeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import AgencyChannelIntakeMaster from '../models/AgencyChannelIntakeMaster.model.js';
import OfficePacketTemplate from '../models/OfficePacketTemplate.model.js';
import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';
import multer from 'multer';
import path from 'path';
import StorageService from '../services/storage.service.js';
import {
  generateOfficePrintablePacketPdf,
  getOfficePacketTemplateForAgency,
  saveOfficePacketTemplateForAgency
} from '../services/officePrintablePacket.service.js';
import {
  isItscoPacketChromeAgency,
  packetBrandAssetColumn
} from '../services/packetBrandChrome.service.js';
import { OFFICE_PRINTABLE_PACKET_VERSION } from '../constants/officePrintablePacket.js';

export const packetBrandUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(String(file?.mimetype || ''));
    cb(ok ? null : new Error('Upload a PNG, JPEG, WebP, or GIF image'), ok);
  }
});

function roleCanEdit(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(r);
}

async function assertAgencyAccess(req, agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    const e = new Error('Invalid agencyId');
    e.status = 400;
    throw e;
  }
  if (!roleCanEdit(req.user?.role)) {
    const e = new Error('Access denied');
    e.status = 403;
    throw e;
  }
  const agency = await Agency.findById(aid);
  if (!agency) {
    const e = new Error('Agency not found');
    e.status = 404;
    throw e;
  }
  return { aid, agency };
}

export const getAgencyOfficeIntakeMaster = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const lang = String(req.query?.locale || req.query?.lang || 'en').trim();
    const master = await AgencyOfficeIntakeMaster.getOrCreateForAgency(aid, {
      languageCode: lang,
      actorUserId: req.user?.id || null
    });
    res.json({ master });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putAgencyOfficeIntakeMaster = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const lang = String(req.body?.locale || req.body?.languageCode || req.query?.locale || 'en').trim();
    const master = await AgencyOfficeIntakeMaster.upsertContent({
      agencyId: aid,
      languageCode: lang,
      title: req.body?.title ?? null,
      intakeSteps: req.body?.intakeSteps ?? req.body?.intake_steps ?? null,
      intakeFields: req.body?.intakeFields ?? req.body?.intake_fields ?? null,
      actorUserId: req.user?.id || null,
      bumpVersion: true
    });
    res.json({ master });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getAgencyOfficePacketTemplate = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const locale = String(req.query?.locale || req.query?.lang || 'en').trim();
    const variant = String(req.query?.variant || req.body?.variant || 'self').trim();
    const template = await getOfficePacketTemplateForAgency(aid, { locale, variant });
    res.json(template);
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const putAgencyOfficePacketTemplate = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const htmlContent = req.body?.html_content ?? req.body?.htmlContent;
    if (htmlContent === undefined || htmlContent === null) {
      return res.status(400).json({ error: { message: 'html_content is required' } });
    }
    const locale = String(req.body?.locale || req.query?.locale || req.query?.lang || 'en').trim();
    const variant = String(req.body?.variant || req.query?.variant || 'self').trim();
    const saved = await saveOfficePacketTemplateForAgency({
      agencyId: aid,
      htmlContent,
      actorUserId: req.user?.id || null,
      locale,
      variant
    });
    res.json(saved);
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const downloadAgencyOfficePacketTemplatePdf = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid, agency } = await assertAgencyAccess(req, agencyId);
    const locale = String(req.query?.locale || 'en').trim();
    const variant = String(req.query?.variant || 'self').trim();
    const pdfBytes = await generateOfficePrintablePacketPdf({ agencyId: aid, locale, variant });
    const slug = String(agency.portal_url || agency.slug || 'agency').replace(/[^a-z0-9-]+/gi, '-');
    const pack = /parent|guardian|dependent|child/i.test(variant) ? 'parent-guardian' : 'client';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${slug}-${pack}-intake-packet-${locale}.pdf"`
    );
    return res.send(Buffer.from(pdfBytes));
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const listAgencyOfficePacketTemplateVersions = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const locale = String(req.query?.locale || 'en').trim();
    const variant = String(req.query?.variant || 'self').trim();
    const versions = await OfficePacketTemplate.listVersions(aid, locale, variant);
    const current = await OfficePacketTemplate.findByAgencyId(aid, locale, variant);
    res.json({
      agencyId: aid,
      locale,
      variant,
      currentVersion: current?.version ?? null,
      versions
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getAgencyOfficePacketTemplateVersion = async (req, res, next) => {
  try {
    const { agencyId, version } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const locale = String(req.query?.locale || 'en').trim();
    const variant = String(req.query?.variant || 'self').trim();
    const row = await OfficePacketTemplate.getVersion(aid, locale, version, variant);
    if (!row) return res.status(404).json({ error: { message: 'Version not found' } });
    res.json({ version: row });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getAgencyPacketBrand = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid, agency } = await assertAgencyAccess(req, agencyId);
    res.json({
      agencyId: aid,
      useItscoChrome: isItscoPacketChromeAgency(agency),
      coverPath: agency.packet_cover_path || null,
      logoPath: agency.packet_logo_path || null,
      footerLogoPath: agency.packet_footer_logo_path || null,
      headerImagePath: agency.packet_header_image_path || null,
      versionLabel: agency.packet_version_label || OFFICE_PRINTABLE_PACKET_VERSION
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putAgencyPacketBrandVersion = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid, agency } = await assertAgencyAccess(req, agencyId);
    if (isItscoPacketChromeAgency(agency)) {
      return res.status(400).json({
        error: { message: 'ITSCO packet chrome is managed by platform brand assets.' }
      });
    }
    const label = String(req.body?.versionLabel || req.body?.packet_version_label || '').trim().slice(0, 32);
    if (!label) {
      return res.status(400).json({ error: { message: 'versionLabel is required' } });
    }
    await pool.execute(`UPDATE agencies SET packet_version_label = ? WHERE id = ?`, [label, aid]);
    res.json({ agencyId: aid, versionLabel: label });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const uploadAgencyPacketBrandAsset = async (req, res, next) => {
  try {
    const { agencyId, slot } = req.params;
    const { aid, agency } = await assertAgencyAccess(req, agencyId);
    if (isItscoPacketChromeAgency(agency)) {
      return res.status(400).json({
        error: { message: 'ITSCO packet chrome is managed by platform brand assets.' }
      });
    }
    const column = packetBrandAssetColumn(slot);
    if (!column) {
      return res.status(400).json({ error: { message: 'Invalid slot. Use cover, logo, footer, or header.' } });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: { message: 'Choose an image to upload.' } });
    }
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(req.file.originalname || '') || '.png';
    const filename = `packet-${slot}-${aid}-${uniqueSuffix}${ext}`;
    const storageResult = await StorageService.saveLogo(req.file.buffer, filename, req.file.mimetype);
    const filePath = storageResult.relativePath || storageResult.path;
    await pool.execute(`UPDATE agencies SET ${column} = ? WHERE id = ?`, [filePath, aid]);
    const publicRel = String(filePath || '').startsWith('uploads/')
      ? String(filePath).substring('uploads/'.length)
      : String(filePath || '');
    res.json({
      success: true,
      slot: String(slot).toLowerCase(),
      path: filePath,
      url: `/uploads/${publicRel}`
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listAgencyChannelIntakeMasters = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const masters = await AgencyChannelIntakeMaster.listForAgency(aid);
    res.json({ masters });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getAgencyChannelIntakeMaster = async (req, res, next) => {
  try {
    const { agencyId, channel } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const lang = String(req.query?.locale || req.query?.lang || 'en').trim();
    const master = await AgencyChannelIntakeMaster.getOrCreateForAgency(aid, {
      channel,
      languageCode: lang,
      actorUserId: req.user?.id || null
    });
    res.json({ master });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putAgencyChannelIntakeMaster = async (req, res, next) => {
  try {
    const { agencyId, channel } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const lang = String(req.body?.locale || req.body?.languageCode || req.query?.locale || 'en').trim();
    const master = await AgencyChannelIntakeMaster.upsertContent({
      agencyId: aid,
      channel,
      languageCode: lang,
      title: req.body?.title ?? null,
      intakeSteps: req.body?.intakeSteps ?? req.body?.intake_steps ?? null,
      intakeFields: req.body?.intakeFields ?? req.body?.intake_fields ?? null,
      status: req.body?.status ?? null,
      actorUserId: req.user?.id || null,
      bumpVersion: true
    });
    res.json({ master });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
