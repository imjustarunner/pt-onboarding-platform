import AgencyOfficeIntakeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import AgencyChannelIntakeMaster from '../models/AgencyChannelIntakeMaster.model.js';
import OfficePacketTemplate from '../models/OfficePacketTemplate.model.js';
import Agency from '../models/Agency.model.js';
import {
  generateOfficePrintablePacketPdf,
  getOfficePacketTemplateForAgency,
  saveOfficePacketTemplateForAgency
} from '../services/officePrintablePacket.service.js';

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
    const template = await getOfficePacketTemplateForAgency(aid, { locale });
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
    const saved = await saveOfficePacketTemplateForAgency({
      agencyId: aid,
      htmlContent,
      actorUserId: req.user?.id || null,
      locale
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
    const pdfBytes = await generateOfficePrintablePacketPdf({ agencyId: aid, locale });
    const slug = String(agency.portal_url || agency.slug || 'agency').replace(/[^a-z0-9-]+/gi, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${slug}-in-depth-intake-packet.pdf"`
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
    const versions = await OfficePacketTemplate.listVersions(aid, locale);
    const current = await OfficePacketTemplate.findByAgencyId(aid, locale);
    res.json({
      agencyId: aid,
      locale,
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
    const row = await OfficePacketTemplate.getVersion(aid, locale, version);
    if (!row) return res.status(404).json({ error: { message: 'Version not found' } });
    res.json({ version: row });
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
