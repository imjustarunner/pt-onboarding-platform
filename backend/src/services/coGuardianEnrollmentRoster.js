const name = child => String(child?.fullName || child?.full_name || [child?.firstName, child?.middleName, child?.lastName].filter(Boolean).join(' ')).trim().replace(/\s+/g, ' ').toLowerCase();
const dob = child => {
  const value = child?.dateOfBirth || child?.date_of_birth || '';
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
};

// Answers are persisted per child index. Require the complete invitation roster
// in the same order so an answer cannot silently move to a sibling's chart.
export function assertInvitedEnrollmentChildren(invited, children, answers = null) {
  const fail = () => { throw Object.assign(new Error('This invitation covers only the children listed by the inviting parent. Please reopen your latest invitation to restore their details. Contact the care team to enroll another child.'), { status: 400, statusCode: 400 }); };
  if (!Array.isArray(children) || children.length !== invited.length || !invited.length) fail();
  if (Array.isArray(answers) && answers.length !== invited.length) fail();
  children.forEach((child, index) => {
    const expected = invited[index];
    const id = child?.clientId ?? child?.id;
    if (id != null && Number(id) !== Number(expected.id)) fail();
    // Older saved enrollments have no client ID. Verify their identifying data
    // too; supplying the right ID does not authorize changing the child.
    if (name(child) !== name(expected) || dob(child) !== dob(expected)) fail();
  });
}
