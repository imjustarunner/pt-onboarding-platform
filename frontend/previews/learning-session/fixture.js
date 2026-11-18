export const bundle = {
  plan: { id: 801, title: 'Mathematics · Grade 5', status: 'active', approved_at: '2026-11-01', agency_id: 90002, client_id: 90004, student_subject_id: 18,
    instructional_strategies_json: ['Place-value chart', 'Worked examples', 'Guided practice'] },
  goals: [{ id: 91, title: 'Build decimal place-value skills', skill_key: 'decimals', success_criteria: 'At least 80% accuracy independently across three sessions.' },
    { id: 92, title: 'Calculate with decimals', skill_key: 'decimal_operations', success_criteria: 'Align place values and check the result on four of five problems.' },
    { id: 93, title: 'Compare and explain fractions', skill_key: 'fractions', success_criteria: 'Explain comparisons with a visual model on four of five problems.' },
    { id: 94, title: 'Plan and explain word problems', skill_key: 'word_problems', success_criteria: 'Identify relevant information, choose a strategy and explain the solution with no more than one prompt.' }],
  objectives: [{ id: 911, plan_goal_id: 91, title: 'Compare decimals to hundredths', description: 'Use place value to compare two decimals.' },
    { id: 912, plan_goal_id: 91, title: 'Round decimals to hundredths', description: 'Use adjacent place values to explain rounding.' },
    { id: 921, plan_goal_id: 92, title: 'Add decimals to hundredths', description: 'Align place values and explain the sum.' },
    { id: 922, plan_goal_id: 92, title: 'Subtract decimals to hundredths', description: 'Regroup when needed and check with addition.' },
    { id: 931, plan_goal_id: 93, title: 'Compare fractions with visual models', description: 'Use equal wholes and explain the comparison.' },
    { id: 941, plan_goal_id: 94, title: 'Choose a strategy for a word problem', description: 'Identify the question and relevant information.' },
    { id: 942, plan_goal_id: 94, title: 'Explain and check the solution', description: 'Explain steps and use a checking routine.' }]
};
export const planChecklist = { version: 1, areas: [{ key: 'objective:911', rating: 'nearly_secure', strategyKeys: ['0', '2'], result: '6 of 8 correct; two tutor prompts' }], observation: '' };

// These are fixture values in the same schema used by the platform's session brief.
export const brief = { id: 701, learning_plan_id: 801, student_subject_id: 18, agency_id: 90002, client_id: 90004,
  planned_activities_json: [
    { goalId: 91, title: 'Decimal warm-up and prior-skill review', suggestedFocus: 'Review decimal place value with the learner’s plan target.' },
    { goalId: 94, title: 'Guided word-problem practice', suggestedFocus: 'Use the plan’s strategy and explanation objectives.' },
    { goalId: 92, title: 'Independent decimal exit check', suggestedFocus: 'Check the plan’s decimal-operation target.' }
  ], guide_json: { interventionStrategies: ['Think-aloud modeling', 'Checking routine'] } };
