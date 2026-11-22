// Rebuild a page from authoritative, append-only events. Board coordinates are
// percentages for cards and 1000 × 700 for strokes, independent of device size.
export function teachingPage(events, boardId) {
  const items = new Map(),
    answers = new Map(),
    reviews = new Map();
  let locked = true,
    surface = 'dots';
  for (const event of events) {
    const p = event.payload;
    if (p.shareId !== boardId) continue;
    if (event.type === 'board_surface') surface = p.surface;
    if (event.type === 'board_lock') locked = p.locked;
    if (event.type === 'board_clear') items.clear();
    if (event.type === 'drawing' || event.type === 'board_prompt')
      items.set(event.id, { ...event, visible: true });
    const target = items.get(p.targetId);
    if (event.type === 'board_move' && target)
      target.payload = { ...target.payload, x: p.x, y: p.y, width: p.width, ...(p.height!==undefined?{height:p.height}:{}) };
    if (event.type === 'board_visibility' && target) {
      target.visible = p.visible;
      target.changedBy = event.actor;
      target.changedAt = event.id;
    }
    if (event.type === 'board_answer') answers.set(p.targetId, event);
    if (event.type === 'board_review') reviews.set(p.targetId, p.rating);
  }
  return { locked, surface, items: [...items.values()], answers, reviews };
}
