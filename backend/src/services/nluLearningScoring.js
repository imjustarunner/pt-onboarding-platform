// Descriptive pilot scoring. No diagnostic/achievement norms or pass/fail bands.
export function scoreNluLearning(measure, answers, result) {
  result.validated = false;
  result.scoringVersion = measure.scoringVersion;
  result.total = null;
  result.domainDetails = {};
  if (measure.id === 'nlu-academic-observation') {
    const present = key => answers[key] != null;
    if (present('attempted') && present('presented') && Number(answers.attempted) > Number(answers.presented)) throw Object.assign(new Error('Attempted opportunities cannot exceed opportunities presented.'), { status: 400 });
    if (present('correct') && present('attempted') && Number(answers.correct) > Number(answers.attempted)) throw Object.assign(new Error('Correct opportunities cannot exceed opportunities attempted.'), { status: 400 });
    if (present('subject') && present('unit') && answers.unit !== (answers.subject === 'reading_accuracy' ? 'word' : 'question')) throw Object.assign(new Error('Use words for reading accuracy and questions/problems for comprehension or math.'), { status: 400 });
    const attempted = Number(answers.attempted), correct = Number(answers.correct), presented = Number(answers.presented);
    result.domains['Task accuracy (%)'] = result.complete && attempted > 0 ? Math.round(correct / attempted * 1000) / 10 : null;
    result.domains['Task completion (%)'] = result.complete && presented > 0 ? Math.round(attempted / presented * 1000) / 10 : null;
    result.interpretation = 'Observed task performance only. Accuracy uses attempted opportunities; completion uses presented opportunities. Zero attempts produce no accuracy, not 0% accuracy. Compare task content, form, difficulty, assistance, conditions and practice exposure before discussing change. No percentile, grade equivalent, clinical cutoff or automatic growth claim is calculated.';
    return { answers, result };
  }
  result.unobserved = measure.items.filter(i => answers[i.key] === 'not_observed').map(i => i.key);
  for (const domain of measure.domains) {
    const observed = domain.items.filter(key => /^[0-4]$/.test(answers[key] ?? ''));
    // Complete-domain rule avoids shifting item composition between visits.
    const value = observed.length === domain.items.length ? Math.round(observed.reduce((sum, key) => sum + Number(answers[key]), 0) / observed.length * 100) / 100 : null;
    result.domains[domain.label] = value;
    result.domainDetails[domain.label] = { answered: observed.length, expected: domain.items.length, direction: domain.direction, range: [0,4], missing: domain.items.filter(key => answers[key] == null), notObserved: domain.items.filter(key => answers[key] === 'not_observed') };
  }
  result.interpretation = 'Original pilot, not validated. Lower learning-related distress and higher regulation/support or participation describe different response patterns; they are not combined. A domain needs all four numeric answers. No-opportunity, unsure and missing responses are never zero or prorated. Student and caregiver-at-home reports are separate perspectives, not interchangeable scores. No good/poor bands or reliable-change thresholds have been established.';
  return { answers, result };
}
