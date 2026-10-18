// Run as a scheduled job. No detached work in HTTP handlers; status survives restarts.
import { pool, open, decode } from "../services/auricwell/repository.js";
import { parseBatch } from "../services/auricwell/imports.js";
import { json } from "../services/auricwell/policy.js";
import clinicalPool from "../config/clinicalDatabase.js";
try {
  let cursor = "";
  while (true) {
    const [rows] = await pool.execute(
      "SELECT r.*,p.settings,p.name,p.slug FROM auricwell_records r JOIN auricwell_practices p ON p.id=r.practice_id WHERE r.kind='import' AND r.id>? ORDER BY r.id LIMIT 100",
      [cursor],
    );
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id;
      const batch = decode(row);
      if (
        batch.data.status !== "queued" &&
        !(
          batch.data.status === "processing" &&
          Date.now() - Date.parse(batch.data.processingAt) > 30 * 60000
        )
      )
        continue;
      const settings = open(
        row.settings,
        `auricwell:practice:${row.practice_id}`,
      );
      if (!settings.capabilities?.imports || !settings.phiActivatedAt) continue;
      const [[member]] = await pool.execute(
        "SELECT m.permissions,m.actor_type FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND a.status='active'",
        [row.practice_id, batch.data.uploadedBy],
      );
      if (!member || !json(member.permissions, []).includes("migration"))
        continue;
      await parseBatch(
        {
          practiceId: row.practice_id,
          accountId: batch.data.uploadedBy,
          actorType: member.actor_type,
          permissions: json(member.permissions, []),
          settings,
        },
        row.id,
      );
    }
  }
} catch (e) {
  console.error("[auricwell-worker]", e.code || e.name);
  process.exitCode = 1;
} finally {
  // Shared validation helpers load this second pool even when no clinical query runs.
  // Close both pools so a scheduled native job exits when its queue is drained.
  await Promise.all([pool.end(), clinicalPool.end()]);
}
