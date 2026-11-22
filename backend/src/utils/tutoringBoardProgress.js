const order = ['needs_review','emerging','developing','nearly_secure','secure'];

// Evidence arrives in observation order. Several examples in one lesson are a
// single opportunity to demonstrate independence for a particular goal.
export function lessonMeasures(rows) {
  const measures = [];
  const positions = new Map();
  for (let row of rows) {
    if (!['teaching_board','session_hub_worksheet'].includes(row.metadata_json?.source) || !row.session_id) {
      measures.push(row);
      continue;
    }
    if(row.metadata_json?.source==='session_hub_worksheet'&&row.rating==='secure'&&row.metadata_json.independent!==true)row={...row,rating:'nearly_secure'};
    const key = [row.student_subject_id,row.plan_goal_id,row.session_id,row.plan_goal_id?'':row.skill_key||'',row.metadata_json?.grade||''].join('/');
    if (!positions.has(key)) {
      positions.set(key, measures.length);
      measures.push(row);
    } else {
      const index = positions.get(key);
      if (order.indexOf(row.rating) < order.indexOf(measures[index].rating)) measures[index] = row;
    }
  }
  return measures;
}

export function boardSkillProgress(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!['teaching_board','session_hub_worksheet'].includes(row.metadata_json?.source) || !order.includes(row.rating)) continue;
    const grade = row.metadata_json.grade || '';
    const key = JSON.stringify([row.skill_key, grade, row.plan_goal_id]);
    if (!groups.has(key))
      groups.set(key, { skill: row.skill_label, grade, goalId: row.plan_goal_id, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(({ rows, ...group }) => {
    const observations = lessonMeasures(rows);
    return {
      ...group,
      sessions: observations.length,
      independent: observations.filter((r) => r.rating === 'secure').length,
      latest: observations[0]?.rating,
      previous: observations[1]?.rating || null
    };
  });
}
