const workingSection = /^(?:session narrative|narriva compliance(?: review| results)?|compliance (?:review|results|checklist)|draft review results)$/i;

export function clinicalNoteRecordSections(sections = {}) {
  return Object.fromEntries(Object.entries(sections).filter(([title, value]) =>
    !workingSection.test(title.trim()) && typeof value === 'string' &&
    value.trim() && !/^Write this section[.…]*$/i.test(value.trim())
  ));
}

export function initialAssessmentDocumentationApplies(serviceCode, assessmentKind) {
  return ['90791', 'H0031'].includes(String(serviceCode || '').toUpperCase()) && assessmentKind !== 'additional';
}

export function intakeDocumentationStatement(supervised) {
  const supervision = supervised === true ? ' The provider disclosed that they practice under supervision.' : '';
  return 'The provider reviewed the disclosure agreement, provider education and supervision status, informed consent, and practice policies with the attending participant(s).' + supervision;
}

export function intakeObjectiveFirst(sections, documentationStatement = '') {
  const { 'Objective Content': objective, ...remaining } = sections;
  const content = [objective, objective?.includes(documentationStatement) ? '' : documentationStatement].filter(Boolean).join('\n\n');
  return content ? { 'Objective Content': content, ...remaining } : sections;
}
