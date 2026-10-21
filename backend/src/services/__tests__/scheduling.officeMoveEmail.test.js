import { it, expect, vi } from "vitest";
import { queueOfficeMoveReceipt } from "../officeMoveEmail.service.js";
import { buildOfficeRequestEmail } from "../officeRequestEmailContent.js";
it("queues one receipt with before/after, reason and occurrence scope inside the move transaction", async () => {
  const db = {
    execute: vi.fn(async (sql) =>
      sql.startsWith("SELECT r.id")
        ? [
            [
              {
                id: 7,
                room_number: 7,
                name: "Counseling",
                office_id: 1,
                office_name: "Windchime",
                agency_id: 2,
              },
              {
                id: 10,
                room_number: 10,
                name: "Counseling",
                office_id: 1,
                office_name: "Windchime",
                agency_id: 2,
              },
            ],
          ]
        : [{ affectedRows: 1 }],
    ),
  };
  await queueOfficeMoveReceipt(db, {
    source: {
      id: 11,
      room_id: 7,
      booked_provider_id: 22,
      booking_agency_id: 2,
      start_at: "2026-11-03 20:00:00",
      end_at: "2026-11-03 21:00:00",
    },
    newRoomId: 10,
    startAt: "2026-11-04 21:00:00",
    endAt: "2026-11-04 22:00:00",
    scope: "occurrence",
    timeZone: "America/Denver",
    reason: "Provider requested this time",
    actorUserId: 1,
  });
  const call = db.execute.mock.calls.find(([sql]) => sql.startsWith("INSERT"));
  const item = JSON.parse(call[1][3]);
  expect(item.previous).toContain("Office #7");
  expect(item.roomLabel).toContain("Office #10");
  expect(item.slots).toEqual([{ startHour: 14, endHour: 15 }]);
  const email = buildOfficeRequestEmail({
    kind: "decision",
    items: [item],
    base: "https://example.test",
    name: "Pat",
  });
  expect(email.text).toContain("This occurrence only");
  expect(email.text).toContain("Provider requested this time");
  expect(email.text).not.toContain("Not approved");
});
it("fails the transaction instead of silently moving without a notification destination", async () => {
  const db = { execute: vi.fn(async () => [[]]) };
  await expect(
    queueOfficeMoveReceipt(db, { source: { room_id: 7 }, newRoomId: 10 }),
  ).rejects.toThrow("No reservation was moved");
});
