// Called inside the authorized resend transaction, before delivering the link.
// A corrected recipient must never receive the previous recipient's answers.
export async function renewInvitedGuardianDraft(db, { invite, recipient, expiresAt }) {
  if (String(recipient).trim().toLowerCase() !== String(invite.invited_email).trim().toLowerCase()) {
    // Keep the previous answers for authorized review, but revoke their return
    // links when this invitation is redirected to a different person.
    await db.execute(`UPDATE intake_submissions SET session_token=NULL
      WHERE co_guardian_invite_id=? AND status IN ('started','consented') AND submitted_at IS NULL`, [invite.id]);
    return null;
  }
  const [rows] = await db.execute(`SELECT s.id,s.session_token FROM intake_submissions s
    JOIN intake_links l ON l.id=s.intake_link_id
    WHERE s.co_guardian_invite_id=? AND l.public_key=?
      AND s.status IN ('started','consented') AND s.submitted_at IS NULL
      AND s.session_token IS NOT NULL AND s.session_token<>''
    ORDER BY s.updated_at DESC,s.id DESC LIMIT 1 FOR UPDATE`, [invite.id, invite.public_key]);
  const draft = rows[0];
  if (!draft) return null;
  await db.execute(`UPDATE intake_submissions SET draft_expires_at=?,retention_expires_at=?
    WHERE id=? AND co_guardian_invite_id=? AND submitted_at IS NULL`, [expiresAt, expiresAt, draft.id, invite.id]);
  return draft.session_token;
}
