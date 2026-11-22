// Version-specific scoring. Never combine independent modules into a diagnostic total.
export function scoreAdditionalOutcome(measure, answers, result) {
  const sum = keys => keys.reduce((total, key) => total + Number(answers[key]), 0);
  const keys = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
  const flag = (key, text, urgent = false) => result.flags.push({ key, text, urgent });
  if (measure.safetyItemKey) {
    const key = measure.safetyItemKey;
    if (Number(answers[key]) > 0) flag('safety_follow_up', 'The self-harm/death-thoughts item was endorsed. Complete direct safety follow-up now and follow the agency safety procedure. The total score does not determine safety.', true);
    else if (answers[key] == null) flag('safety_unanswered', 'The self-harm/death-thoughts item is unanswered; follow up directly. Safety is not established by a questionnaire score.');
    for (const key of measure.safetyYesKeys || []) if (answers[key] === '1') flag(`safety_${key}`, `${key === 'past_month' ? 'Serious thoughts about ending life in the past month' : 'A lifetime suicide attempt'} reported. Complete direct safety follow-up and document the clinical assessment.`, true);
  }
  if (measure.id === 'phq') {
    if (keys('d', 9).every(key => answers[key] != null)) result.domains['Depression symptoms (0–27)'] = sum(keys('d', 9));
    if (keys('s', 13).every(key => answers[key] != null)) result.domains['Physical symptoms reported as bothersome (of 13)'] = keys('s', 13).filter(key => Number(answers[key]) > 0).length;
    if (answers.panic1 === '1' && keys('panicFollow', 3).every(key => answers[key] === '1') && keys('attack', 11).every(key => answers[key] != null)) {
      result.domains['Symptoms during anxiety attack (of 11)'] = keys('attack', 11).filter(key => answers[key] === '1').length;
      if (result.domains['Symptoms during anxiety attack (of 11)'] >= 4) flag('panic_review', 'Panic module screening pattern endorsed; assess the reported attacks clinically.');
    }
    if (answers.eatingFrequency === '1') flag('eating_review', 'Recurrent episodes of eating a large amount with loss of control reported. Review the eating module clinically.');
    if (answers.compensatoryFrequency === '1') flag('compensatory_review', 'Recurrent compensatory behaviors reported; review eating concerns clinically.');
    if (keys('alcohol', 5).some(key => answers[key] === '1')) flag('alcohol_review', 'An alcohol-related problem was endorsed; further assessment is indicated.');
    result.interpretation = 'Review each module separately. No combined PHQ total or automated diagnosis is calculated. Depression is the nine-item symptom sum; the physical-symptom count is descriptive, not a PHQ-15 score.'
      + (!result.complete ? ' This administration is incomplete; only fully answered modules have numerical results.' : '');
    return { answers, result };
  }
  const handled = measure.comparisonFamily === 'vanderbilt-parent' || ['asrs', 'rses', 'phq-2', 'phq-4', 'phq-8', 'gad-2', 'phq-9-parent', 'phq-9-modified-teens', 'phq-9-adolescent'].includes(measure.id);
  if (!handled) return null;
  if (!result.complete) {
    result.interpretation = 'Incomplete responses. No total or severity band calculated; unanswered items are not treated as zero.';
    return { answers, result };
  }
  if (measure.comparisonFamily === 'vanderbilt-parent') {
    result.total = sum(keys('q', 18));
    result.average = sum(keys('p', 8)) / 8;
    const count = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `q${from + i}`).filter(key => Number(answers[key]) >= 2).length;
    result.domains = { 'Inattention symptoms rated often / very often (of 9)': count(1, 9), 'Hyperactivity / impulsivity symptoms rated often / very often (of 9)': count(10, 18), 'Performance areas rated 4 or 5 (of 8)': keys('p', 8).filter(key => Number(answers[key]) >= 4).length };
    if (measure.phase === 'initial') {
      const impaired = result.domains['Performance areas rated 4 or 5 (of 8)'] > 0;
      for (const [name, from, to, threshold] of [['Inattention', 1, 9, 6], ['Hyperactivity / impulsivity', 10, 18, 6], ['Oppositional / defiant', 19, 26, 4], ['Conduct', 27, 40, 3], ['Anxiety / depression', 41, 47, 3]]) {
        result.domains[`${name} symptom count`] = count(from, to);
        if (impaired && count(from, to) >= threshold) flag(`vanderbilt_${from}`, `${name} screening threshold reached with reported performance concerns. Clinical assessment and information from more than one setting are needed; this is not a diagnosis.`);
      }
    } else {
      result.domains['Side effects rated moderate / severe (of 12)'] = keys('side', 12).filter(key => Number(answers[key]) >= 2).length;
      if (Number(answers.side12) > 0) flag('perceptual_symptoms', 'Seeing or hearing things that are not there was reported. Review directly with the family.');
    }
    result.interpretation = 'ADHD symptom score uses only items 1–18 (0–54). Average performance uses eight ratings (1–5). Lower scores indicate fewer reported symptoms or performance concerns. Compare the same reporting caregiver, noting medication context; associated symptoms and side effects are separate.';
  } else if (measure.id === 'asrs') {
    result.total = keys('q', 6).filter((key, i) => Number(answers[key]) >= (i < 3 ? 2 : 3)).length;
    result.interpretation = `${result.total >= 4 ? 'Four or more shaded responses: further ADHD evaluation is indicated.' : 'Fewer than four shaded responses; this does not rule out ADHD.'} Original ASRS-v1.1 six-question scoring (0–6), not a symptom-severity or diagnostic score.`;
  } else if (measure.id === 'rses') {
    result.total = keys('q', 10).reduce((total, key, i) => total + ([1, 2, 4, 6, 7].includes(i + 1) ? 3 - Number(answers[key]) : Number(answers[key])), 0);
    result.interpretation = 'Higher scores indicate higher reported self-esteem (0–30). No universal diagnostic cutoff is applied.';
  } else {
    const supplementaryPhq = ['phq-9-parent', 'phq-9-modified-teens', 'phq-9-adolescent'].includes(measure.id);
    result.total = sum(keys('q', supplementaryPhq ? 9 : measure.id === 'phq-8' ? 8 : measure.id === 'phq-4' ? 4 : 2));
    if (measure.id === 'phq-9-parent') {
      result.interpretation = 'Descriptive parent-report symptom total (0–27). Parent observations are not interchangeable with the adolescent’s own report. Self-report severity bands are not applied to this adaptation; review the individual and supplementary answers.';
    } else if (measure.id === 'phq-2' || measure.id === 'gad-2') {
      result.interpretation = `${result.total >= 3 ? 'Screening threshold of 3 reached; further assessment is indicated.' : 'Below the screening threshold of 3; this does not rule out concerns.'} Screening result only, not a diagnosis.`;
    } else {
      const brief = measure.id === 'phq-4';
      const thresholds = brief ? [3, 6, 9] : [5, 10, 15, 20];
      result.band = (brief ? ['Normal', 'Mild', 'Moderate', 'Severe'] : ['Minimal', 'Mild', 'Moderate', 'Moderately severe', 'Severe'])[thresholds.filter(n => result.total >= n).length];
      if (brief) result.domains = { 'Anxiety subscale (0–6)': sum(['q1', 'q2']), 'Depression subscale (0–6)': sum(['q3', 'q4']) };
      result.interpretation = `${result.band} symptom range. Screening result only; clinical assessment determines diagnosis and next steps.` + (supplementaryPhq ? ' The four supplementary questions do not contribute to the symptom total. Follow up endorsed safety items directly.' : '');
    }
  }
  return { answers, result };
}
