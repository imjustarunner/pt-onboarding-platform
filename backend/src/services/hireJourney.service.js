import pool from '../config/database.js';

export const parseMetadata = (value) => {
  try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); }
  catch { return {}; }
};

export function taskPhase(task, status) {
  const meta = parseMetadata(task.metadata);
  if (['pre_hire', 'onboarding', 'ongoing'].includes(meta.portalPhase)) return meta.portalPhase;
  if (meta.contractGeneration || meta.autoFromSendPreHire) return 'pre_hire';
  return ['ONBOARDING', 'ACTIVE_EMPLOYEE'].includes(status) ? 'onboarding' : 'pre_hire';
}

export function taskProgress(tasks) {
  const required = tasks.filter((t) => t.isRequired);
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    total: tasks.length, completed, requiredTotal: required.length,
    requiredCompleted: required.filter((t) => t.status === 'completed').length,
    allDone: required.every((t) => t.status === 'completed'),
    percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0
  };
}

export async function journeyTasks(userId, status, db = pool) {
  const [rows] = await db.execute(
    `SELECT id, task_type, document_action_type, title, description, status, due_date,
            reference_id, metadata, is_required, completed_at
     FROM tasks WHERE assigned_to_user_id = ?
       AND task_type IN ('document', 'training', 'intake_form', 'custom')
       AND (task_type != 'custom' OR JSON_EXTRACT(metadata, '$.checklistItemId') IS NOT NULL)
       AND (document_action_type IS NULL OR document_action_type != 'countersignature')
       AND status NOT IN ('overridden', 'archived', 'deleted') ORDER BY created_at, id`, [userId]);
  return rows.map((t) => ({
    id: t.id, taskType: t.task_type, actionType: t.document_action_type,
    title: t.title, description: t.description, status: t.status, dueDate: t.due_date,
    referenceId: t.reference_id, metadata: parseMetadata(t.metadata),
    isRequired: !!Number(t.is_required), completedAt: t.completed_at,
    phase: taskPhase(t, status)
  }));
}

export async function getJourney(userId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM hire_journeys WHERE user_id = ?', [userId]);
  const row = rows[0];
  if (!row) return null;
  const [time] = await db.execute(
    'SELECT work_date, seconds, payroll_claim_id FROM hire_onboarding_time WHERE user_id = ? ORDER BY work_date', [userId]);
  const onboarding = parseMetadata(row.onboarding_snapshot);
  if (onboarding.questionnairesEncrypted) {
    const { decryptGuardianIntake } = await import('./guardianIntakeEncryption.service.js');
    onboarding.questionnaires = JSON.parse(decryptGuardianIntake(onboarding.questionnairesEncrypted));
    delete onboarding.questionnairesEncrypted;
  }
  return {
    prehireCompletedAt: row.prehire_completed_at,
    onboardingStartedAt: row.onboarding_started_at,
    onboardingCompletedAt: row.onboarding_completed_at,
    prehire: parseMetadata(row.prehire_snapshot), onboarding,
    time: { seconds: time.reduce((sum, t) => sum + Number(t.seconds), 0), days: time }
  };
}

export async function ensureJourney(userId, db = pool) {
  await db.execute(
    `INSERT INTO hire_journeys (user_id, agency_id)
     SELECT user_id, agency_id FROM user_agencies WHERE user_id = ? ORDER BY agency_id LIMIT 1
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`, [userId]);
}

export async function closePrehire(userId, snapshot, db = pool) {
  await ensureJourney(userId, db);
  await db.execute(
    `UPDATE hire_journeys SET prehire_completed_at = COALESCE(prehire_completed_at, UTC_TIMESTAMP()),
      prehire_snapshot = COALESCE(prehire_snapshot, ?) WHERE user_id = ?`, [JSON.stringify(snapshot), userId]);
  // Freeze provenance before the employee's status changes.
  await db.execute(
    `UPDATE tasks SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.portalPhase', 'pre_hire')
     WHERE assigned_to_user_id = ? AND JSON_EXTRACT(metadata, '$.portalPhase') IS NULL`, [userId]);
}

export async function startOnboarding(userId, db = pool) {
  await ensureJourney(userId, db);
  await db.execute(
    `UPDATE hire_journeys SET onboarding_started_at = COALESCE(onboarding_started_at, UTC_TIMESTAMP())
     WHERE user_id = ?`, [userId]);
}

export function creditedActivitySeconds({ lastSeen, now, sameSession, previousActive, active }) {
  const elapsed = (new Date(now).getTime() - new Date(lastSeen).getTime()) / 1000;
  return sameSession && previousActive && active && elapsed > 0 && elapsed <= 45
    ? Math.min(30, Math.floor(elapsed)) : 0;
}

export async function recordOnboardingActivity(userId, { sessionId, sequence, active }) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(sessionId || '')) || !Number.isSafeInteger(sequence) || sequence < 1 || typeof active !== 'boolean') {
    throw Object.assign(new Error('Invalid activity heartbeat.'), { status: 400 });
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT status FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (user?.status !== 'ONBOARDING') {
      await db.rollback();
      return { tracking: false };
    }
    await startOnboarding(userId, db);
    const [[row]] = await db.execute('SELECT *, UTC_TIMESTAMP(3) AS server_now FROM hire_journeys WHERE user_id = ? FOR UPDATE', [userId]);
    if (!row || row.onboarding_completed_at) {
      await db.rollback();
      return { tracking: false };
    }
    const sameSession = row.activity_session === sessionId;
    if (sameSession && sequence <= Number(row.activity_sequence)) {
      await db.rollback();
      return { tracking: true, creditedSeconds: 0 };
    }
    if (!sameSession && !active && row.activity_active && row.activity_seen_at
      && new Date(row.server_now) - new Date(row.activity_seen_at) < 45000) {
      await db.rollback();
      return { tracking: true, creditedSeconds: 0 };
    }
    const seconds = creditedActivitySeconds({
      lastSeen: row.activity_seen_at, now: row.server_now, sameSession,
      previousActive: !!row.activity_active, active
    });
    await db.execute(
      `UPDATE hire_journeys SET activity_session = ?, activity_sequence = ?, activity_seen_at = UTC_TIMESTAMP(3), activity_active = ?
       WHERE user_id = ?`, [sessionId, sequence, active, userId]);
    if (seconds) {
      const end = new Date(row.server_now).getTime();
      let start = end - seconds * 1000;
      while (start < end) {
        const date = new Date(start).toISOString().slice(0, 10);
        const midnight = Date.parse(`${date}T00:00:00.000Z`) + 86400000;
        const segmentEnd = Math.min(end, midnight);
        const segmentSeconds = (segmentEnd - start) / 1000;
        await db.execute(
          `INSERT INTO hire_onboarding_time (user_id, work_date, seconds) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE seconds = seconds + VALUES(seconds)`, [userId, date, segmentSeconds]);
        start = segmentEnd;
      }
    }
    await db.commit();
    return { tracking: true, creditedSeconds: seconds };
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}

export async function completeOnboarding(userId) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT status FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (user?.status !== 'ONBOARDING') throw Object.assign(new Error('Onboarding is not open.'), { status: 409 });
    await ensureJourney(userId, db);
    const [[journey]] = await db.execute('SELECT * FROM hire_journeys WHERE user_id = ? FOR UPDATE', [userId]);
    if (journey.onboarding_completed_at) { await db.commit(); return getJourney(userId); }
    const tasks = (await journeyTasks(userId, user.status, db)).filter((t) => t.phase === 'onboarding');
    if (!tasks.length || !taskProgress(tasks).allDone) {
      throw Object.assign(new Error('Complete all required onboarding items before submitting.'), { status: 400 });
    }
    const [days] = await db.execute('SELECT * FROM hire_onboarding_time WHERE user_id = ? FOR UPDATE', [userId]);
    for (const day of days) {
      if (day.payroll_claim_id || !day.seconds) continue;
      const payload = {
        source: 'onboarding_portal', categoryLabel: 'Onboarding', meetingType: 'Onboarding',
        totalMinutes: Number(day.seconds) / 60, durationMinutes: Number(day.seconds) / 60,
        actualSeconds: Number(day.seconds), notes: 'Automatically recorded active onboarding time. UTC work date.'
      };
      const [claim] = await db.execute(
        `INSERT INTO payroll_time_claims (agency_id, user_id, submitted_by_user_id, status, claim_type, claim_date, payload_json)
         VALUES (?, ?, ?, 'submitted', 'meeting_training', ?, ?)`,
        [journey.agency_id, userId, userId, day.work_date, JSON.stringify(payload)]);
      await db.execute('UPDATE hire_onboarding_time SET payroll_claim_id = ? WHERE user_id = ? AND work_date = ?',
        [claim.insertId, userId, day.work_date]);
    }
    const { portalModuleForms } = await import('./portalTraining.service.js');
    const questionnaires = [];
    for (const task of tasks.filter((t) => t.taskType === 'training')) {
      const form = await portalModuleForms(userId, task.referenceId);
      if (form.fields.length) questionnaires.push({ moduleId: task.referenceId, title: task.title, fields: form.fields });
    }
    const { encryptGuardianIntake } = await import('./guardianIntakeEncryption.service.js');
    const questionnairesEncrypted = questionnaires.length ? encryptGuardianIntake(JSON.stringify(questionnaires)) : null;
    await db.execute(
      `UPDATE hire_journeys SET onboarding_completed_at = UTC_TIMESTAMP(), onboarding_snapshot = ?, activity_active = FALSE WHERE user_id = ?`,
      [JSON.stringify({ tasks, questionnairesEncrypted, completedAt: new Date().toISOString() }), userId]);
    await db.commit();
    return getJourney(userId);
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}

export async function requireOnboardingSubmitted(userId) {
  const journey = await getJourney(userId);
  if (!journey?.onboardingCompletedAt) {
    throw Object.assign(new Error('The employee must submit their completed onboarding package before activation.'), { status: 409 });
  }
}
