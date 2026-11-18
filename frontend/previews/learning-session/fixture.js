export const bundle = {
  plan: { id: 801, title: 'Mathematics · Grade 5', status: 'active', approved_at: '2026-11-01', agency_id: 90002, client_id: 90004, student_subject_id: 18,
    instructional_strategies_json: ['Place-value chart', 'Worked examples', 'Guided practice'] },
  goals: [{ id: 91, title: 'Build decimal place-value skills', skill_key: 'decimals', success_criteria: 'At least 80% accuracy independently across three sessions.' }],
  objectives: [{ id: 911, plan_goal_id: 91, title: 'Compare decimals to hundredths', description: 'Use place value to compare two decimals.' },
    { id: 912, plan_goal_id: 91, title: 'Add decimals to hundredths', description: 'Align place values and explain the sum.' }]
};
export const planChecklist = { version: 1, areas: [{ key: 'objective:911', rating: 'nearly_secure', strategyKeys: ['0', '2'], result: '6 of 8 correct; two tutor prompts' }], observation: '' };
