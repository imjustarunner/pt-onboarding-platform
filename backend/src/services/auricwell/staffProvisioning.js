import User from "../../models/User.model.js";
import { owningAgency } from "./sharedPatients.js";
import { open, audit } from "./repository.js";
import { fail } from "./policy.js";

// Call inside the account/practice transaction. This creates a shared person,
// never a full-suite login or an employment/onboarding assignment.
export async function provisionStaffIdentity(ctx, accountId, db) {
  const [[account]] = await db.execute(
    `SELECT a.* FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id
     WHERE m.practice_id=? AND a.id=? AND m.actor_type='staff' FOR UPDATE`,
    [ctx.practiceId, accountId],
  );
  if (!account) throw fail(404, "Staff account unavailable in this practice.");
  if (account.canonical_user_id) return Number(account.canonical_user_id);
  const profile = open(account.profile, `auricwell:account:${accountId}`);
  if (profile.operator)
    throw fail(409, "Operators do not receive treating staff identities.");
  const [[memberships]] = await db.execute(
    "SELECT COUNT(*) count FROM auricwell_memberships WHERE account_id=?",
    [accountId],
  );
  if (Number(memberships.count) !== 1)
    throw fail(
      409,
      "Review this multi-practice staff identity before creating a shared record.",
    );
  const agencyId = await owningAgency(ctx, db);
  const user = await User.createClinicalIdentity(profile, { executor: db });
  await db.execute(
    "INSERT INTO user_agencies (user_id,agency_id,is_active) VALUES (?,?,TRUE)",
    [user.id, agencyId],
  );
  await db.execute(
    "UPDATE auricwell_accounts SET canonical_user_id=? WHERE id=?",
    [user.id, accountId],
  );
  await audit(
    ctx,
    "staff.shared_identity_created",
    accountId,
    { canonicalUserId: user.id, agencyId, identityProduct: "auricwell_ehr" },
    db,
  );
  return user.id;
}
