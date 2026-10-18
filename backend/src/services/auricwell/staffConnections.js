import { readPracticeStaffIdentities } from "../practiceStaffIdentity.service.js";
import { owningAgency } from "./sharedPatients.js";
import {
  open,
  seal,
  decode,
  transaction,
  lockPractice,
  create,
  audit,
  findSource,
} from "./repository.js";
import { fail, hash, requirePermission, text, json } from "./policy.js";

async function authorize(ctx, db) {
  if (!ctx.profile?.operator)
    throw fail(403, "Shared staff connections require an operator.");
  requirePermission(ctx, "admin");
  const [[member]] = await db.execute(
    `SELECT m.permissions FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id
     WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND m.actor_type='staff' AND a.status='active' FOR SHARE`,
    [ctx.practiceId, ctx.accountId],
  );
  if (!member || !json(member.permissions, []).includes("admin"))
    throw fail(403, "Active practice administration permission is required.");
}
async function preview(ctx, accountId, input, db) {
  const userId = Number(input.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw fail(400, "Choose a shared staff ID.");
  const [[account]] = await db.execute(
    `SELECT a.*,m.actor_type,m.status membership_status,m.permissions FROM auricwell_accounts a
     JOIN auricwell_memberships m ON m.account_id=a.id WHERE m.practice_id=? AND a.id=? FOR UPDATE`,
    [ctx.practiceId, accountId],
  );
  if (!account || account.actor_type !== "staff")
    throw fail(404, "Staff account unavailable in this practice.");
  const profile = open(account.profile, `auricwell:account:${accountId}`);
  if (profile.operator)
    throw fail(
      409,
      "Platform operator accounts cannot be connected to a treating staff identity.",
    );
  if (account.canonical_user_id)
    throw fail(
      409,
      "This account already has a shared identity. Connections cannot be reassigned.",
    );
  const [[memberships]] = await db.execute(
    "SELECT COUNT(*) count FROM auricwell_memberships WHERE account_id=?",
    [accountId],
  );
  if (Number(memberships.count) !== 1)
    throw fail(
      409,
      "Multi-practice accounts require a separate identity review before connection.",
    );
  const agencyId = await owningAgency(ctx, db);
  const [target] = await readPracticeStaffIdentities(agencyId, [userId], db, {
    lock: true,
  });
  if (!target)
    throw fail(404, "Shared staff identity unavailable in this practice.");
  const [[used]] = await db.execute(
    "SELECT id FROM auricwell_accounts WHERE canonical_user_id=?",
    [userId],
  );
  if (used)
    throw fail(409, "This shared identity already has an AuricWell account.");
  const [rows] = await db.execute(
    "SELECT * FROM auricwell_records WHERE practice_id=? AND kind='provider' ORDER BY id FOR UPDATE",
    [ctx.practiceId],
  );
  const providers = rows
    .map(decode)
    .filter((r) => r.data.accountId === accountId);
  const review = {
    agencyId,
    account: {
      id: accountId,
      username: account.username,
      name: profile.name,
      status: account.status,
      membershipStatus: account.membership_status,
      permissions: json(account.permissions, []),
    },
    target,
    providers: providers.map((r) => ({
      id: r.id,
      name: r.data.name,
      revision: r.revision,
      sourceHash: hash(JSON.stringify(r.data)),
    })),
  };
  return {
    review: { ...review, previewHash: hash(JSON.stringify(review)) },
    providers,
  };
}
export async function previewStaffConnection(ctx, accountId, input) {
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    await authorize(ctx, db);
    return (await preview(ctx, accountId, input, db)).review;
  });
}
export async function connectStaffIdentity(ctx, accountId, input) {
  if (input.reviewed !== true || !input.previewHash)
    throw fail(400, "Review the exact staff identity before connecting it.");
  const key = text(input.idempotencyKey, "Request identifier", 100);
  const commandHash = hash(
    JSON.stringify({
      accountId,
      userId: Number(input.userId),
      previewHash: input.previewHash,
    }),
  );
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    await authorize(ctx, db);
    const previous = await findSource(ctx, "staff_connection_command", key, db);
    if (previous) {
      if (previous.data.commandHash !== commandHash)
        throw fail(409, "This request identifier has already been used.");
      return previous.data.result;
    }
    const { review, providers } = await preview(ctx, accountId, input, db);
    if (review.previewHash !== input.previewHash)
      throw fail(
        409,
        "The staff identity or access changed. Review a fresh preview.",
      );
    const [changed] = await db.execute(
      "UPDATE auricwell_accounts SET canonical_user_id=? WHERE id=? AND canonical_user_id IS NULL",
      [review.target.userId, accountId],
    );
    if (!changed.affectedRows)
      throw fail(409, "This identity changed. Review again.");
    for (const provider of providers) {
      await create(
        ctx,
        "staff_identity_archive",
        {
          providerId: provider.id,
          previousRevision: provider.revision,
          original: provider.data,
          canonicalUserId: review.target.userId,
        },
        { sourceKey: provider.id },
        db,
      );
      const { name, ...data } = provider.data;
      // Identity review does not approve clinical credentials or payer enrollment.
      data.credentialsReviewed = false;
      delete data.reviewedSharedCredential;
      await db.execute(
        "UPDATE auricwell_records SET payload=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE practice_id=? AND kind='provider' AND id=?",
        [
          seal(data, `auricwell:${ctx.practiceId}:provider:${provider.id}`),
          ctx.practiceId,
          provider.id,
        ],
      );
    }
    const result = {
      accountId,
      canonicalUserId: review.target.userId,
      agencyId: review.agencyId,
      providers: providers.map((r) => r.id),
    };
    await audit(
      ctx,
      "staff.shared_connection_reviewed",
      accountId,
      { ...result, previewHash: input.previewHash },
      db,
    );
    await create(
      ctx,
      "staff_connection_command",
      { commandHash, result },
      { sourceKey: key },
      db,
    );
    return result;
  });
}
