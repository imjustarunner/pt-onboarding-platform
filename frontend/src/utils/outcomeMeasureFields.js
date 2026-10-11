export function outcomeItemVisible(item, answers) {
  return (item.when || []).every(condition => {
    const key = condition.key === '$alcohol' ? `alcohol_${answers.alcohol_branch}` : condition.key;
    return condition.positive ? /^[1-4]$/.test(String(answers[key])) : answers[key] === condition.equals;
  });
}
export function outcomeResponseLabel(item, value) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return 'Not answered';
  if (item.type === 'text' || item.type === 'number') return String(value);
  return (Array.isArray(value) ? value : [value]).map(v => item.options.find(o => o.value === v)?.label || 'Unknown response').join('; ');
}
