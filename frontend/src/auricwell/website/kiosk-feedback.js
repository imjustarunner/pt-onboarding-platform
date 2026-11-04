// Only local demo answers; no clinical API, persistence or analytics payload.
export function scoreExampleFeedback(forms, answers = {}, skipped = []) {
  return Object.fromEntries(forms.map(form => {
    const values = form.fields.map(field => {
      if (skipped.includes(form.id)) return null;
      const option = field.options.find(o => o.value === answers[form.id]?.[field.id]);
      return option?.score == null ? null : field.scoreDirection === 'reverse' ? 10 - option.score : option.score;
    });
    return [form.category, values.every(value => value != null) ? Math.round(values.reduce((a,b) => a+b,0) / values.length * 10) / 10 : null];
  }));
}
