import { decryptChatText } from './chatEncryption.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const within = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const id = (n) => Number.isSafeInteger(n) && n > 0;
const requireHost = (ctx) => {
  if (ctx.role !== 'provider') throw fail(403, 'Only the session host can do that.');
};
const scopeSql = 'session_kind=? AND session_id=? AND generation=? AND agency_id=?';
const scope = (ctx) => [ctx.kind, ctx.sessionId, ctx.generation || 0, ctx.agencyId];
export const unpack = (row) => JSON.parse(decryptChatText(JSON.parse(row.payload_envelope)));
export const boardTypes = new Set([
  'board_lock',
  'board_surface',
  'board_clear',
  'board_prompt',
  'board_move',
  'board_visibility',
  'board_answer',
  'board_review'
]);
const text = (s, max) => {
  if (typeof s !== 'string' || !s.trim() || s.length > max)
    throw fail(400, 'Enter a shorter nonempty value.');
  return s.trim();
};
export function promptFields(p) {
  const prompt = text(p.prompt, 1200);
  if (!['choice', 'text', 'ink', 'example'].includes(p.format))
    throw fail(400, 'Choose a question format.');
  const options = p.format === 'choice' ? p.options : [];
  if (!Array.isArray(options) || (p.format === 'choice' && (options.length < 2 || options.length > 6)))
    throw fail(400, 'Enter two to six answer choices.');
  const choices = options.map((o) => text(o, 180));
  if (new Set(choices).size !== choices.length) throw fail(400, 'Each choice must be distinct.');
  return { prompt, format: p.format, options: choices };
}
function practiceModel(model) {
  if (model == null) return null;
  if (
    !['fraction_strip', 'number_line'].includes(model.type) ||
    !Number.isInteger(model.parts) ||
    model.parts < 2 ||
    model.parts > 12
  )
    throw fail(400, 'Choose a diagram with two to twelve equal parts.');
  if (!Number.isInteger(model.mark) || model.mark < 0 || model.mark > model.parts)
    throw fail(400, 'Choose a mark inside the diagram.');
  return { type: model.type, parts: model.parts, mark: model.mark };
}
function bounds(p) {
  if (!within(p.x, 0, 100) || !within(p.y, 0, 94) || !within(p.width, 24, 100) || p.x + p.width > 100.01)
    throw fail(400, 'Keep the question inside the board.');
  if(p.height!==undefined&&(!within(p.height,8,94)||p.y+p.height>100.01))throw fail(400,'Keep the question height inside the board.');
  return { x:p.x,y:p.y,width:p.width,...(p.height!==undefined?{height:p.height}:{}) };
}
async function latest(db, ctx, clause, args = []) {
  const [[row]] = await db.execute(
    `SELECT id,actor,actor_role,artifact_type,payload_envelope FROM therapy_session_artifacts WHERE ${scopeSql} AND ${clause} ORDER BY id DESC LIMIT 1`,
    [...scope(ctx), ...args]
  );
  return row;
}
export async function priorBoardRequest(db, ctx, key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(key))
    throw fail(400, 'Invalid board request.');
  return latest(db, ctx, 'board_request_id=? AND actor=?', [key, ctx.actor]);
}
// Caller holds the encounter row lock for the entire validation and append.
export async function authorizeBoard(db, ctx, type, p) {
  const host = ctx.role === 'provider';
  const current = await latest(db, ctx, "artifact_type='share'");
  const shared = current && unpack(current);
  if (type === 'share') {
    if (!host && (p.mode === 'whiteboard' || shared?.mode === 'whiteboard'))
      throw fail(403, 'Only the host can open or replace a whiteboard.');
    if (p.boardId !== undefined) {
      const origin =
        id(p.boardId) && (await latest(db, ctx, "id=? AND artifact_type='share'", [p.boardId]));
      if (
        p.mode !== 'whiteboard' ||
        !origin ||
        unpack(origin).mode !== 'whiteboard' ||
        unpack(origin).boardId
      )
        throw fail(400, 'Choose a whiteboard from this encounter.');
    }
    return p;
  }
  // Materials and prior exercises can also be reviewed after changing tools.
  if (type === 'board_review') {
    requireHost(ctx);
    if (
      ctx.kind !== 'tutoring' ||
      !id(p.targetId) ||
      !['needs_review','emerging','developing','nearly_secure','secure','not_observed'].includes(p.rating)
    )
      throw fail(400, 'Choose a tutoring exercise and rating.');
    const item = await latest(db, ctx, 'id=?', [p.targetId]);
    if (!item || !['share', 'board_prompt'].includes(item.artifact_type))
      throw fail(404, 'Session activity unavailable.');
    const source = unpack(item);
    if (item.artifact_type === 'share' && (source.mode === 'video' || source.boardId))
      throw fail(400, 'Choose instructional material.');
    if (await latest(db, ctx, "board_target_id=? AND artifact_type='board_review'", [p.targetId]))
      throw fail(409, 'This activity already has a saved rating.');
    return {
      targetId: p.targetId,
      shareId: source.shareId || p.targetId,
      rating: p.rating,
      grade: source.grade || '',
      skill: source.skill || '',
      goalId: source.goalId || null
    };
  }
  if (
    !id(p.shareId) ||
    shared?.mode !== 'whiteboard' ||
    Number(shared.boardId || current.id) !== p.shareId
  )
    throw fail(409, 'This board has changed. Reopen the current page.');
  if (!host) {
    if (!['drawing', 'board_visibility', 'board_answer'].includes(type)) requireHost(ctx);
    const lock = await latest(db, ctx, "artifact_type='board_lock' AND board_id=?", [p.shareId]);
    if (!lock || unpack(lock).locked !== false) throw fail(403, 'The host has paused student editing.');
  }
  const base = { shareId: p.shareId };
  if (type === 'board_lock') {
    if (typeof p.locked !== 'boolean') throw fail(400, 'Choose an editing mode.');
    return { ...base, locked: p.locked };
  }
  if (type === 'board_surface') {
    if (!['blank', 'dots', 'lined', 'grid'].includes(p.surface))
      throw fail(400, 'Choose a board background.');
    return { ...base, surface: p.surface };
  }
  if (type === 'board_clear') return base;
  if (type === 'board_prompt') {
    if (p.goalId && (!id(p.goalId) || ctx.kind !== 'tutoring'))
      throw fail(400, 'Choose a goal from this lesson.');
    let excerpt = null;
    if (p.excerpt) {
      const { image, page, label } = p.excerpt;
      if (
        typeof image !== 'string' ||
        image.length > 800000 ||
        !/^data:image\/jpeg;base64,\/9j\/[a-zA-Z0-9+/]+=*$/.test(image) ||
        !id(page)
      )
        throw fail(400, 'Choose a valid worksheet excerpt.');
      excerpt = {
        image,
        page,
        label: text(label, 140),
        ...(p.excerpt.materialId && ctx.kind === 'tutoring' && id(p.excerpt.materialId)
          ? { materialId: p.excerpt.materialId }
          : {})
      };
    }
    const model = practiceModel(p.model);
    return {
      ...base,
      ...promptFields(p),
      ...bounds(p),
      ...(model ? { model } : {}),
      grade: p.grade ? text(p.grade, 30) : '',
      skill: p.skill ? text(p.skill, 100) : '',
      goalId: p.goalId || null,
      excerpt
    };
  }
  if (type === 'drawing' && !p.targetId) return p;
  if (!id(p.targetId)) throw fail(400, 'Choose an item on this board.');
  const item = await latest(db, ctx, 'id=?', [p.targetId]);
  if (!item || !['drawing', 'board_prompt'].includes(item.artifact_type))
    throw fail(404, 'Board item unavailable.');
  const original = unpack(item);
  if (original.shareId !== p.shareId) throw fail(404, 'Board item unavailable.');
  const clear = await latest(db, ctx, "board_id=? AND artifact_type='board_clear'", [p.shareId]);
  if (Number(clear?.id || 0) >= p.targetId) throw fail(409, 'This item was cleared.');
  const target = { ...base, targetId: p.targetId };
  if (type === 'board_visibility') {
    if (!host && (item.actor !== ctx.actor || item.artifact_type !== 'drawing'))
      throw fail(403, 'You can erase only your own ink.');
    const previous = await latest(db, ctx, "board_target_id=? AND artifact_type='board_visibility'", [
      p.targetId
    ]);
    if ((previous ? unpack(previous).visible : true) === p.visible)
      throw fail(409, 'This item already has that visibility.');
    if (!host && p.visible === true) {
      if (!previous || previous.actor !== ctx.actor || unpack(previous).visible !== false)
        throw fail(403, 'Only the person who erased this stroke may restore it.');
    }
    if (typeof p.visible !== 'boolean') throw fail(400, 'Choose an undo or restore action.');
    return { ...target, visible: p.visible };
  }
  if (item.artifact_type !== 'board_prompt') throw fail(400, 'Choose a question.');
  const last = await latest(db, ctx, "board_target_id=? AND artifact_type='board_visibility'", [
    p.targetId
  ]);
  if (last && !unpack(last).visible) throw fail(409, 'This question is hidden.');
  if (type === 'board_move') return { ...target, ...bounds(p) };
  if (type === 'drawing') return p;
  if (type === 'board_answer') {
    if (host || !['text', 'choice'].includes(original.format))
      throw fail(400, 'Choose an answerable student question.');
    const answer = text(p.answer, 2000);
    if (original.format === 'choice' && !original.options.includes(answer))
      throw fail(400, 'Select one of the displayed choices.');
    return { ...target, answer };
  }

  throw fail(400, 'Unsupported board action.');
}
