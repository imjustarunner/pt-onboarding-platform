import { describe, it, expect, vi } from "vitest";
vi.mock("../../config/database.js", () => ({ default: {} }));
vi.mock("../officeSlotSeries.service.js", () => ({
  loadOfficeSlotInventory: vi.fn(async () => ({
    events: [],
    assignments: [],
    plans: [],
    legacy: [],
  })),
  validateOfficeSlotSeries: vi.fn(async () => ({ ok: true })),
}));
import {
  rankOfficeRooms,
  roomCategory,
  overlappingRequest,
  allocateOfficeRoom,
} from "../officeRoomAllocation.service.js";
import {
  loadOfficeSlotInventory,
  validateOfficeSlotSeries,
} from "../officeSlotSeries.service.js";
const rooms = [
  { id: 7, name: "Counseling Office", timezone: "America/Denver" },
  { id: 4, name: "Counseling Office", timezone: "America/Denver" },
  { id: 1, name: "Play/Counseling Office" },
  { id: 12, name: "Tutoring Room" },
];
const window = {
  officeId: 1,
  providerId: 10,
  startDate: "2026-11-03",
  startHour: 13,
  endHour: 15,
  recurrence: "WEEKLY",
  occurrenceCount: 6,
};
function database(pending = []) {
  return {
    execute: vi.fn(async (sql) => {
      if (sql.startsWith("SELECT r.*")) return [rooms];
      if (sql.includes("MAX(start_at)"))
        return [[{ room_id: 7, last_used: "2026-10-20" }]];
      if (sql.includes("FROM office_booking_requests")) return [pending];
      return [[]];
    }),
  };
}
describe("automatic room matching", () => {
  it("prefers a previously used counseling office and excludes specialty rooms", () =>
    expect(
      rankOfficeRooms(rooms, [{ room_id: 7, last_used: "2026-10-20" }], {}).map(
        (r) => r.id,
      ),
    ).toEqual([7, 4]));
  it("never treats Play/Counseling as a general counseling fallback", () =>
    expect(roomCategory(rooms[2])).toBe("play"));
  it("recognizes existing room-type tags without a second room-type system", () =>
    expect(roomCategory({ name: "Office 7", type_names: "Therapy Room" })).toBe(
      "counseling",
    ));
  it("respects an explicitly selected specialty room", () =>
    expect(rankOfficeRooms(rooms, [], { roomId: 12 }).map((r) => r.id)).toEqual(
      [12],
    ));
  it("finds overlapping weekly requests with different anchor weeks (Chase case)", () =>
    expect(
      overlappingRequest(window, { ...window, startDate: "2026-10-27" }),
    ).toBe(true));
  it("allows adjacent hours and alternating weeks", () => {
    expect(
      overlappingRequest(window, { ...window, startHour: 15, endHour: 16 }),
    ).toBe(false);
    expect(
      overlappingRequest(
        { ...window, recurrence: "BIWEEKLY" },
        { ...window, startDate: "2026-11-10", recurrence: "BIWEEKLY" },
      ),
    ).toBe(false);
  });
  it("rejects a repeat submission before choosing another room", async () => {
    const db = database([
      {
        id: 30,
        requested_provider_id: 10,
        room_id: 7,
        start_at: "2026-11-03 20:00:00",
        end_at: "2026-11-03 22:00:00",
        recurrence: "WEEKLY",
        booked_occurrence_count: 6,
      },
    ]);
    await expect(allocateOfficeRoom(db, window)).rejects.toMatchObject({
      code: "ALREADY_REQUESTED",
      requestKey: "booking:30",
    });
  });
  it("holds the selected room against another pending request and chooses the next suitable office", async () => {
    const db = database([
      {
        id: 30,
        requested_provider_id: 99,
        room_id: 7,
        start_at: "2026-11-03 20:00:00",
        end_at: "2026-11-03 22:00:00",
        recurrence: "WEEKLY",
        booked_occurrence_count: 6,
      },
    ]);
    expect(await allocateOfficeRoom(db, window)).toMatchObject({ roomId: 4 });
  });
  it("returns an exception instead of falling back to play/tutoring rooms", async () => {
    validateOfficeSlotSeries
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    await expect(allocateOfficeRoom(database(), window)).rejects.toMatchObject({
      code: "NO_SUITABLE_OFFICE",
    });
  });
});
it("persists an automatically selected office when the input explicitly has no room", async () => {
  expect(
    await allocateOfficeRoom(database(), { ...window, roomId: null }),
  ).toMatchObject({ roomId: 7 });
});
it("preserves an open-ended request anchored more than two years ago", () => {
  expect(
    overlappingRequest(
      { ...window, occurrenceCount: null },
      { ...window, startDate: "2023-10-31", occurrenceCount: null },
    ),
  ).toBe(true);
});
it("rejects off-hour requests instead of silently truncating the minutes", async () => {
  await expect(
    allocateOfficeRoom(database(), {
      ...window,
      startAt: "2026-11-03 20:30:00",
      endAt: "2026-11-03 21:30:00",
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("recognizes counseling by type after office titles are standardized", () => {
  expect(
    roomCategory({ name: "Office #7", type_names: "Counseling Office" }),
  ).toBe("counseling");
  expect(
    roomCategory({
      name: "Office #11",
      type_names: "Counseling Office,Play Room",
    }),
  ).toBe("play");
});
it("respects holds submitted through the older floorplan interface", async () => {
  const db = database();
  const base = db.execute.getMockImplementation();
  db.execute.mockImplementation((sql) =>
    sql.includes("FROM office_room_requests")
      ? Promise.resolve([
          [
            {
              id: 4,
              user_id: 99,
              room_id: 7,
              start_at: "2026-11-03 20:00:00",
              end_at: "2026-11-03 22:00:00",
              request_type: "ONE_TIME",
            },
          ],
        ])
      : base(sql),
  );
  expect(await allocateOfficeRoom(db, window)).toMatchObject({ roomId: 4 });
});

it("selects a room that can pass CPA ownership review instead of holding another provider’s assignment", async () => {
  loadOfficeSlotInventory.mockResolvedValueOnce({
    events: [],
    plans: [],
    legacy: [],
    assignments: [{ room_id: 7, weekday: 2, hour: 13, provider_id: 99 }],
  });
  expect(await allocateOfficeRoom(database(), window)).toMatchObject({
    roomId: 4,
  });
});
