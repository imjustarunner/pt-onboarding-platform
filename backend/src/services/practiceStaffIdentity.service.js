import crypto from "node:crypto";
import User from "../models/User.model.js";
import { isStaffAccount } from "../utils/staffEligibility.js";

// Caller supplies an authorized practice context. The model independently
// enforces agency membership; product permission is never inferred from a role.
export async function readPracticeStaffIdentities(
  agencyId,
  ids,
  db,
  { lock = false } = {},
) {
  return (
    await User.findIdentitiesForAgency(ids, agencyId, { executor: db, lock })
  )
    .filter(isStaffAccount)
    .map((row) => ({
      userId: Number(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      identityProduct: row.identity_product,
      credential: row.credential || "",
      active:
        !!row.membership_active &&
        !!row.is_active &&
        !row.is_archived &&
        ["ACTIVE", "ACTIVE_EMPLOYEE", "EHR_ONLY"].includes(
          String(row.status || "").toUpperCase(),
        ),
      fingerprint: crypto
        .createHash("sha256")
        .update(JSON.stringify(row))
        .digest("hex"),
    }));
}

export async function updatePracticeStaffIdentity(agencyId, userId, input, db) {
  const [current] = await readPracticeStaffIdentities(agencyId, [userId], db, {
    lock: "update",
  });
  const fail = (status, message) =>
    Object.assign(new Error(message), { status });
  if (!current) throw fail(404, "Staff identity unavailable in this practice.");
  if (current.identityProduct !== "auricwell_ehr")
    throw fail(
      409,
      "Update this existing full-suite identity through its shared staff profile.",
    );
  const [[memberships]] = await db.execute(
    "SELECT COUNT(*) count FROM user_agencies WHERE user_id=?",
    [userId],
  );
  if (Number(memberships.count) !== 1)
    throw fail(
      409,
      "This staff identity spans practices and needs a coordinated identity review.",
    );
  if (current.fingerprint !== input.sharedFingerprint)
    throw fail(409, "Staff details changed. Refresh before saving.");
  const firstName = String(input.firstName || "").trim(),
    lastName = String(input.lastName || "").trim(),
    credential = String(input.credential || "").trim();
  if (
    !firstName ||
    firstName.length > 100 ||
    lastName.length > 100 ||
    credential.length > 100
  )
    throw fail(400, "Review staff name and credential lengths.");
  await User.updateClinicalIdentity(
    userId,
    agencyId,
    { firstName, lastName, credential },
    { executor: db },
  );
  return (await readPracticeStaffIdentities(agencyId, [userId], db))[0];
}
