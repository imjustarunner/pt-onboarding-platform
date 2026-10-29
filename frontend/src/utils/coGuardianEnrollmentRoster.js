const fullName = child => String(child?.fullName || [child?.firstName, child?.middleName, child?.lastName].filter(Boolean).join(' ')).trim().replace(/\s+/g, ' ').toLowerCase();

export function restoreInvitedChildren(dependents, savedClients = [], savedAnswers = []) {
  const used = new Set();
  const answers = [];
  const clients = dependents.map(dep => {
    let index = savedClients.findIndex((child, i) => !used.has(i) && Number(child.clientId || child.id) === Number(dep.id));
    if (index < 0) index = savedClients.findIndex((child, i) => !used.has(i) && fullName(child) === fullName(dep)
      && String(child.dateOfBirth || '').slice(0, 10) === String(dep.dateOfBirth || '').slice(0, 10));
    if (index >= 0) used.add(index);
    answers.push(index >= 0 ? { ...(savedAnswers[index] || {}) } : {});
    return { ...(index >= 0 ? savedClients[index] : {}), clientId: dep.id,
      firstName: dep.firstName || '', middleName: '', lastName: dep.lastName || '', dateOfBirth: dep.dateOfBirth || '' };
  });
  // Preserve accidental additions privately in the saved draft, outside the
  // submitted roster. They must not create a client or inherit a signature.
  const excluded = savedClients.flatMap((child, index) => used.has(index) ? [] : [{ child, answers: savedAnswers[index] || {} }]);
  return { clients, answers, excluded };
}

export function sameInvitedSigningChildren(left, right) {
  const meaningful = rows => (rows || []).filter(child => child?.fullName || child?.dateOfBirth);
  return JSON.stringify(meaningful(left)) === JSON.stringify(meaningful(right));
}
