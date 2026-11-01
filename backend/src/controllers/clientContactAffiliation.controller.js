import Client from '../models/Client.model.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {
  applyContactReminderChoice,
  updateClientAffiliatedContact,
  upsertClientAffiliatedContact
} from '../services/clientContactAffiliation.service.js';
import {
  buildContactReminderPrefResultHtml
} from '../services/brandedNotificationEmail.service.js';
import { verifyContactReminderToken } from '../services/contactReminderToken.service.js';
import Agency from '../models/Agency.model.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { requestContactSmsInvitation } from '../services/contactReminderSmsConsent.service.js';

function parseId(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function assertCanManageClientContacts(req, clientId) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const role = String(req.user?.role || '').toLowerCase();
  const uid = Number(req.user?.id);
  if (['admin', 'super_admin', 'support', 'staff', 'scheduler', 'provider', 'provider_plus', 'clinical_practice_assistant'].includes(role)) {
    const { resolveClientRecordAccess } = await import('../services/clientRecordAccess.service.js');
    const access = await resolveClientRecordAccess({
      userId: uid,
      role,
      clientId,
      client
    });
    if (!access.ok) {
      const err = new Error(access.message || 'Access denied');
      err.status = access.status || 403;
      throw err;
    }
    return client;
  }
  // Guardian / client self
  if (role === 'client_guardian' || role === 'guardian') {
    const link = await ClientGuardian.getLink({ clientId, guardianUserId: uid });
    if (!link || !link.access_enabled || ClientGuardian.isNoView(link.permissions_json)) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
    return client;
  }
  if (role === 'client') {
    const selfLink = await ClientGuardian.getLink({ clientId, guardianUserId: uid });
    if (selfLink && String(selfLink.relationship_type || '').toLowerCase() === 'self') {
      return client;
    }
    // Some clients are linked via clients.user_id
    if (Number(client.user_id) === uid) return client;
  }
  const err = new Error('Access denied');
  err.status = 403;
  throw err;
}

export async function listClientAffiliatedContacts(req, res, next) {
  try {
    const clientId = parseId(req.params.id || req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    await assertCanManageClientContacts(req, clientId);
    const rows = await ClientContactAffiliation.listForClient(clientId);
    res.json({ items: rows.map((r) => ClientContactAffiliation.toApi(r)) });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function createClientAffiliatedContact(req, res, next) {
  try {
    const clientId = parseId(req.params.id || req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const client = await assertCanManageClientContacts(req, clientId);
    const out = await upsertClientAffiliatedContact({
      agencyId: client.agency_id || client.agencyId,
      clientId,
      userId: req.user.id,
      fullName: req.body?.fullName || req.body?.name,
      email: req.body?.email,
      phone: req.body?.phone,
      relationshipType: req.body?.relationshipType,
      emailRemindersEnabled: !!req.body?.emailRemindersEnabled,
      smsRemindersEnabled: !!req.body?.smsRemindersEnabled,
      acknowledgeNotify: !!req.body?.acknowledgeNotify,
      recipientPermissionToInvite: req.body?.recipientPermissionToInvite === true,
      existingContactId: req.body?.existingContactId || req.body?.agencyContactId || null
    });
    await logAuditEvent(req, { actionType: 'client_reminder_contact_added', agencyId: out.affiliation.agencyId, targetType: 'client_reminder_contact', targetId: out.affiliation.id, metadata: { clientId } });
    res.status(201).json(out);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function patchClientAffiliatedContact(req, res, next) {
  try {
    const clientId = parseId(req.params.id || req.params.clientId);
    const affiliationId = parseId(req.params.affiliationId);
    if (!clientId || !affiliationId) {
      return res.status(400).json({ error: { message: 'Invalid ids' } });
    }
    await assertCanManageClientContacts(req, clientId);
    const out = await updateClientAffiliatedContact({
      affiliationId,
      clientId,
      userId: req.user.id,
      patch: {
        relationshipType: req.body?.relationshipType,
        emailRemindersEnabled: req.body?.emailRemindersEnabled,
        smsRemindersEnabled: req.body?.smsRemindersEnabled,
        isActive: req.body?.isActive,
        recipientPermissionToInvite: req.body?.recipientPermissionToInvite === true,
        acknowledgeNotify: !!req.body?.acknowledgeNotify
      }
    });
    await logAuditEvent(req, { actionType: 'client_reminder_contact_updated', agencyId: out.affiliation.agencyId, targetType: 'client_reminder_contact', targetId: affiliationId, metadata: { clientId } });
    res.json(out);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function deleteClientAffiliatedContact(req, res, next) {
  try {
    const clientId = parseId(req.params.id || req.params.clientId);
    const affiliationId = parseId(req.params.affiliationId);
    if (!clientId || !affiliationId) {
      return res.status(400).json({ error: { message: 'Invalid ids' } });
    }
    await assertCanManageClientContacts(req, clientId);
    const row = await ClientContactAffiliation.findById(affiliationId);
    if (!row || Number(row.client_id) !== clientId) {
      return res.status(404).json({ error: { message: 'Affiliation not found' } });
    }
    const updated = await ClientContactAffiliation.softDeactivate(affiliationId);
    await logAuditEvent(req, { actionType: 'client_reminder_contact_removed', agencyId: row.agency_id, targetType: 'client_reminder_contact', targetId: affiliationId, metadata: { clientId } });
    res.json({ ok: true, affiliation: ClientContactAffiliation.toApi(updated) });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

/** GET /api/public/contact-reminders/:token — view or apply preference */
export async function getPublicContactReminderAction(req, res, next) {
  try {
    const verified = verifyContactReminderToken(req.params.token);
    const result = await applyContactReminderChoice({
      affiliationId: verified.affiliationId,
      action: verified.action
    });
    const agency = await Agency.findById(result.affiliation.agencyId).catch(() => null);
    const choice = result.choice;
    let message = 'Your current reminder preferences are shown in your email.';
    if (result.applied) {
      if (choice === 'off') message = 'Appointment reminders have been turned off for this client.';
      else if (choice === 'email_only') message = 'You will receive email appointment reminders only.';
      else if (choice === 'sms_only') message = 'Text reminders are requested. Reply START to the opt-in invitation before texts begin.';
      else if (choice === 'both') message = 'Email reminders are enabled. Text reminders require your START reply to the opt-in invitation.';
    }
    const html = buildContactReminderPrefResultHtml({
      agencyName: agency?.name,
      colorPalette: agency?.color_palette,
      message
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    if (e?.status) {
      const html = buildContactReminderPrefResultHtml({
        message: e.message || 'This link is invalid or expired.'
      });
      res.status(e.status).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
    next(e);
  }
}

export async function inviteClientAffiliatedContactSms(req, res, next) {
  try {
    const clientId = parseId(req.params.id || req.params.clientId);
    const affiliationId = parseId(req.params.affiliationId);
    if (!clientId || !affiliationId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    await assertCanManageClientContacts(req, clientId);
    const result = await requestContactSmsInvitation({ affiliationId, clientId, userId: req.user.id, recipientPermissionToInvite: req.body?.recipientPermissionToInvite === true });
    const row = await ClientContactAffiliation.findById(affiliationId);
    await logAuditEvent(req, { actionType: 'client_reminder_contact_sms_invitation', agencyId: row.agency_id, targetType: 'client_reminder_contact', targetId: affiliationId, metadata: { clientId, status: result.status } });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}
