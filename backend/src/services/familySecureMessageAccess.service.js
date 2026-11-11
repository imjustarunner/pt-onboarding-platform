import pool from '../config/database.js';

const positiveId = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('Invalid message access context.'), { status: 400 });
  return id;
};

/**
 * Historical audience is evidence, not the current guardian roster. This SQL is
 * shared by timelines, counts and previews so pagination cannot reveal hidden
 * messages. Thread-level/current clinical authorization is checked separately.
 * Only a validated integer and code-owned alias are interpolated.
 */
export function familyMessageVisibilitySql(userId, alias = 'm', { includeParent = true } = {}) {
  const uid = positiveId(userId);
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Unsafe message alias.');
  const audience = `(EXISTS (SELECT 1 FROM client_secure_message_records audience_record
      WHERE audience_record.message_id=${alias}.id AND audience_record.thread_id=${alias}.thread_id
        AND JSON_TYPE(audience_record.audience_json)='ARRAY'
        AND (audience_record.sender_user_id=${uid}
          OR JSON_CONTAINS(audience_record.audience_json,JSON_OBJECT('id',${uid}))
          OR JSON_CONTAINS(audience_record.audience_json,CAST(${uid} AS JSON))))
    OR (NOT EXISTS (SELECT 1 FROM client_secure_message_records audience_record
          WHERE audience_record.message_id=${alias}.id)
      AND original_member.created_at<=${alias}.created_at))`;
  const own = `EXISTS (SELECT 1 FROM chat_threads audience_thread
    WHERE audience_thread.id=${alias}.thread_id AND (
      COALESCE(audience_thread.message_channel,'internal')<>'secure'
      OR EXISTS (SELECT 1 FROM chat_thread_participants original_member
        WHERE original_member.thread_id=${alias}.thread_id AND original_member.user_id=${uid}
          AND ${audience}
          AND NOT EXISTS (SELECT 1 FROM family_shared_conversations frozen_thread
            WHERE frozen_thread.thread_id=${alias}.thread_id
              AND NOT JSON_CONTAINS(frozen_thread.audience_json,CAST(${uid} AS JSON))))))`;
  if (!includeParent) return `(${own})`;
  const parentAlias = `${alias}_audience_parent`;
  return `(${own} AND (${alias}.parent_message_id IS NULL OR EXISTS (
    SELECT 1 FROM chat_messages ${parentAlias} WHERE ${parentAlias}.id=${alias}.parent_message_id
      AND ${parentAlias}.thread_id=${alias}.thread_id
      AND ${familyMessageVisibilitySql(uid, parentAlias, { includeParent: false })})))`;
}

export async function canReadFamilySecureMessage({ userId, messageId, threadId = null, checkCurrent = true }, db = pool) {
  const uid = positiveId(userId), mid = positiveId(messageId);
  const [[message]] = await db.execute('SELECT id,thread_id FROM chat_messages WHERE id=?', [mid]);
  if (!message || (threadId != null && Number(message.thread_id) !== positiveId(threadId))) return false;
  if (checkCurrent) {
    try {
      const { refreshClientSecureAccess } = await import('./clientSecureConversation.service.js');
      await refreshClientSecureAccess(message.thread_id, uid);
    } catch (error) { if ([403, 404].includes(error.status)) return false; throw error; }
  }
  const [[allowed]] = await db.execute(`SELECT m.id FROM chat_messages m
    JOIN chat_thread_participants member ON member.thread_id=m.thread_id AND member.user_id=?
    WHERE m.id=? AND ${familyMessageVisibilitySql(uid)} LIMIT 1`, [uid, mid]);
  return !!allowed;
}

export async function assertCanReadFamilySecureMessage(input, db = pool) {
  if (!await canReadFamilySecureMessage(input, db)) {
    throw Object.assign(new Error('This message is not available to your account.'), { status: 404, code: 'SECURE_MESSAGE_NOT_AVAILABLE' });
  }
}

/** Current authorization for cross-thread aggregates; no message is decrypted. */
export async function currentSecureThreadFilterSql(userId, alias = 't') {
  const uid = positiveId(userId);
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Unsafe thread alias.');
  const [threads] = await pool.execute(`SELECT t.id FROM chat_threads t
    JOIN chat_thread_participants p ON p.thread_id=t.id AND p.user_id=? WHERE t.message_channel='secure'`, [uid]);
  const { refreshClientSecureAccess } = await import('./clientSecureConversation.service.js');
  const allowed = [];
  for (const thread of threads) {
    try { await refreshClientSecureAccess(thread.id, uid); allowed.push(positiveId(thread.id)); }
    catch (error) { if (![403,404,409].includes(error.status)) throw error; }
  }
  return `(COALESCE(${alias}.message_channel,'internal')<>'secure' OR ${allowed.length ? `${alias}.id IN(${allowed.join(',')})` : 'FALSE'})`;
}

/** Recipient metadata only; opening old history never opens/creates a new thread. */
export async function describeFamilySecureThread(userId, threadId, db = pool) {
  const uid = positiveId(userId), tid = positiveId(threadId);
  const { familySharedConversations } = await import('./familySharedConversations.service.js');
  const shared = await familySharedConversations.requireAccess(uid, tid, { db });
  if (shared) {
    // Read authorization already reports whether this immutable audience is
    // still writable. A send-only provider/roster gate must not block an
    // original recipient from opening their authorized historical messages.
    const readOnly = !!shared.readOnly;
    return { sharedFamilyConversation: true, clientId: shared.clientId, agencyId: shared.agencyId,
      serviceId: shared.serviceId, client_id: shared.clientId, agency_id: shared.agencyId, service_id: shared.serviceId, readOnly, sharingPolicy: 'all_eligible_family',
      participants: shared.participants, recipients: shared.participants,
      audienceUserIds: shared.audienceUserIds };
  }
  const [[legacy]] = await db.execute(`SELECT t.client_id,t.agency_id,t.service_enrollment_id,
      personal.client_id AS personal_client_id,personal.service_id AS personal_service_id,
      (SELECT CASE WHEN COUNT(DISTINCT r.client_id)=1 THEN MIN(r.client_id) ELSE NULL END FROM client_secure_message_records r WHERE r.thread_id=t.id) AS recorded_client_id
    FROM chat_threads t LEFT JOIN dependent_portal_threads personal ON personal.thread_id=t.id
    WHERE t.id=? AND t.message_channel='secure' AND EXISTS(SELECT 1 FROM chat_thread_participants actor_member WHERE actor_member.thread_id=t.id AND actor_member.user_id=?) AND EXISTS(SELECT 1 FROM chat_thread_participants p
      JOIN users u ON u.id=p.user_id WHERE p.thread_id=t.id AND u.role IN('client','client_guardian'))`, [tid,uid]);
  if (!legacy) return null;
  return { sharedFamilyConversation: true, clientId: Number(legacy.personal_client_id || legacy.client_id || legacy.recorded_client_id) || null,
    agencyId: Number(legacy.agency_id), serviceId: Number(legacy.personal_service_id || legacy.service_enrollment_id) || 0,
    client_id: Number(legacy.personal_client_id || legacy.client_id || legacy.recorded_client_id) || null, agency_id: Number(legacy.agency_id), service_id: Number(legacy.personal_service_id || legacy.service_enrollment_id) || 0,
    readOnly: true, sharingPolicy: 'historical_recipients', participants: [], recipients: [], audienceUserIds: [] };
}
