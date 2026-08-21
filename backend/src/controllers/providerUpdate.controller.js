import {
  assertAgencyAdmin,
  createPush,
  updatePush,
  getPush,
  listPushes,
  sendPush,
  listRecipients,
  getRecipientByToken,
  getRecipientBundle,
  recordViewEvent,
  recordHeartbeat,
  updateSectionProgress,
  finalizeRecipient,
  exportPushCsv,
  submitPushForPayroll,
  getMyOpenRecipient,
  listSectionCatalog,
  buildProviderUpdatePublicUrl,
  listOpenForBookingForProvider,
  getLatestAdminUpdateBundle,
  getAdminUpdateBundle,
  listAdminUpdatesForAttach,
  listEligibleProviders,
  listFallActionClientsForProvider
} from '../services/providerUpdate.service.js';
import Agency from '../models/Agency.model.js';
import * as AdminUpdateService from '../services/adminUpdate.service.js';

export const getCatalog = async (_req, res) => {
  res.json({ sections: await listSectionCatalog() });
};

export const listPushesHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const pushes = await listPushes(agencyId);
    res.json({ pushes });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const createPushHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const push = await createPush({
      agencyId,
      title: req.body.title,
      sectionConfig: req.body.sectionConfig || req.body.section_config_json,
      notes: req.body.notes,
      createdByUserId: req.user.id,
      attachedAdminUpdateId: req.body.attachedAdminUpdateId ?? req.body.attached_admin_update_id ?? null,
      sectionAudience: req.body.sectionAudience || req.body.section_audience_json || null,
      amendmentPlan: req.body.amendmentPlan || req.body.amendment_plan_json || null
    });
    res.status(201).json(push);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPushHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId || req.body.agencyId);
    const push = await getPush(req.params.pushId);
    if (!push || Number(push.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Push not found' } });
    }
    const agency = await Agency.findById(agencyId);
    const recipients = (await listRecipients(push.id, agencyId)).map((r) => ({
      ...r,
      publicUrl: buildProviderUpdatePublicUrl(r.token, agency?.portal_url || agency?.slug || '')
    }));
    res.json({ push, recipients });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updatePushHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const push = await updatePush({
      pushId: req.params.pushId,
      agencyId,
      title: req.body.title,
      sectionConfig: req.body.sectionConfig || req.body.section_config_json,
      notes: req.body.notes,
      status: req.body.status,
      attachedAdminUpdateId:
        req.body.attachedAdminUpdateId !== undefined
          ? req.body.attachedAdminUpdateId
          : req.body.attached_admin_update_id,
      sectionAudience:
        req.body.sectionAudience !== undefined
          ? req.body.sectionAudience
          : req.body.section_audience_json,
      amendmentPlan:
        req.body.amendmentPlan !== undefined
          ? req.body.amendmentPlan
          : req.body.amendment_plan_json
    });
    res.json(push);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const sendPushHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const agency = await Agency.findById(agencyId);
    const result = await sendPush({
      pushId: req.params.pushId,
      agencyId,
      sentByUserId: req.user.id,
      providerUserIds: req.body.providerUserIds || null,
      orgSlug: req.body.orgSlug || agency?.portal_url || agency?.slug || ''
    });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    next(e);
  }
};

export const exportPushHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const csv = await exportPushCsv(req.params.pushId, agencyId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="provider-update-${req.params.pushId}.csv"`);
    res.send(csv);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const submitPayrollHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const result = await submitPushForPayroll({
      pushId: req.params.pushId,
      agencyId,
      submittedByUserId: req.user.id
    });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPublicByToken = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    await recordViewEvent(recipient.id, 'token_click').catch(() => {});
    await recordViewEvent(recipient.id, 'dashboard_view').catch(() => {});
    const bundle = await getRecipientBundle(recipient);
    res.json({
      ...bundle,
      publicUrl: buildProviderUpdatePublicUrl(recipient.token)
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const heartbeatPublic = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const result = await recordHeartbeat(recipient.id);
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updatePublicSection = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    await updateSectionProgress({
      recipientId: recipient.id,
      sectionKey: req.params.sectionKey,
      completed: !!req.body.completed,
      mode: req.body.mode || null,
      data: req.body.data ?? null,
      status: req.body.status || null
    });
    const bundle = await getRecipientBundle(recipient);
    res.json(bundle);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    next(e);
  }
};

export const finalizePublic = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    await finalizeRecipient({
      recipientId: recipient.id,
      actorType: 'token_guest',
      actorUserId: recipient.provider_user_id
    });
    const refreshed = await getRecipientByToken(req.params.token).catch(() => null);
    if (!refreshed) {
      return res.json({ ok: true, finalized: true });
    }
    res.json(await getRecipientBundle(refreshed));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    next(e);
  }
};

export const getMyUpdate = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const recipient = await getMyOpenRecipient(req.user.id, agencyId);
    if (!recipient) return res.json({ recipient: null, sections: [], progress: { completed: 0, total: 0, percent: 0 } });
    await recordViewEvent(recipient.id, 'dashboard_view').catch(() => {});
    res.json(await getRecipientBundle(recipient));
  } catch (e) {
    next(e);
  }
};

export const heartbeatMyUpdate = async (req, res, next) => {
  try {
    const agencyId = Number(req.body.agencyId);
    const recipient = await getMyOpenRecipient(req.user.id, agencyId);
    if (!recipient) return res.json({ activeSeconds: 0 });
    res.json(await recordHeartbeat(recipient.id));
  } catch (e) {
    next(e);
  }
};

export const updateMySection = async (req, res, next) => {
  try {
    const agencyId = Number(req.body.agencyId);
    const recipient = await getMyOpenRecipient(req.user.id, agencyId);
    if (!recipient) return res.status(404).json({ error: { message: 'No open Provider Update' } });
    await updateSectionProgress({
      recipientId: recipient.id,
      sectionKey: req.params.sectionKey,
      completed: !!req.body.completed,
      mode: req.body.mode || null,
      data: req.body.data ?? null,
      status: req.body.status || null
    });
    res.json(await getRecipientBundle(recipient));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    next(e);
  }
};

export const finalizeMyUpdate = async (req, res, next) => {
  try {
    const agencyId = Number(req.body.agencyId);
    const recipient = await getMyOpenRecipient(req.user.id, agencyId);
    if (!recipient) return res.status(404).json({ error: { message: 'No open Provider Update' } });
    await finalizeRecipient({
      recipientId: recipient.id,
      actorType: 'provider',
      actorUserId: req.user.id
    });
    res.json({ ok: true, finalized: true });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    next(e);
  }
};

export const officeSchedulePublic = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const items = await listOpenForBookingForProvider(recipient.provider_user_id);
    res.json({ items, reason: 'ok' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const officeScheduleMine = async (req, res, next) => {
  try {
    const items = await listOpenForBookingForProvider(req.user.id);
    res.json({ items, reason: 'ok' });
  } catch (e) {
    next(e);
  }
};

export const latestAdminUpdatePublic = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const push = await getPush(recipient.push_id);
    const attachedId = push?.attached_admin_update_id || null;
    const bundle = await getAdminUpdateBundle(recipient.agency_id, attachedId, { allowDraft: false });
    if (!bundle) {
      return res.json({ available: false, message: 'No Admin Update has been attached or published yet.' });
    }
    res.json({ available: true, ...bundle });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const latestAdminUpdateMine = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const updateId = req.query.updateId ? Number(req.query.updateId) : null;
    let attachedId = updateId;
    if (!attachedId) {
      const recipient = await getMyOpenRecipient(req.user.id, agencyId);
      if (recipient) {
        const push = await getPush(recipient.push_id);
        attachedId = push?.attached_admin_update_id || null;
      }
    }
    const bundle = await getAdminUpdateBundle(agencyId, attachedId, {
      allowDraft: String(req.query.allowDraft || '') === '1'
    });
    if (!bundle) {
      return res.json({ available: false, message: 'No Admin Update has been published yet.' });
    }
    res.json({ available: true, ...bundle });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const latestAdminUpdateAdmin = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const updateId = req.query.updateId ? Number(req.query.updateId) : null;
    const bundle = await getAdminUpdateBundle(agencyId, updateId, { allowDraft: true });
    if (!bundle) {
      return res.json({
        available: false,
        message: 'No Admin Update draft or send found. Create one below or in Communications › Admin Update.'
      });
    }
    res.json({ available: true, ...bundle });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listAttachableAdminUpdates = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const updates = await listAdminUpdatesForAttach(agencyId);
    res.json({ updates });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const createAttachedAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const created = await AdminUpdateService.createUpdate({
      agencyId,
      createdByUserId: req.user.id,
      title: req.body.title || 'Admin Updates'
    });
    res.status(201).json(created);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const patchAttachedAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const updateId = Number(req.params.updateId);
    const updated = await AdminUpdateService.updateDraft(agencyId, updateId, req.body.patch || req.body);
    const bundle = await getAdminUpdateBundle(agencyId, updateId, { allowDraft: true });
    res.json({ update: updated, preview: bundle });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};


export const listEligibleProvidersHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const providers = await listEligibleProviders(agencyId, {
      includeDemoTesters: String(req.query.includeDemo ?? '1') !== '0'
    });
    res.json({ providers });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const fallActionsForRecipient = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const providerUserId = Number(req.params.providerUserId);
    const clients = await listFallActionClientsForProvider(providerUserId, agencyId);
    res.json({ clients, count: clients.length });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const fallActionsMine = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const clients = await listFallActionClientsForProvider(req.user.id, agencyId);
    res.json({ clients, count: clients.length });
  } catch (e) {
    next(e);
  }
};

export const fallActionsPublic = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const clients = await listFallActionClientsForProvider(recipient.provider_user_id, recipient.agency_id);
    res.json({ clients, count: clients.length });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
