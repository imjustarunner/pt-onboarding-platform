import pool from '../config/database.js';

function titleFromPrompt(prompt) {
  const t = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Assistant chat';
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

export async function listAssistantThreads({ userId, agencyId = null, limit = 30 } = {}) {
  const uid = Number(userId || 0);
  if (!uid) return [];
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 80);
  const params = [uid];
  let agencyClause = '';
  if (agencyId) {
    agencyClause = 'AND agency_id = ?';
    params.push(Number(agencyId));
  }
  const [rows] = await pool.execute(
    `SELECT id, agency_id, user_id, title, created_at, updated_at
     FROM assistant_threads
     WHERE user_id = ? ${agencyClause}
     ORDER BY updated_at DESC
     LIMIT ${lim}`,
    params
  );
  return rows || [];
}

export async function getAssistantThread({ threadId, userId }) {
  const tid = Number(threadId || 0);
  const uid = Number(userId || 0);
  if (!tid || !uid) return null;
  const [rows] = await pool.execute(
    `SELECT id, agency_id, user_id, title, created_at, updated_at
     FROM assistant_threads
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [tid, uid]
  );
  return rows?.[0] || null;
}

export async function listAssistantThreadMessages({ threadId, userId, limit = 200 } = {}) {
  const thread = await getAssistantThread({ threadId, userId });
  if (!thread) return { thread: null, messages: [] };
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const [rows] = await pool.execute(
    `SELECT id, role, body, meta_json, created_at
     FROM assistant_thread_messages
     WHERE thread_id = ?
     ORDER BY id ASC
     LIMIT ${lim}`,
    [thread.id]
  );
  const messages = (rows || []).map((r) => {
    let meta = null;
    if (r.meta_json) {
      try {
        meta = typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : r.meta_json;
      } catch {
        meta = null;
      }
    }
    return {
      id: r.id,
      role: r.role,
      text: r.body,
      body: r.body,
      cards: meta?.cards || null,
      uiCommands: meta?.uiCommands || null,
      createdAt: r.created_at,
      meta
    };
  });
  return { thread, messages };
}

export async function ensureAssistantThread({ userId, agencyId, title = null } = {}) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) {
    const err = new Error('userId and agencyId are required');
    err.status = 400;
    throw err;
  }
  const [result] = await pool.execute(
    `INSERT INTO assistant_threads (agency_id, user_id, title)
     VALUES (?, ?, ?)`,
    [aid, uid, title || null]
  );
  return getAssistantThread({ threadId: result.insertId, userId: uid });
}

export async function appendAssistantTurn({
  threadId,
  userId,
  agencyId,
  userText,
  assistantText,
  meta = null
} = {}) {
  const uid = Number(userId || 0);
  let tid = Number(threadId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) {
    const err = new Error('userId and agencyId are required');
    err.status = 400;
    throw err;
  }

  let thread = tid ? await getAssistantThread({ threadId: tid, userId: uid }) : null;
  if (!thread) {
    thread = await ensureAssistantThread({
      userId: uid,
      agencyId: aid,
      title: titleFromPrompt(userText)
    });
    tid = thread.id;
  } else if (!thread.title && userText) {
    await pool.execute(`UPDATE assistant_threads SET title = ? WHERE id = ? AND user_id = ?`, [
      titleFromPrompt(userText),
      tid,
      uid
    ]);
  }

  const userBody = String(userText || '').trim();
  if (userBody) {
    await pool.execute(
      `INSERT INTO assistant_thread_messages (thread_id, role, body, meta_json)
       VALUES (?, 'user', ?, NULL)`,
      [tid, userBody]
    );
  }

  const asstBody = String(assistantText || '').trim();
  if (asstBody) {
    const metaJson = meta ? JSON.stringify(meta) : null;
    await pool.execute(
      `INSERT INTO assistant_thread_messages (thread_id, role, body, meta_json)
       VALUES (?, 'assistant', ?, ?)`,
      [tid, asstBody, metaJson]
    );
  }

  await pool.execute(`UPDATE assistant_threads SET updated_at = NOW() WHERE id = ?`, [tid]);
  return getAssistantThread({ threadId: tid, userId: uid });
}
