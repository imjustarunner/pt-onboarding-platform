// Responses are already stored at the top level. Duplicating them inside the
// snapshot doubles card images and signatures and can exceed the request limit.
export function compactIntakeProgress(data) {
  if (!data?.responses || !data?.progressSnapshot) return data;
  const snapshot = { ...data.progressSnapshot };
  delete snapshot.intakeResponses;
  return { ...data, progressSnapshot: snapshot };
}

export function restoreIntakeProgressSnapshot(data) {
  if (!data?.progressSnapshot) return null;
  return { ...data.progressSnapshot, intakeResponses: data.progressSnapshot.intakeResponses || data.responses || null };
}
