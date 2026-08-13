import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';
import SchoolPacketTemplate from '../models/SchoolPacketTemplate.model.js';
import ClientSignedSchoolPacket from '../models/ClientSignedSchoolPacket.model.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';

function roleCanEdit(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(r);
}

async function schoolStaffCanViewSignedPackets(req, clientId) {
  if (String(req.user?.role || '').toLowerCase() !== 'school_staff') return false;
  const client = await Client.findById(clientId);
  if (!client) return false;
  const state = await ClientSchoolStaffRoiAccess.resolveSchoolStaffClientAccessState({
    clientId,
    schoolOrganizationId: client.organization_id || client.school_organization_id,
    schoolStaffUserId: req.user.id
  });
  return String(state || '').toLowerCase() === 'roi_docs';
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

export const getAgencySchoolIntakeMaster = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const lang = String(req.query?.locale || req.query?.lang || 'en').trim();
    const master = await AgencySchoolIntakeMaster.getOrCreateForAgency(aid, {
      languageCode: lang,
      actorUserId: req.user?.id || null
    });
    res.json({ master });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const putAgencySchoolIntakeMaster = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const lang = String(req.body?.locale || req.body?.languageCode || req.query?.locale || 'en').trim();
    const master = await AgencySchoolIntakeMaster.upsertContent({
      agencyId: aid,
      languageCode: lang,
      title: req.body?.title ?? null,
      intakeSteps: req.body?.intakeSteps ?? req.body?.intake_steps ?? null,
      intakeFields: req.body?.intakeFields ?? req.body?.intake_fields ?? null,
      actorUserId: req.user?.id || null,
      bumpVersion: true
    });
    await AgencySchoolIntakeMaster.markAgencySchoolLinksInheriting(aid);
    res.json({ master });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listAgencySchoolPacketTemplateVersions = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const locale = String(req.query?.locale || 'en').trim();
    const versions = await SchoolPacketTemplate.listVersions(aid, locale);
    const current = await SchoolPacketTemplate.findByAgencyId(aid, locale);
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

export const getAgencySchoolPacketTemplateVersion = async (req, res, next) => {
  try {
    const { agencyId, version } = req.params;
    const { aid } = await assertAgencyAccess(req, agencyId);
    const locale = String(req.query?.locale || 'en').trim();
    const row = await SchoolPacketTemplate.getVersion(aid, locale, version);
    if (!row) return res.status(404).json({ error: { message: 'Version not found' } });
    res.json({ version: row });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listClientSignedSchoolPackets = async (req, res, next) => {
  try {
    const clientId = Number(req.params.clientId || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid clientId' } });
    if (!roleCanEdit(req.user?.role) && !(await schoolStaffCanViewSignedPackets(req, clientId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const packets = await ClientSignedSchoolPacket.listByClientId(clientId);
    res.json({ packets });
  } catch (e) {
    next(e);
  }
};

export const getClientSignedSchoolPacket = async (req, res, next) => {
  try {
    const id = Number(req.params.packetId || 0);
    if (!id) return res.status(400).json({ error: { message: 'Invalid packetId' } });
    const packet = await ClientSignedSchoolPacket.findById(id);
    if (!packet) return res.status(404).json({ error: { message: 'Signed packet not found' } });
    if (!roleCanEdit(req.user?.role) && !(await schoolStaffCanViewSignedPackets(req, packet.client_id))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    res.json({ packet });
  } catch (e) {
    next(e);
  }
};
