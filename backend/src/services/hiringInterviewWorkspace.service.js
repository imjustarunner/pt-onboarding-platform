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
    await conn.execute(`UPDATE hiring_interview_artifacts SET flow_state_json = ?, private_notes_json = ?, scorecard_json = ?, team_chat_json = ?, finalized_at = NULL, average_score = NULL WHERE hiring_interview_id = ?`,
      [JSON.stringify(merged.flow_state_json), JSON.stringify(merged.private_notes_json), JSON.stringify(merged.scorecard_json), JSON.stringify(merged.team_chat_json), interviewId]);
    await conn.commit();
    return interviewArtifactForViewer({ ...current, ...merged, finalized_at: null, average_score: null }, actor.id);
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
