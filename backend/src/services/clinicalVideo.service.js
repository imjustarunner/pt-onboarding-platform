import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import Video from './vonageVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
export function requireClinicalVideoMonitoring() {
  if (!process.env.VONAGE_VIDEO_CALLBACK_SECRET || !process.env.VONAGE_APPLICATION_ID)
    throw fail(503, 'Secure video connection monitoring must be configured before clinical sessions can open.');
}
export async function registerClinicalMedia(mediaId, context, db = pool) {
  requireClinicalVideoMonitoring();
  await db.execute(`INSERT INTO clinical_video_sessions (media_id,session_kind,session_id,generation,agency_id)
    VALUES (?,?,?,?,?)`, [mediaId, context.kind, context.sessionId, context.generation || 0, context.agencyId]);
  await clinicalAudit(context, 'clinical_encounter_opened', {}, db);
}
export async function clinicalMedia(mediaId, db = pool, lock = false) {
  const [rows] = await db.execute(`SELECT * FROM clinical_video_sessions WHERE media_id=?${lock ? ' FOR UPDATE' : ''}`, [mediaId]);
  return rows[0];
}
export async function requireActiveClinicalMedia(mediaId, db = pool) {
  const media = await clinicalMedia(mediaId, db, true);
  if (!media || media.state !== 'active') throw fail(409, 'This encounter is closing or has ended. End the visit before opening another.');
  return media;
}
export async function requireMonitoredProvider(mediaId, db = pool) {
  await requireActiveClinicalMedia(mediaId, db);
  const [rows] = await db.execute(`SELECT c.connection_id FROM clinical_video_connections c
    JOIN clinical_video_grants g ON g.id=c.grant_id WHERE c.media_id=? AND g.participant_role='provider'
    AND c.disconnected_at IS NULL AND c.disconnect_requested=FALSE AND g.revoked_at IS NULL LIMIT 1`, [mediaId]);
  if (!rows.length) throw fail(409, 'Waiting for secure confirmation of the provider video connection.');
}
export async function clinicalVideoToken(mediaId, { actor, role, visitId = null, req }, db = pool) {
  requireClinicalVideoMonitoring();
  const media = await requireActiveClinicalMedia(mediaId, db);
  const grantId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  await db.execute(`INSERT INTO clinical_video_grants (id,media_id,actor,participant_role,visit_id,expires_at)
    VALUES (?,?,?,?,?,?)`, [grantId, mediaId, actor, role, visitId, new Date(expiresAt * 1000)]);
  await clinicalAudit({ ...scope(media), actor, role, req }, 'clinical_video_token_issued', { visitId }, db);
  return Video.generateToken(mediaId, { expireTime: expiresAt,
    data: JSON.stringify({ grantId, identity: actor, role, displayName: role === 'provider' ? 'Provider' : 'Client' }) });
}
const scope = media => ({ kind: media.session_kind, sessionId: media.session_id, generation: media.generation, agencyId: media.agency_id });

// Commit revocation BEFORE calling the remote provider, so failures never reopen access.
export async function requestClinicalEnd(mediaId, req, db = pool) {
  const media = await clinicalMedia(mediaId, db, true);
  if (!media) throw fail(409, 'This video room predates secure encounter tracking. Close the existing call before upgrading.');
  await db.execute(`UPDATE clinical_video_sessions SET state='ending',end_requested_at=COALESCE(end_requested_at,UTC_TIMESTAMP(3))
    WHERE media_id=? AND state='active'`, [mediaId]);
  await db.execute('UPDATE clinical_video_grants SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)) WHERE media_id=?', [mediaId]);
  await clinicalAudit({ ...scope(media), role: 'provider', req }, 'clinical_encounter_end_requested', {}, db);
}
async function disconnect(mediaId, connectionId) {
  try {
    await Video.disconnectClient(mediaId, connectionId);
  } catch (error) {
    // Vonage's 404 means the connection has already disappeared. All other failures stay pending.
    if (Number(error?.response?.status || error?.statusCode || error?.status) !== 404) throw error;
  }
  await pool.execute(`UPDATE clinical_video_connections SET disconnected_at=COALESCE(disconnected_at,UTC_TIMESTAMP(3)),
    disconnect_requested=FALSE WHERE media_id=? AND connection_id=?`, [mediaId, connectionId]);
}
export async function finishClinicalEnd(mediaId) {
  const media = await clinicalMedia(mediaId);
  if (!media || media.state === 'active') throw fail(409, 'End the encounter before disconnecting participants.');
  if (media.state === 'ended') return { ok: true, state: 'ended' };
  const [connections] = await pool.execute('SELECT connection_id FROM clinical_video_connections WHERE media_id=? AND disconnected_at IS NULL', [mediaId]);
  let failed = false;
  for (const connection of connections) {
    try { await disconnect(mediaId, connection.connection_id); }
    catch { failed = true; }
  }
  // A issued token can connect until its expiry. Keep the encounter sealed while that window drains.
  const [[pending]] = await pool.execute(`SELECT
    (SELECT COUNT(*) FROM clinical_video_connections WHERE media_id=? AND disconnected_at IS NULL) connections,
    (SELECT COUNT(*) FROM clinical_video_grants WHERE media_id=? AND expires_at>UTC_TIMESTAMP(3)) tokens,
    (SELECT MAX(expires_at) FROM clinical_video_grants WHERE media_id=?) last_token_expiry`, [mediaId, mediaId, mediaId]);
  // API disconnections alone cannot prove an unreported subscriber is gone.
  // Require a signed sessionDestroyed event after the last token window.
  // A previous empty confirmation stays valid when no later token was issued.
  const emptyAfter = new Date(pending.last_token_expiry || 0).getTime();
  const confirmedEmpty = media.empty_confirmed_at && new Date(media.empty_confirmed_at).getTime() >= emptyAfter;
  if (!failed && confirmedEmpty && !Number(pending.connections) && !Number(pending.tokens)) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const current = await clinicalMedia(mediaId, db, true);
      // Webhook updates serialize on this same media row.
      const [[remaining]] = await db.execute('SELECT COUNT(*) total FROM clinical_video_connections WHERE media_id=? AND disconnected_at IS NULL', [mediaId]);
      if (current.state === 'ending' && current.empty_confirmed_at && new Date(current.empty_confirmed_at).getTime() >= emptyAfter && !Number(remaining.total)) {
        await db.execute("UPDATE clinical_video_sessions SET state='ended',ended_at=UTC_TIMESTAMP(3) WHERE media_id=?", [mediaId]);
        await clinicalAudit(scope(media), 'clinical_encounter_disconnected', {}, db);
      }
      await db.commit();
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  }
  const current = await clinicalMedia(mediaId);
  return { ok: current.state === 'ended', state: current.state,
    message: failed ? 'Disconnection is being retried. The next encounter remains locked.' : 'Finishing secure disconnection. The next encounter remains locked until complete.' };
}
export async function revokeClinicalActor(mediaId, actor, db = pool) {
  await db.execute('UPDATE clinical_video_grants SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)) WHERE media_id=? AND actor=?', [mediaId, actor]);
  await db.execute(`UPDATE clinical_video_connections c JOIN clinical_video_grants g ON g.id=c.grant_id
    SET c.disconnect_requested=TRUE WHERE c.media_id=? AND g.actor=? AND c.disconnected_at IS NULL`, [mediaId, actor]);
}

export function verifyClinicalCallback(raw, authorization, env = process.env) {
  if (!env.VONAGE_VIDEO_CALLBACK_SECRET) throw fail(503, 'Video monitoring is not configured.');
  const token = /^Bearer (\S+)$/i.exec(String(authorization || ''))?.[1];
  let claims;
  try { claims = jwt.verify(token, env.VONAGE_VIDEO_CALLBACK_SECRET, { algorithms: ['HS256'], maxAge: '24h', clockTolerance: 30 }); }
  catch { throw fail(401, 'Invalid video callback signature.'); }
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  if (!Number.isFinite(claims.iat) || claims.iat > Date.now() / 1000 + 30 || claims.payload_hash !== actual)
    throw fail(401, 'Invalid video callback payload.');
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { throw fail(400, 'Invalid callback.'); }
  if (String(event.projectId) !== String(env.VONAGE_APPLICATION_ID)) throw fail(401, 'Invalid video project.');
  return event;
}
export async function processClinicalCallback(event) {
  if (event.event==='sessionDestroyed') {
    if(!Number.isFinite(event.timestamp)||event.timestamp>Date.now()+60000)throw fail(400,'Invalid session event.');
    const db=await pool.getConnection();
    try {
      await db.beginTransaction();
      const media=await clinicalMedia(event.sessionId,db,true);
      if(media && media.state!=='ended') {
        const [[latest]]=await db.execute('SELECT MAX(expires_at) expires_at FROM clinical_video_grants WHERE media_id=?',[event.sessionId]);
        // Remember an already-empty room too: the provider may end after closing their browser.
        // Every later token has a later expiry, so this evidence cannot authorize that token window.
        if(event.timestamp>=new Date(latest.expires_at||0).getTime()) {
          await db.execute('UPDATE clinical_video_sessions SET empty_confirmed_at=? WHERE media_id=?',[new Date(event.timestamp),event.sessionId]);
          await db.execute('UPDATE clinical_video_connections SET disconnected_at=COALESCE(disconnected_at,?),disconnect_requested=FALSE WHERE media_id=? AND connected_at<=?',[new Date(event.timestamp),event.sessionId,new Date(event.timestamp)]);
          await clinicalAudit(scope(media),'clinical_media_empty_confirmed',{},db);
        }
      }
      await db.commit();
    }catch(error){await db.rollback();throw error;}finally{db.release();}
    return;
  }
  if (!['connectionCreated', 'connectionDestroyed'].includes(event.event)) return;
  const connection = event.connection;
  if (!connection?.id || connection.id.length > 100 || !Number.isFinite(event.timestamp) || event.timestamp > Date.now() + 60000)
    throw fail(400, 'Invalid connection event.');
  const db = await pool.getConnection();
  let mustDisconnect = false;
  try {
    await db.beginTransaction();
    const media = await clinicalMedia(event.sessionId, db, true);
    if (!media) { await db.commit(); return; } // Other product video rooms have their own lifecycle.
    let grantId;
    try { grantId = JSON.parse(connection.data || '{}').grantId; } catch { /* no trusted grant */ }
    const [grants] = await db.execute('SELECT * FROM clinical_video_grants WHERE id=? AND media_id=?', [grantId || '', event.sessionId]);
    const grant = grants[0];
    const connectedAt = new Date(connection.createdAt);
    if (!Number.isFinite(connectedAt.getTime()) || connectedAt.getTime() > event.timestamp + 60000) throw fail(400, 'Invalid connection time.');
    const destroyed = event.event === 'connectionDestroyed';
    const allowed = media.state === 'active' && grant && !grant.revoked_at && connectedAt <= new Date(grant.expires_at);
    mustDisconnect = !destroyed && !allowed;
    if(!destroyed)await db.execute('UPDATE clinical_video_sessions SET empty_confirmed_at=NULL WHERE media_id=? AND (empty_confirmed_at IS NULL OR empty_confirmed_at<?)',[event.sessionId,connectedAt]);
    // A destroyed event arriving first leaves a tombstone; a late create cannot resurrect it.
    await db.execute(`INSERT INTO clinical_video_connections (media_id,connection_id,grant_id,connected_at,disconnected_at,disconnect_requested)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE grant_id=COALESCE(grant_id,VALUES(grant_id)),
      disconnected_at=COALESCE(disconnected_at,VALUES(disconnected_at)),disconnect_requested=IF(disconnected_at IS NULL,VALUES(disconnect_requested),FALSE)`,
    [event.sessionId, connection.id, grant?.id || null, connectedAt, destroyed ? new Date(event.timestamp) : null, mustDisconnect]);
    await clinicalAudit({ ...scope(media), actor: grant?.actor, role: grant?.participant_role },
      destroyed ? 'clinical_media_disconnected' : allowed ? 'clinical_media_connected' : 'clinical_media_connection_denied',
      { connectionId: connection.id, visitId: grant?.visit_id || null }, db);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  if (mustDisconnect) await disconnect(event.sessionId, connection.id);
}

export async function retryClinicalDisconnections() {
  const [pending] = await pool.execute(`SELECT c.media_id,c.connection_id FROM clinical_video_connections c
    LEFT JOIN clinical_video_grants g ON g.id=c.grant_id WHERE c.disconnected_at IS NULL
    AND (c.disconnect_requested=TRUE OR g.revoked_at IS NOT NULL) LIMIT 200`);
  for (const row of pending) { try { await disconnect(row.media_id, row.connection_id); } catch { /* retry on the next tick */ } }
  const [ending] = await pool.execute("SELECT media_id FROM clinical_video_sessions WHERE state='ending' ORDER BY end_requested_at LIMIT 100");
  for (const row of ending) await finishClinicalEnd(row.media_id);
}

export async function clinicalAttendance(kind, sessionId, db = pool) {
  const [rows] = await db.execute(`SELECT g.visit_id,c.connected_at,c.disconnected_at FROM clinical_video_connections c
    JOIN clinical_video_grants g ON g.id=c.grant_id JOIN clinical_video_sessions s ON s.media_id=c.media_id
    WHERE s.session_kind=? AND s.session_id=? AND g.visit_id IS NOT NULL ORDER BY c.connected_at`, [kind, sessionId]);
  const visits = new Map();
  for (const row of rows) {
    if (!visits.has(Number(row.visit_id))) visits.set(Number(row.visit_id), []);
    visits.get(Number(row.visit_id)).push([new Date(row.connected_at).getTime(), row.disconnected_at ? new Date(row.disconnected_at).getTime() : Date.now()]);
  }
  return new Map([...visits].map(([id, intervals]) => {
    let seconds = 0, start = 0, end = 0;
    for (const [a,b] of intervals) { if (a > end) { seconds += Math.max(0,end-start); start = a; } end = Math.max(end,b); }
    return [id, Math.floor((seconds + Math.max(0,end-start)) / 1000)];
  }));
}
