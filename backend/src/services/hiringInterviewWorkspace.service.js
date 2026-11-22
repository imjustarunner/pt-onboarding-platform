import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';
import pool from '../config/database.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';

// Private notes never leave the server for another author, including on finalization.
export function interviewArtifactForViewer(artifact, userId) {
  if (!artifact) return null;
  const uid = String(userId);
  return { ...artifact, private_notes_json: { [uid]: artifact.private_notes_json?.[uid] || '' },
    my_scorecard: artifact.scorecard_json?.byInterviewer?.[uid] || null };
}

export function mergeInterviewWorkspace(artifact, body, actor) {
  const uid = String(actor.id);
  const flow = structuredClone(artifact.flow_state_json || {});
  const delta = body.completedPatch || {};
  if (Object.keys(delta).length > 500 || Object.values(delta).some(v => typeof v !== 'boolean')) {
    throw Object.assign(new Error('Invalid question progress'), { status: 400 });
  }
  flow.completed = { ...flow.completed, ...delta };
  if (body.sectionPatch) {
    const section = body.sectionPatch;
    if (!['salutation', 'icebreaker', 'additional'].includes(section.key) || JSON.stringify(section).length > 20000) {
      throw Object.assign(new Error('Invalid interview guide section'), { status: 400 });
    }
    const sections = flow.sections || [];
    if (section.key === 'additional') {
      const previous = sections.find(s => s.key === 'additional');
      section.questions = [...new Map([...(previous?.questions || []), ...(section.questions || [])].map(q => [q.key, q])).values()];
    }
    const index = sections.findIndex(s => s.key === section.key);
    flow.sections = [...sections];
    if (index >= 0) flow.sections[index] = section;
    else flow.sections.push(section);
  }
  if (body.questionPatches !== undefined) {
    if (!Array.isArray(body.questionPatches) || !body.questionPatches.length || body.questionPatches.length > 40) {
      throw Object.assign(new Error('Save up to 40 interview question changes at a time.'), { status: 400 });
    }
    for (const patch of body.questionPatches) {
      const text = String(patch?.text || '').trim();
      if (!text || text.length > 2000 || !patch.key || typeof patch.key !== 'string' || patch.key.length > 100) {
        throw Object.assign(new Error('Enter a question of up to 2,000 characters.'), { status: 400 });
      }
      flow.sections ||= [];
      const existing = flow.sections.flatMap(section => section.questions || [])
        .find(question => question.key === patch.key);
      if (existing) {
        if (existing.text !== patch.original && existing.text !== text) {
          throw Object.assign(new Error('This interview question changed. Reopen the interview before editing it again.'), { status: 409 });
        }
        existing.text = text;
      } else if (/^calendar-[\w-]{1,80}$/.test(patch.key) && !patch.original) {
        let section = flow.sections.find(section => section.key === 'additional');
        if (!section) {
          section = { key: 'additional', label: 'Additional questions', questions: [] };
          flow.sections.push(section);
        }
        section.questions.push({ key: patch.key, text });
      } else {
        throw Object.assign(new Error('This interview question is no longer available.'), { status: 409 });
      }
    }
  }
  const notes = { ...(artifact.private_notes_json || {}) };
  if (body.myNotes !== undefined) notes[uid] = String(body.myNotes).slice(0, 100000);
  const score = structuredClone(artifact.scorecard_json || {});
  if (body.myRatings !== undefined) {
    if (!body.myRatings || Array.isArray(body.myRatings) || typeof body.myRatings !== 'object'
      || Object.values(body.myRatings).some(v => !Number.isInteger(v) || v < 0 || v > 4)) {
      throw Object.assign(new Error('Ratings must be between 0 and 4'), { status: 400 });
    }
    score.byInterviewer = { ...score.byInterviewer, [uid]: body.myRatings };
    score.criteria = flow.scorecardCriteria || score.criteria || [];
    score.maxStars = 4;
    const keys = new Set(Object.values(score.byInterviewer).flatMap(Object.keys));
    score.ratings = Object.fromEntries([...keys].map(key => {
      const values = Object.values(score.byInterviewer).map(r => Number(r[key] || 0)).filter(v => v > 0);
      return [key, values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0];
    }));
  }
  const chat = [...(artifact.team_chat_json || [])];
  if (body.teamMessage) {
    const id = String(body.teamMessage.id || '').slice(0, 100);
    const message = String(body.teamMessage.text || '').trim().slice(0, 10000);
    if (!id || !message) throw Object.assign(new Error('A message ID and text are required'), { status: 400 });
    if (!chat.some(m => m.id === id && String(m.authorId) === uid)) chat.push({ id, text: message,
      authorId: uid, authorName: [actor.first_name, actor.last_name].filter(Boolean).join(' ') || 'Interviewer', at: new Date().toISOString() });
  }
  return { flow_state_json: flow, private_notes_json: notes, scorecard_json: score, team_chat_json: chat };
}

export async function saveInterviewWorkspace(interviewId, body, actor) {
  // Reject old full-document clients: replacing maps silently loses concurrent work.
  if (['flowStateJson','privateNotesJson','teamChatJson','scorecardJson','flow_state_json','private_notes_json','team_chat_json','scorecard_json'].some(k => body[k] !== undefined)) {
    throw Object.assign(new Error('Refresh the interview workspace before saving.'), { status: 409 });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM hiring_interview_artifacts WHERE hiring_interview_id = ? FOR UPDATE', [interviewId]);
    if (!rows.length) throw Object.assign(new Error('Interview workspace is not initialized'), { status: 409 });
    const current = HiringInterviewArtifact.hydrate(rows[0]);
    const merged = mergeInterviewWorkspace(current, body, actor);
    // Continuing notes/chat must not undo a finalized scorecard. New ratings
    // require finalization again, under the same row lock as the rating update.
    const scoreChanged = JSON.stringify(current.scorecard_json) !== JSON.stringify(merged.scorecard_json);
    const finalizationSql = scoreChanged ? ', finalized_at = NULL, average_score = NULL' : '';
    await conn.execute(`UPDATE hiring_interview_artifacts SET flow_state_json = ?, private_notes_json = ?, scorecard_json = ?, team_chat_json = ?${finalizationSql} WHERE hiring_interview_id = ?`,
      [maybeEncryptNotePayload(JSON.stringify(merged.flow_state_json)), maybeEncryptNotePayload(JSON.stringify(merged.private_notes_json)), maybeEncryptNotePayload(JSON.stringify(merged.scorecard_json)), maybeEncryptNotePayload(JSON.stringify(merged.team_chat_json)), interviewId]);
    await conn.commit();
    return interviewArtifactForViewer({ ...current, ...merged, ...(scoreChanged ? { finalized_at: null, average_score: null } : {}) }, actor.id);
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
