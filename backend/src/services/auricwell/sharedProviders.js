import { readPracticeStaffIdentities } from "../practiceStaffIdentity.service.js";
import { owningAgency } from "./sharedPatients.js";
import pool from "../../config/database.js";
import { json } from "./policy.js";

export async function staffIdentity(ctx, accountId, db, { lock = false } = {}) {
  const [[account]] = await db.execute(
    `SELECT a.canonical_user_id FROM auricwell_accounts a
     JOIN auricwell_memberships m ON m.account_id=a.id
     WHERE m.practice_id=? AND a.id=? AND m.actor_type='staff'${lock ? " FOR SHARE" : ""}`,
    [ctx.practiceId, accountId],
  );
  if (!account?.canonical_user_id) return null;
  const [identity] = await readPracticeStaffIdentities(
    await owningAgency(ctx, db),
    [account.canonical_user_id],
    db,
    { lock },
  );
  return (
    identity || {
      userId: Number(account.canonical_user_id),
      active: false,
      name: "Unavailable staff identity",
      credential: "",
      fingerprint: null,
    }
  );
}

// Raw provider snapshots retain clinical configuration until that domain is
// consolidated. Linked display identities are always read from shared users.
export async function hydrateProviders(ctx, records, db) {
  if (!records.length) return records;
  // Keep a linked identity distinguishable from an unconnected prototype even
  // after product membership is removed. Missing access must fail closed.
  const accountIds = [
    ...new Set(records.map((r) => r.data.accountId).filter(Boolean)),
  ];
  const accounts = [];
  for (let i = 0; i < accountIds.length; i += 500) {
    const chunk = accountIds.slice(i, i + 500);
    const [rows] = await db.execute(
      `SELECT a.id,a.canonical_user_id,a.status account_status,m.status membership_status,m.actor_type,m.permissions
       FROM auricwell_accounts a LEFT JOIN auricwell_memberships m ON m.account_id=a.id AND m.practice_id=?
       WHERE a.id IN (${chunk.map(() => "?").join(",")}) AND a.canonical_user_id IS NOT NULL${db !== pool ? " FOR SHARE" : ""}`,
      [ctx.practiceId, ...chunk],
    );
    accounts.push(...rows);
  }
  const links = new Map(
    accounts.map((a) => [a.id, Number(a.canonical_user_id)]),
  );
  const active = new Set(
    accounts
      .filter(
        (a) =>
          a.account_status === "active" &&
          a.membership_status === "active" &&
          a.actor_type === "staff" &&
          json(a.permissions, []).includes("clinical"),
      )
      .map((a) => a.id),
  );
  const ids = [
    ...new Set(records.map((r) => links.get(r.data.accountId)).filter(Boolean)),
  ];
  if (!ids.length) return records;
  const agencyId = await owningAgency(ctx, db),
    identities = new Map();
  for (let i = 0; i < ids.length; i += 500)
    for (const identity of await readPracticeStaffIdentities(
      agencyId,
      ids.slice(i, i + 500),
      db,
      { lock: db !== pool },
    ))
      identities.set(identity.userId, identity);
  return records.map((record) => {
    const userId = links.get(record.data.accountId);
    if (!userId) return record;
    const identity = identities.get(userId);
    return {
      ...record,
      canonicalUserId: userId,
      sharedFingerprint: identity?.fingerprint || null,
      data: {
        ...record.data,
        name: identity?.name || "Unavailable staff identity",
        sharedIdentityActive:
          identity?.active === true && active.has(record.data.accountId),
        sharedCredential: identity?.credential || "",
        credentialMappingCurrent:
          !!identity &&
          record.data.reviewedSharedCredential === identity.credential,
      },
    };
  });
}
export async function providerMetadata(ctx, data, db) {
  const identity = await staffIdentity(ctx, data.accountId, db);
  const {
    sharedIdentityActive,
    sharedCredential,
    credentialMappingCurrent,
    ...metadata
  } = data;
  if (identity) delete metadata.name;
  return metadata;
}
