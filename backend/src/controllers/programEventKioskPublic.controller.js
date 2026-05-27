/**
 * Program-event kiosk (public) controller.
 *
 * Hosts the non–Skill Builders kiosk experience: roster + per-client
 * approved-pickup list + checkout-with-signature/photo flow. Uses the
 * same JWT issued by `unlockSkillBuildersEventKiosk` (kind=program_event)
 * so the PIN entry surface is shared and the staff doesn't need to
 * remember a different URL per event type.
 *
 * Why a separate controller from skillBuildersEventKioskPublic?
 * The Skill Builders endpoints are wired to skill-builders-specific
 * tables (`skills_groups`, `skill_builders_event_sessions`, etc.) that
 * do not exist for generic program events. Those events draw their
 * roster from `company_event_clients` and their session schedule from
 * `company_event_session_dates`. Trying to overload the same endpoints
 * with branching SQL for two completely different data shapes was
 * making the Skill Builders surface harder to read; keeping the program
 * variant in its own file lets each kiosk surface stay simple.
 */
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import KioskModel from '../models/Kiosk.model.js';
import {
  verifyKioskBearerForProgramEvent,
  assertKioskTokenMatchesSlugAndEvent
} from './skillBuildersEventKioskPublic.controller.js';

const parsePositiveInt = (raw) => {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function safeJsonParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function parseColorPalette(raw) {
  return safeJsonParse(raw, null);
}

function normalizeStaffKioskPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{4}$/.test(p) ? p : null;
}

function kioskIp(req) {
  return String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null;
}

async function loadProgramEventStaff(eventId) {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name
       FROM (
         SELECT cepa.provider_user_id AS uid
         FROM company_event_provider_assignments cepa
         WHERE cepa.company_event_id = ?
         UNION
         SELECT cesp.provider_user_id AS uid
         FROM company_event_session_providers cesp
         WHERE cesp.company_event_id = ?
       ) roster
       INNER JOIN users u ON u.id = roster.uid
       WHERE u.status = 'active'
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [eventId, eventId]
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function assertProgramEventStaff(eventId, userId) {
  const staff = await loadProgramEventStaff(eventId);
  return staff.some((s) => Number(s.id) === Number(userId));
}

async function loadEventDayCheckins(eventId, today) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, client_id, user_id, person_type, action, checked_in_at, checked_out_at
       FROM event_day_kiosk_checkins
       WHERE company_event_id = ? AND kiosk_date = ?`,
      [eventId, today]
    );
    return rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

function mapCheckinRows(rows) {
  return (rows || []).map((c) => ({
    id: Number(c.id),
    clientId: c.client_id ? Number(c.client_id) : null,
    userId: c.user_id ? Number(c.user_id) : null,
    personType: c.person_type,
    action: c.action,
    checkedInAt: c.checked_in_at,
    checkedOutAt: c.checked_out_at
  }));
}

/**
 * GET /api/public/program-event/agency/:slug/kiosk/events/:eventId/context
 *
 * Returns everything the program-event kiosk needs to render the
 * roster + checkout sheet for a single client tap:
 *   - event branding (agency + organization)
 *   - today's enrolled clients (from company_event_clients)
 *   - per-client approved-pickup list (from guardian_client_waiver_profiles)
 *   - per-client emergency contacts
 *   - per-client walk-home authorization (from the new waiver section)
 *   - existing release log entries for today (so already-released
 *     clients don't show up as still on-site)
 */
export const getProgramEventKioskContext = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });
    const { agencyId, eventId } = m;

    // Event + branding
    const [evRows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.starts_at, ce.ends_at, ce.event_type,
              ce.organization_id,
              a.name AS agency_name, a.logo_url AS agency_logo, a.color_palette AS agency_colors,
              org.name AS org_name, org.logo_url AS org_logo, org.color_palette AS org_colors
       FROM company_events ce
       JOIN agencies a ON a.id = ce.agency_id
       LEFT JOIN agencies org ON org.id = ce.organization_id
       WHERE ce.id = ? AND ce.agency_id = ? LIMIT 1`,
      [eventId, agencyId]
    );
    const ev = evRows?.[0];
    if (!ev) return res.status(404).json({ error: { message: 'Event not found' } });

    // Roster: pull every active enrollment + the linked guardian's waiver
    // profile so we can surface authorized pickups + walk-home auth at
    // checkout time. We dedupe by client_id (a client may have multiple
    // active guardian links; the kiosk shows the union of pickups).
    let clientRows = [];
    try {
      const [rows] = await pool.execute(
        `SELECT cec.client_id,
                c.full_name, c.initials, c.identifier_code,
                cg.guardian_user_id,
                CONCAT(gu.first_name, ' ', gu.last_name) AS guardian_name,
                gu.email AS guardian_email,
                gu.phone_number AS guardian_phone,
                gwp.sections_json,
                gwp.updated_at AS waiver_updated_at
         FROM company_event_clients cec
         INNER JOIN clients c ON c.id = cec.client_id
         LEFT JOIN client_guardians cg ON cg.client_id = c.id AND (cg.access_enabled = 1 OR cg.access_enabled IS NULL)
         LEFT JOIN users gu ON gu.id = cg.guardian_user_id
         LEFT JOIN guardian_client_waiver_profiles gwp
                ON gwp.client_id = c.id AND gwp.guardian_user_id = cg.guardian_user_id
         WHERE cec.company_event_id = ?
         ORDER BY c.full_name ASC, c.id ASC, cg.id ASC`,
        [eventId]
      );
      clientRows = rows || [];
    } catch (err) {
      // company_event_clients may not exist on older databases; surface
      // a friendly "run the migration" message rather than 500ing.
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({
          error: { message: 'Program event tables not migrated. Run migrations 739/740/741.' }
        });
      }
      throw err;
    }

    const clientMap = new Map();
    for (const r of clientRows) {
      const cid = Number(r.client_id);
      if (!cid) continue;
      let entry = clientMap.get(cid);
      if (!entry) {
        entry = {
          id: cid,
          fullName: r.full_name || r.initials || `Client ${cid}`,
          initials: r.initials || '',
          identifierCode: r.identifier_code || '',
          guardians: [],
          authorizedPickups: [],
          emergencyContacts: [],
          walkHome: null,
          waiverUpdatedAt: null
        };
        clientMap.set(cid, entry);
      }
      if (r.guardian_user_id) {
        entry.guardians.push({
          userId: Number(r.guardian_user_id),
          name: r.guardian_name ? String(r.guardian_name).trim() : null,
          email: r.guardian_email || null,
          phone: r.guardian_phone || null
        });
      }
      const sections = safeJsonParse(r.sections_json, {}) || {};
      const pickups = sections.pickup_authorization?.payload?.authorizedPickups || [];
      for (const p of pickups) {
        const name = String(p?.name || '').trim();
        if (!name) continue;
        // Dedupe by name+phone so multiple guardians listing the same
        // grandparent don't render the row twice.
        const dedupeKey = `${name}|${String(p?.phone || '').trim()}`.toLowerCase();
        if (entry.authorizedPickups.some((x) => x._k === dedupeKey)) continue;
        entry.authorizedPickups.push({
          _k: dedupeKey,
          name,
          relationship: String(p?.relationship || '').trim() || null,
          phone: String(p?.phone || '').trim() || null,
          governmentIdRequired: !!p?.governmentIdRequired
        });
      }
      const emergency = sections.emergency_contacts?.payload?.contacts || [];
      for (const e of emergency) {
        const name = String(e?.name || '').trim();
        if (!name) continue;
        const dedupeKey = `${name}|${String(e?.phone || '').trim()}`.toLowerCase();
        if (entry.emergencyContacts.some((x) => x._k === dedupeKey)) continue;
        entry.emergencyContacts.push({
          _k: dedupeKey,
          name,
          relationship: String(e?.relationship || '').trim() || null,
          phone: String(e?.phone || '').trim() || null
        });
      }
      const walkHome = sections.walk_home_authorization?.payload || null;
      if (walkHome && entry.walkHome === null) {
        entry.walkHome = {
          allowedToWalkHome: walkHome.allowedToWalkHome === true,
          allowedWindow: String(walkHome.allowedWindow || '').trim() || null,
          route: String(walkHome.route || '').trim() || null,
          conditions: String(walkHome.conditions || '').trim() || null
        };
      }
      if (r.waiver_updated_at && (!entry.waiverUpdatedAt || new Date(r.waiver_updated_at) > new Date(entry.waiverUpdatedAt))) {
        entry.waiverUpdatedAt = r.waiver_updated_at;
      }
    }

    // Strip dedupe keys before returning.
    for (const c of clientMap.values()) {
      c.authorizedPickups = c.authorizedPickups.map(({ _k, ...rest }) => rest);
      c.emergencyContacts = c.emergencyContacts.map(({ _k, ...rest }) => rest);
    }

    const today = new Date().toISOString().slice(0, 10);

    const staffRows = await loadProgramEventStaff(eventId);
    const checkinRows = await loadEventDayCheckins(eventId, today);

    // Today's release log (so the kiosk can dim already-released kids).
    let releases = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id, client_id, released_to_name, released_to_relationship,
                walk_home_alone, signed_at
         FROM company_event_releases
         WHERE company_event_id = ? AND DATE(signed_at) = ?
         ORDER BY signed_at DESC, id DESC
         LIMIT 500`,
        [eventId, today]
      );
      releases = rows || [];
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        // Migration 741 not applied yet — not a hard block, just no releases yet.
        releases = [];
      } else {
        throw err;
      }
    }

    res.json({
      ok: true,
      event: {
        id: Number(ev.id),
        title: ev.title || 'Program event',
        startsAt: ev.starts_at,
        endsAt: ev.ends_at,
        eventType: ev.event_type || null
      },
      branding: {
        agencyName: ev.agency_name || '',
        agencyLogo: ev.agency_logo || null,
        agencyColors: parseColorPalette(ev.agency_colors),
        orgName: ev.org_name || null,
        orgLogo: ev.org_logo || null,
        orgColors: parseColorPalette(ev.org_colors)
      },
      clients: Array.from(clientMap.values()),
      staff: staffRows.map((s) => ({
        id: Number(s.id),
        firstName: s.first_name || '',
        lastName: s.last_name || '',
        displayName: `${s.first_name || ''} ${s.last_name || ''}`.trim()
      })),
      checkins: mapCheckinRows(checkinRows),
      releases: releases.map((r) => ({
        id: Number(r.id),
        clientId: Number(r.client_id),
        releasedToName: r.released_to_name,
        releasedToRelationship: r.released_to_relationship,
        walkHomeAlone: !!r.walk_home_alone,
        signedAt: r.signed_at
      })),
      kioskDate: today
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/public/program-event/agency/:slug/kiosk/events/:eventId/checkout
 *
 * Logs a release event for one client. The body carries:
 *   - clientId: required
 *   - releasedToName: required (or "Walk home alone")
 *   - releasedToRelationship: optional
 *   - releasedToPhone: optional
 *   - walkHomeAlone: boolean
 *   - signerSignatureData: required data URL (real e-signature)
 *   - signerSourceMethod: 'fresh_kiosk_signature' | 'reused_pickup_signature'
 *   - photoBase64: optional release photo (data URL or base64-only)
 *   - photoContentType: e.g. 'image/jpeg'
 *   - notes: optional
 *
 * Signature audit fields (signed_at server-stamped, signed_ip, signed_user_agent)
 * are recorded automatically. The optional photo is encrypted at rest in
 * GCS using the same KMS-wrapped AES-256-GCM scheme as insurance card
 * images, so only the storage key + wrapping metadata land in MySQL.
 */
export const submitProgramEventCheckout = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });
    const { agencyId, eventId } = m;

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    // Require an actual signature artifact. We keep this strict so a
    // glitchy kiosk app can't accidentally submit blank releases.
    const signature = String(req.body?.signerSignatureData || '').trim();
    if (signature.length < 50) {
      return res.status(400).json({ error: { message: 'Signature is required to record this release' } });
    }

    const walkHomeAlone = req.body?.walkHomeAlone === true;
    const releasedToName = walkHomeAlone
      ? 'Walk home alone'
      : String(req.body?.releasedToName || '').trim();
    if (!releasedToName) {
      return res.status(400).json({ error: { message: 'Tap the row of the person picking up, or confirm walk-home authorization.' } });
    }
    const releasedToRelationship = String(req.body?.releasedToRelationship || '').trim() || null;
    const releasedToPhone = String(req.body?.releasedToPhone || '').trim() || null;
    const sourceMethod = String(req.body?.signerSourceMethod || 'fresh_kiosk_signature');
    const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;

    // Confirm the client is actually enrolled in this event before
    // logging a release for them — prevents a malicious kiosk request
    // from inserting release rows for unrelated kids.
    const [enrollRows] = await pool.execute(
      `SELECT 1 FROM company_event_clients WHERE company_event_id = ? AND client_id = ? LIMIT 1`,
      [eventId, clientId]
    ).catch(() => [[]]);
    if (!enrollRows?.length) {
      return res.status(403).json({ error: { message: 'Client is not enrolled in this event' } });
    }

    // Optional release photo: encrypt, upload to GCS, stash wrapping
    // metadata so we can decrypt later from the admin client profile.
    let photoFields = {
      photo_storage_key: null,
      photo_content_type: null,
      photo_encryption_key_id: null,
      photo_encryption_wrapped_key_b64: null,
      photo_encryption_iv_b64: null,
      photo_encryption_auth_tag_b64: null,
      photo_encryption_aad: null
    };
    const photoRaw = String(req.body?.photoBase64 || '').trim();
    if (photoRaw) {
      try {
        // Accept either a data URL or raw base64.
        const dataUrlMatch = photoRaw.match(/^data:([^;]+);base64,(.+)$/);
        const contentType = dataUrlMatch?.[1] || String(req.body?.photoContentType || 'image/jpeg');
        const base64 = dataUrlMatch?.[2] || photoRaw;
        const photoBuffer = Buffer.from(base64, 'base64');
        if (photoBuffer.length > 5 * 1024 * 1024) {
          return res.status(413).json({ error: { message: 'Release photo is too large (max 5 MB).' } });
        }
        const aad = `program-event-release/${agencyId}/${eventId}/${clientId}`;
        let enc;
        try {
          enc = await DocumentEncryptionService.encryptBuffer(photoBuffer, { aad });
        } catch (encErr) {
          // KMS not configured? Skip the photo gracefully so the release
          // still records — the signature alone is the legal artifact.
          console.warn('[program-event-kiosk] release photo encryption failed; skipping photo', encErr?.message);
          enc = null;
        }
        if (enc) {
          const ext = contentType === 'image/png' ? 'png'
            : contentType === 'image/webp' ? 'webp'
            : 'jpg';
          const key = `program-event-releases/${agencyId}/${eventId}/${clientId}/${Date.now()}.${ext}`;
          const bucket = await StorageService.getGCSBucket();
          await bucket.file(key).save(enc.encryptedBuffer, {
            contentType,
            metadata: {
              metadata: {
                isEncrypted: '1',
                encryptionKeyId: enc.encryptionKeyId,
                encryptionWrappedKey: enc.encryptionWrappedKeyB64,
                encryptionIv: enc.encryptionIvB64,
                encryptionAuthTag: enc.encryptionAuthTagB64,
                encryptionAad: aad,
                agencyId: String(agencyId),
                eventId: String(eventId),
                clientId: String(clientId)
              }
            }
          });
          photoFields = {
            photo_storage_key: key,
            photo_content_type: contentType,
            photo_encryption_key_id: enc.encryptionKeyId,
            photo_encryption_wrapped_key_b64: enc.encryptionWrappedKeyB64,
            photo_encryption_iv_b64: enc.encryptionIvB64,
            photo_encryption_auth_tag_b64: enc.encryptionAuthTagB64,
            photo_encryption_aad: aad
          };
        }
      } catch (photoErr) {
        // Photo upload is optional — log and continue rather than block
        // the release record itself.
        console.warn('[program-event-kiosk] release photo upload failed; recording release without photo', photoErr?.message);
      }
    }

    // Server-stamp the audit trio.
    const ip = String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const ua = String(req.get?.('user-agent') || req.headers?.['user-agent'] || '').slice(0, 500) || null;

    let insertedId = null;
    try {
      const [result] = await pool.execute(
        `INSERT INTO company_event_releases
           (company_event_id, agency_id, client_id,
            released_to_name, released_to_relationship, released_to_phone, walk_home_alone,
            signer_signature_data, signer_signature_source_method,
            signed_at, signed_ip, signed_user_agent,
            photo_storage_key, photo_content_type,
            photo_encryption_key_id, photo_encryption_wrapped_key_b64,
            photo_encryption_iv_b64, photo_encryption_auth_tag_b64, photo_encryption_aad,
            notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId, agencyId, clientId,
          releasedToName, releasedToRelationship, releasedToPhone, walkHomeAlone ? 1 : 0,
          signature, sourceMethod,
          ip, ua,
          photoFields.photo_storage_key, photoFields.photo_content_type,
          photoFields.photo_encryption_key_id, photoFields.photo_encryption_wrapped_key_b64,
          photoFields.photo_encryption_iv_b64, photoFields.photo_encryption_auth_tag_b64, photoFields.photo_encryption_aad,
          notes
        ]
      );
      insertedId = Number(result?.insertId || 0) || null;
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Release log table not migrated. Run migration 741.' } });
      }
      throw err;
    }

    res.status(201).json({
      ok: true,
      releaseId: insertedId,
      clientId,
      releasedToName,
      releasedToRelationship,
      walkHomeAlone,
      photoCaptured: !!photoFields.photo_storage_key,
      signedAt: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/checkin/client — mark a client checked in for today */
export const programEventClientCheckin = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const clientId = parsePositiveInt(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const today = new Date().toISOString().slice(0, 10);

    const [enrollRows] = await pool.execute(
      `SELECT 1 FROM company_event_clients WHERE company_event_id = ? AND client_id = ? LIMIT 1`,
      [m.eventId, clientId]
    ).catch(() => [[]]);
    if (!enrollRows?.length) {
      return res.status(403).json({ error: { message: 'Client is not enrolled in this event' } });
    }

    try {
      await pool.execute(
        `INSERT INTO event_day_kiosk_checkins
           (company_event_id, agency_id, client_id, person_type, action, checked_in_at, kiosk_date, ip_address)
         VALUES (?, ?, ?, 'client', 'check_in', NOW(), ?, ?)`,
        [m.eventId, m.agencyId, clientId, today, kioskIp(req)]
      );
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
      }
      throw err;
    }

    res.status(201).json({ ok: true, clientId, checkedInAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
};

/** POST …/checkin/employee — check in staff by userId (tap name) */
export const programEventEmployeeCheckin = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    if (!(await assertProgramEventStaff(m.eventId, userId))) {
      return res.status(403).json({ error: { message: 'Employee is not assigned to this event' } });
    }

    const today = new Date().toISOString().slice(0, 10);
    try {
      await pool.execute(
        `INSERT INTO event_day_kiosk_checkins
           (company_event_id, agency_id, user_id, person_type, action, checked_in_at, kiosk_date, ip_address)
         VALUES (?, ?, ?, 'employee', 'check_in', NOW(), ?, ?)`,
        [m.eventId, m.agencyId, userId, today, kioskIp(req)]
      );
    } catch (err) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Run migration 615 for event-day check-ins' } });
      }
      throw err;
    }

    res.status(201).json({ ok: true, userId, checkedInAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
};

/** POST …/checkin/employee-pin — identify employee by 4-digit kiosk PIN */
export const programEventEmployeeCheckinByPin = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const pin = normalizeStaffKioskPin(req.body?.pin);
    if (!pin) return res.status(400).json({ error: { message: 'Enter your 4-digit personal kiosk PIN' } });
    const pinHash = KioskModel.hashPin(pin);

    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name
       FROM users u
       JOIN user_preferences up ON up.user_id = u.id AND up.kiosk_pin_hash = ?
       JOIN (
         SELECT cepa.provider_user_id AS uid
         FROM company_event_provider_assignments cepa
         WHERE cepa.company_event_id = ?
         UNION
         SELECT cesp.provider_user_id AS uid
         FROM company_event_session_providers cesp
         WHERE cesp.company_event_id = ?
       ) roster ON roster.uid = u.id
       WHERE u.status = 'active'`,
      [pinHash, m.eventId, m.eventId]
    ).catch(() => [[]]);

    if (!rows?.length) {
      return res.status(404).json({ error: { message: 'No employee on this event roster matches that PIN' } });
    }
    if (rows.length > 1) {
      return res.status(400).json({ error: { message: 'Multiple employees share this PIN. Tap your name instead.' } });
    }

    const user = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    await pool.execute(
      `INSERT INTO event_day_kiosk_checkins
         (company_event_id, agency_id, user_id, person_type, action, checked_in_at, kiosk_date, ip_address)
       VALUES (?, ?, ?, 'employee', 'check_in', NOW(), ?, ?)`,
      [m.eventId, m.agencyId, user.id, today, kioskIp(req)]
    ).catch(() => null);

    res.status(201).json({
      ok: true,
      userId: Number(user.id),
      displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      checkedInAt: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
};

/** POST …/checkout/employee — mark employee checked out */
export const programEventEmployeeCheckout = async (req, res, next) => {
  try {
    const ctx = verifyKioskBearerForProgramEvent(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });
    const m = await assertKioskTokenMatchesSlugAndEvent(ctx, req.params.slug, req.params.eventId);
    if (m.error) return res.status(m.error.status).json({ error: { message: m.error.message } });

    const userId = parsePositiveInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    const today = new Date().toISOString().slice(0, 10);

    await pool.execute(
      `UPDATE event_day_kiosk_checkins
       SET action = 'check_out', checked_out_at = NOW(), updated_at = NOW()
       WHERE company_event_id = ? AND user_id = ? AND kiosk_date = ? AND person_type = 'employee'`,
      [m.eventId, userId, today]
    ).catch(() => null);

    res.json({ ok: true, userId, checkedOutAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
};
