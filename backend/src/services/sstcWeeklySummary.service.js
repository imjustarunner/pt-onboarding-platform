/**
 * SSTC Weekly Summary Email Service
 *
 * Generates and sends a branded HTML weekly-summary email to a user
 * showing their personal stats, team stats, and full season rankings.
 *
 * Called manually (from the trigger endpoint) and later by a scheduled job.
 */
import pool from '../config/database.js';
import EmailService from './email.service.js';
import { toUploadsPublicUrl } from '../utils/uploads.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n, dec = 1) { return Number(n || 0).toFixed(dec); }

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}.`;
}

function accentOrDefault(hex) {
  if (hex && /^#[0-9a-fA-F]{3,6}$/.test(hex)) return hex;
  return '#ff6b35';
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildEmailHtml({
  userName, seasonName, clubName, weekLabel,
  primaryColor, bannerUrl, logoUrl,
  myStats, myTeamName, teamStats, rankings
}) {
  const accent = accentOrDefault(primaryColor);
  const logo = logoUrl || '';
  const banner = bannerUrl || '';

  const teamRankingRows = (rankings || []).map((t, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9f9f9'};">
      <td style="padding:10px 14px;font-weight:700;color:${accent};">${medal(i + 1)}</td>
      <td style="padding:10px 14px;font-weight:${t.teamName === myTeamName ? '700' : '400'};
                 color:${t.teamName === myTeamName ? accent : '#333'};">
        ${t.teamName}${t.teamName === myTeamName ? ' ⭐' : ''}
      </td>
      <td style="padding:10px 14px;text-align:right;">${t.totalPoints} pts</td>
      <td style="padding:10px 14px;text-align:right;">${fmt(t.totalMiles)} mi</td>
    </tr>
  `).join('');

  const teamStatRow = (label, val) =>
    `<tr><td style="padding:6px 0;color:#666;">${label}</td><td style="padding:6px 0;font-weight:700;text-align:right;">${val}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${seasonName} — Weekly Summary</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);">

        <!-- Banner -->
        ${banner ? `
        <tr>
          <td style="padding:0;height:160px;background:url('${banner}') center/cover no-repeat ${accent};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:24px 28px;background:rgba(0,0,0,.45);">
                ${logo ? `<img src="${logo}" alt="${clubName}" height="48" style="border-radius:50%;background:#fff;object-fit:cover;margin-bottom:10px;display:block;" />` : ''}
                <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${seasonName}</h1>
                <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:14px;">${weekLabel} — Weekly Summary</p>
              </td></tr>
            </table>
          </td>
        </tr>` : `
        <tr>
          <td style="padding:28px;background:${accent};">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${seasonName}</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:14px;">${weekLabel} — Weekly Summary</p>
          </td>
        </tr>`}

        <!-- Greeting -->
        <tr><td style="padding:28px 28px 0;background:#fff;">
          <p style="margin:0;font-size:16px;color:#333;">Hey <strong>${userName}</strong> 👋</p>
          <p style="margin:8px 0 0;font-size:14px;color:#555;line-height:1.6;">
            Here's a quick look at how your team and the season are progressing this week.
            Keep pushing — every mile counts!
          </p>
        </td></tr>

        <!-- My Stats -->
        <tr><td style="padding:20px 28px;background:#fff;">
          <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${accent};">My Stats This Week</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:33%;text-align:center;padding:14px 8px;background:${accent}15;border-radius:10px;margin:0 4px;">
                <div style="font-size:24px;font-weight:800;color:${accent};">${myStats.weeklyPoints}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;text-transform:uppercase;">Points</div>
              </td>
              <td style="width:4%;"></td>
              <td style="width:33%;text-align:center;padding:14px 8px;background:${accent}15;border-radius:10px;">
                <div style="font-size:24px;font-weight:800;color:${accent};">${fmt(myStats.weeklyMiles)} mi</div>
                <div style="font-size:11px;color:#888;margin-top:2px;text-transform:uppercase;">Miles</div>
              </td>
              <td style="width:4%;"></td>
              <td style="width:33%;text-align:center;padding:14px 8px;background:${accent}15;border-radius:10px;">
                <div style="font-size:24px;font-weight:800;color:${accent};">${myStats.weeklyWorkouts}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;text-transform:uppercase;">Workouts</div>
              </td>
            </tr>
          </table>
          <p style="margin:10px 0 0;font-size:12px;color:#aaa;text-align:right;">
            Season total: <strong>${myStats.totalPoints} pts · ${fmt(myStats.totalMiles)} mi · ${myStats.totalWorkouts} workouts</strong>
          </p>
        </td></tr>

        <!-- Team Stats -->
        ${myTeamName && teamStats ? `
        <tr><td style="padding:0 28px 20px;background:#fff;">
          <h2 style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${accent};">
            ${myTeamName} — This Week
          </h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #eee;">
            ${teamStatRow('Points this week', `${teamStats.weeklyPoints} pts`)}
            ${teamStatRow('Miles this week', `${fmt(teamStats.weeklyMiles)} mi`)}
            ${teamStatRow('Workouts this week', teamStats.weeklyWorkouts)}
            ${teamStatRow('Season total points', `${teamStats.totalPoints} pts`)}
            ${teamStatRow('Season total miles', `${fmt(teamStats.totalMiles)} mi`)}
          </table>
        </td></tr>` : ''}

        <!-- Divider -->
        <tr><td style="padding:0 28px;background:#fff;"><hr style="border:none;border-top:1px solid #eee;margin:0;" /></td></tr>

        <!-- Season Rankings -->
        <tr><td style="padding:20px 28px;background:#fff;">
          <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${accent};">Season Team Rankings</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border:1px solid #eee;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:${accent};color:#fff;">
                <th style="padding:10px 14px;text-align:left;font-weight:700;">#</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;">Team</th>
                <th style="padding:10px 14px;text-align:right;font-weight:700;">Points</th>
                <th style="padding:10px 14px;text-align:right;font-weight:700;">Miles</th>
              </tr>
            </thead>
            <tbody>${teamRankingRows}</tbody>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 28px;background:#f8f8f8;border-top:1px solid #eee;text-align:center;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              This is an automated weekly summary from <strong>${clubName}</strong>.<br />
              You can change your notification preferences in your account settings.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main send function ────────────────────────────────────────────────────────

/**
 * Send a weekly summary email to a single user for a given season + week.
 * @param {object} opts
 * @param {number} opts.userId
 * @param {number} opts.classId
 * @param {string} opts.weekStart  — ISO date string for the start of the week
 * @param {string} [opts.fromEmail] — override sender (tenant email)
 * @param {string} [opts.fromName]
 */
export async function sendWeeklySummaryEmail({ userId, classId, weekStart, fromEmail = null, fromName = null }) {
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, email FROM users WHERE id = ?`, [userId]
  );
  const user = userRows[0];
  if (!user?.email) return { sent: false, reason: 'no_email' };

  const [classRows] = await pool.execute(
    `SELECT c.*, a.name AS club_name, a.primary_color, a.notification_sender_email AS agency_sender_email
     FROM learning_program_classes c
     INNER JOIN agencies a ON a.id = c.organization_id
     WHERE c.id = ?`, [classId]
  );
  const cls = classRows[0];
  if (!cls) return { sent: false, reason: 'season_not_found' };

  // Week range (simple: 7-day window from weekStart)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  const weekLabel = `Week of ${weekStart}`;

  // User's team
  const [teamRow] = await pool.execute(
    `SELECT t.id AS team_id, t.team_name, t.logo_path AS team_logo
     FROM challenge_team_members m
     INNER JOIN challenge_teams t ON t.id = m.team_id
     WHERE m.provider_user_id = ? AND t.learning_class_id = ?
     LIMIT 1`, [userId, classId]
  );
  const myTeam = teamRow[0] || null;

  // My weekly + total stats
  const [myStatsRows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN w.completed_at >= ? AND w.completed_at < ? THEN w.points END), 0) AS weekly_points,
       COALESCE(SUM(CASE WHEN w.completed_at >= ? AND w.completed_at < ? THEN w.distance_value END), 0) AS weekly_miles,
       COALESCE(SUM(CASE WHEN w.completed_at >= ? AND w.completed_at < ? THEN 1 END), 0) AS weekly_workouts,
       COALESCE(SUM(w.points), 0) AS total_points,
       COALESCE(SUM(w.distance_value), 0) AS total_miles,
       COUNT(w.id) AS total_workouts
     FROM challenge_workouts w
     WHERE w.user_id = ? AND w.learning_class_id = ?
       AND (w.is_disqualified IS NULL OR w.is_disqualified=0)
       AND w.proof_status IN ('approved','not_required')`,
    [weekStart, weekEndStr, weekStart, weekEndStr, weekStart, weekEndStr, userId, classId]
  );
  const myStats = {
    weeklyPoints: Number(myStatsRows[0]?.weekly_points || 0),
    weeklyMiles: Number(myStatsRows[0]?.weekly_miles || 0),
    weeklyWorkouts: Number(myStatsRows[0]?.weekly_workouts || 0),
    totalPoints: Number(myStatsRows[0]?.total_points || 0),
    totalMiles: Number(myStatsRows[0]?.total_miles || 0),
    totalWorkouts: Number(myStatsRows[0]?.total_workouts || 0)
  };

  // Team weekly + total stats
  let teamStats = null;
  if (myTeam) {
    const [tRow] = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN w.completed_at >= ? AND w.completed_at < ? THEN w.points END), 0) AS weekly_points,
         COALESCE(SUM(CASE WHEN w.completed_at >= ? AND w.completed_at < ? THEN w.distance_value END), 0) AS weekly_miles,
         COALESCE(SUM(CASE WHEN w.completed_at >= ? AND w.completed_at < ? THEN 1 END), 0) AS weekly_workouts,
         COALESCE(SUM(w.points), 0) AS total_points,
         COALESCE(SUM(w.distance_value), 0) AS total_miles
       FROM challenge_workouts w
       WHERE w.team_id = ? AND w.learning_class_id = ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified=0)
         AND w.proof_status IN ('approved','not_required')`,
      [weekStart, weekEndStr, weekStart, weekEndStr, weekStart, weekEndStr, myTeam.team_id, classId]
    );
    teamStats = {
      weeklyPoints: Number(tRow[0]?.weekly_points || 0),
      weeklyMiles: Number(tRow[0]?.weekly_miles || 0),
      weeklyWorkouts: Number(tRow[0]?.weekly_workouts || 0),
      totalPoints: Number(tRow[0]?.total_points || 0),
      totalMiles: Number(tRow[0]?.total_miles || 0)
    };
  }

  // Full season team rankings
  const [rankRows] = await pool.execute(
    `SELECT t.team_name,
       COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0) AND w.proof_status IN ('approved','not_required') THEN w.points END),0) AS total_points,
       COALESCE(SUM(CASE WHEN (w.is_disqualified IS NULL OR w.is_disqualified=0) AND w.proof_status IN ('approved','not_required') THEN w.distance_value END),0) AS total_miles
     FROM challenge_teams t
     LEFT JOIN challenge_workouts w ON w.team_id = t.id AND w.learning_class_id = t.learning_class_id
     WHERE t.learning_class_id = ?
     GROUP BY t.id, t.team_name
     ORDER BY total_points DESC`, [classId]
  );
  const rankings = rankRows.map((r) => ({
    teamName: r.team_name,
    totalPoints: Number(r.total_points),
    totalMiles: Number(r.total_miles)
  }));

  const bannerUrl = cls.banner_image_path ? toUploadsPublicUrl(cls.banner_image_path) : null;
  const logoUrl = cls.logo_image_path ? toUploadsPublicUrl(cls.logo_image_path) : null;

  const html = buildEmailHtml({
    userName: user.first_name || user.email,
    seasonName: cls.class_name,
    clubName: cls.club_name,
    weekLabel,
    primaryColor: cls.primary_color || null,
    bannerUrl,
    logoUrl,
    myStats,
    myTeamName: myTeam?.team_name || null,
    teamStats,
    rankings
  });

  const effectiveFrom = fromEmail || cls.agency_sender_email || null;
  const effectiveName = fromName || cls.club_name || 'Summit Stats Team Challenge';

  await EmailService.sendEmail({
    to: user.email,
    subject: `${cls.class_name} — Your Weekly Summary (${weekLabel})`,
    html,
    fromAddress: effectiveFrom,
    fromName: effectiveName
  });

  return { sent: true };
}
