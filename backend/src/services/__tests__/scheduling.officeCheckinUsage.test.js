import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock("../../config/database.js", () => ({ default: m }));
vi.mock("../officeScheduleMaterializer.service.js", () => ({
  default: { invalidateOffice: vi.fn() },
}));
import {
  consecutiveUnusedOfficeOccurrences,
  UNUSED_OFFICE_OCCURRENCES,
  runOfficeCheckinUsageReviews,
} from "../officeCheckinUsage.service.js";
const rows = Array.from({ length: 6 }, (_, i) => ({
  start_at: `2026-11-${String(3 + i).padStart(2, "0")} 20:00:00`,
  checked_in: 0,
  linked_appointment: 0,
}));
it("uses six actual occurrences, deduplicating hourly copies of the same date", () => {
  expect(UNUSED_OFFICE_OCCURRENCES).toBe(6);
  expect(consecutiveUnusedOfficeOccurrences([...rows, ...rows])).toBe(6);
});
it("a check-in resets the consecutive run", () =>
  expect(
    consecutiveUnusedOfficeOccurrences(
      rows.map((r, i) => ({ ...r, checked_in: i === 3 ? 1 : 0 })),
    ),
  ).toBe(2));
it("a linked or documented appointment protects a slot even if the kiosk was not used", () =>
  expect(
    consecutiveUnusedOfficeOccurrences(
      rows.map((r, i) => ({ ...r, linked_appointment: i === 5 ? 1 : 0 })),
    ),
  ).toBe(0));
it("excuses cancellations, recorded no-shows and office holidays", () =>
  expect(
    consecutiveUnusedOfficeOccurrences(
      rows.map((r, i) => ({
        ...r,
        status_outcome: i === 4 ? "CANCELLED" : i === 5 ? "NO_SHOW" : null,
      })),
      { holidays: ["2026-11-03"] },
    ),
  ).toBe(3));

const assignment = {
  id: 7,
  provider_id: 22,
  office_location_id: 1,
  booking_agency_id: 2,
  timezone: "America/Denver",
  feature_flags: {},
  has_external_feed: 0,
};
function usageDatabase(events = []) {
  const db = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(async (sql) => {
      if (sql.startsWith("SELECT * FROM office_standing_assignments"))
        return [[assignment]];
      if (sql.startsWith("SELECT * FROM office_assignment_checkin_usage"))
        return [
          [
            {
              monitoring_started_at: "2026-11-01 00:00:00",
              downgraded_at: null,
            },
          ],
        ];
      if (sql.includes("FROM office_events e WHERE")) return [events];
      if (sql.includes("FROM agency_holidays")) return [[]];
      if (sql.includes("FROM office_booking_plans"))
        return [
          [
            { id: 1, session_context_json: null },
            { id: 2, session_context_json: { clientId: 99 } },
          ],
        ];
      return [{ affectedRows: 1 }];
    }),
  };
  m.execute.mockResolvedValue([[assignment]]);
  m.getConnection.mockResolvedValue(db);
  return db;
}
beforeEach(() => vi.clearAllMocks());
it("starts monitoring now and never counts pre-existing historical missing check-ins", async () => {
  const db = usageDatabase();
  const result = await runOfficeCheckinUsageReviews();
  expect(result).toMatchObject({ monitored: 1, downgraded: 0, errors: [] });
  expect(
    db.execute.mock.calls.some(([sql]) =>
      sql.startsWith("INSERT IGNORE INTO office_assignment_checkin_usage"),
    ),
  ).toBe(true);
  const query = db.execute.mock.calls.find(([sql]) =>
    sql.includes("FROM office_events e WHERE"),
  );
  expect(query[1]).toContain("2026-11-01 00:00:00");
  expect(
    db.execute.mock.calls.some(([sql]) =>
      sql.startsWith("UPDATE office_events"),
    ),
  ).toBe(false);
  expect(db.commit).toHaveBeenCalled();
});
it("downgrades six unused occurrences while retaining the assignment and clinical records", async () => {
  const db = usageDatabase(rows);
  const result = await runOfficeCheckinUsageReviews();
  expect(result).toMatchObject({ monitored: 1, downgraded: 1, errors: [] });
  expect(db.execute).toHaveBeenCalledWith(
    "UPDATE office_booking_plans SET is_active=0 WHERE id=?",
    [1],
  );
  expect(db.execute).not.toHaveBeenCalledWith(
    "UPDATE office_booking_plans SET is_active=0 WHERE id=?",
    [2],
  );
  const sql = db.execute.mock.calls.find(([sql]) =>
    sql.startsWith("UPDATE office_events"),
  )[0];
  expect(sql).toContain("e.slot_state='ASSIGNED_AVAILABLE'");
  expect(sql).toContain("e.booking_plan_id=NULL");
  expect(sql).toContain("ap.id IS NULL");
  expect(sql).toContain("e.clinical_session_id IS NULL");
  expect(
    db.execute.mock.calls.some(
      ([sql]) =>
        sql.startsWith("DELETE") ||
        sql.startsWith("UPDATE office_standing_assignments"),
    ),
  ).toBe(false);
});
it("skips the missing-checkin policy for app EHR-enabled providers", async () => {
  for (const extra of [
    {
      feature_flags: {
        clientSessionBookingRollout: {
          entries: [{ providerUserId: 22, enabled: true }],
        },
      },
    },
  ]) {
    const db = usageDatabase(rows);
    m.execute.mockResolvedValue([[{ ...assignment, ...extra }]]);
    expect(await runOfficeCheckinUsageReviews()).toMatchObject({
      monitored: 0,
      downgraded: 0,
      errors: [],
    });
    expect(
      db.execute.mock.calls.some(([sql]) =>
        sql.startsWith("UPDATE office_events"),
      ),
    ).toBe(false);
  }
});

it("does not mistake a personal calendar feed for EHR integration", async () => {
  usageDatabase(rows);
  m.execute.mockResolvedValue([[{ ...assignment, has_external_feed: 1 }]]);
  expect(await runOfficeCheckinUsageReviews()).toMatchObject({
    monitored: 1,
    downgraded: 1,
    errors: [],
  });
});
