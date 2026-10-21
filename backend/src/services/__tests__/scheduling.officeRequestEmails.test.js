import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  db: vi.fn(),
  dbQuery: vi.fn(),
  release: vi.fn(),
  send: vi.fn(),
  user: vi.fn(),
  agencies: vi.fn(),
  find: vi.fn(),
  storage: vi.fn(),
  officeAgencies: vi.fn(),
}));
vi.mock("../../config/database.js", () => ({
  default: {
    execute: m.execute,
    query: m.query,
    getConnection: async () => ({
      execute: m.db,
      query: m.dbQuery,
      release: m.release,
    }),
  },
}));
vi.mock("../../models/User.model.js", () => ({
  default: { findById: m.user, getAgencies: m.agencies },
}));
vi.mock("../../models/OfficeLocationAgency.model.js", () => ({
  default: { listAgenciesForOffice: m.officeAgencies },
}));
vi.mock("../storage.service.js", () => ({
  default: { readObjectBuffer: m.storage },
}));
vi.mock("../meetingRecipientIdentity.service.js", () => ({
  resolveMeetingRecipient: async () => ({ email: "provider@example.test" }),
}));
vi.mock("../../utils/tenantMeetingUrl.js", () => ({
  tenantMeetingBase: async () => "https://app.example.test",
}));
vi.mock("../unifiedEmail/unifiedEmailSender.service.js", () => ({
  sendNotificationEmail: m.send,
}));
vi.mock("../officeApprovalWorkflow.service.js", () => ({
  findOfficeApproval: m.find,
}));
import {
  enqueueOfficeEmail,
  sendDueOfficeRequestEmails,
  queueOfficeRequestReview,
  officeDecisionSnapshot,
  officePhotoKey,
  enrichOfficeEmailItems,
} from "../officeRequestEmails.service.js";
import { validateOutboundEmailQuality } from "../outboundEmailQuality.service.js";
import {
  buildOfficeRequestEmail,
  officeReviewUrl,
} from "../officeRequestEmailContent.js";
const item = {
  key: "booking:4",
  officeId: 1,
  roomId: 10,
  providerId: 12,
  providerName: "Provider Example",
  officeName: "Windchime",
  roomLabel: "Office #10",
  startDate: "2026-11-02",
  slots: [{ startHour: 17, endHour: 19 }],
  timezone: "America/Denver",
  recurrence: "WEEKLY",
  frequencyLabel: "Weekly",
  action: "approve",
  sessions: [],
  roomRequest: true,
};
let rows, group;
beforeEach(() => {
  vi.resetAllMocks();
  group = { kind: "decision", agency_id: 2, user_id: 12 };
  rows = [1, 2, 3, 4, 5].map((id) => ({
    id,
    ...group,
    request_key: `booking:${id}`,
    ready_at: "2020-01-01 00:00:00",
    payload_json: { ...item, key: `booking:${id}` },
  }));
  m.execute.mockImplementation(async (sql) =>
    sql.includes("GROUP BY") ? [[group]] : [[]],
  );
  m.db.mockImplementation(async (sql) =>
    sql.includes("GET_LOCK")
      ? [[{ acquired: 1 }]]
      : sql.startsWith("SELECT *")
        ? [rows]
        : [{ affectedRows: 1 }],
  );
  m.dbQuery.mockResolvedValue([{ affectedRows: 1 }]);
  m.query.mockResolvedValue([[]]);
  m.user.mockResolvedValue({
    id: 12,
    first_name: "Pat",
    role: "provider",
    status: "ACTIVE_EMPLOYEE",
  });
  m.agencies.mockResolvedValue([{ id: 2 }]);
  m.send.mockResolvedValue({ id: "sent-1", communicationId: 22 });
});
it("sends five decisions together, with one branded-content email and records the same communication for all", async () => {
  await sendDueOfficeRequestEmails();
  expect(m.send).toHaveBeenCalledOnce();
  expect(m.send.mock.calls[0][0]).toMatchObject({
    triggerKey: "office_request_decision",
    agencyId: 2,
    userId: 12,
  });
  expect(m.send.mock.calls[0][0].subject).toContain("5 requests");
  expect(m.dbQuery).toHaveBeenCalledWith(
    expect.stringContaining("status='sent'"),
    [22, [1, 2, 3, 4, 5]],
  );
});
it("rechecks quiet period after taking the lock so an approval arriving now joins the batch", async () => {
  rows[4].ready_at = "2099-01-01 00:00:00";
  await sendDueOfficeRequestEmails();
  expect(m.send).not.toHaveBeenCalled();
});
it("does not send from a second replica while the first holds the lock", async () => {
  m.db.mockResolvedValue([[{ acquired: 0 }]]);
  await sendDueOfficeRequestEmails();
  expect(m.send).not.toHaveBeenCalled();
  expect(m.release).toHaveBeenCalled();
});
it("does not repeatedly queue messages held for email approval", async () => {
  m.send.mockResolvedValue({ pendingApproval: true, communicationId: 7 });
  await sendDueOfficeRequestEmails();
  expect(m.dbQuery).toHaveBeenCalledWith(
    expect.stringContaining("status='approval'"),
    [7, [1, 2, 3, 4, 5]],
  );
});
it("backs off an explicitly skipped send but holds an uncertain delivery instead of risking duplicates", async () => {
  m.send.mockResolvedValue({ skipped: true, reason: "notifications_disabled" });
  await sendDueOfficeRequestEmails();
  expect(m.dbQuery).toHaveBeenCalledWith(
    expect.stringContaining("INTERVAL 1 HOUR"),
    ["notifications_disabled", [1, 2, 3, 4, 5]],
  );
  m.send.mockRejectedValue(new Error("connection lost"));
  await sendDueOfficeRequestEmails();
  expect(m.dbQuery).toHaveBeenCalledWith(
    expect.stringContaining("status='needs_review'"),
    ["connection lost", [1, 2, 3, 4, 5]],
  );
});
it("drops mail if the recipient no longer belongs to the tenant", async () => {
  m.agencies.mockResolvedValue([{ id: 9 }]);
  await sendDueOfficeRequestEmails();
  expect(m.send).not.toHaveBeenCalled();
  expect(m.dbQuery).toHaveBeenCalledWith(
    expect.stringContaining("status='skipped'"),
    [[1, 2, 3, 4, 5]],
  );
});
it("suppresses reviewer emails for already-resolved requests", async () => {
  group.kind = "review";
  rows = rows.map((r) => ({ ...r, kind: "review" }));
  m.user.mockResolvedValue({ id: 12, role: "clinical_practice_assistant" });
  m.find.mockRejectedValue(
    Object.assign(new Error("Resolved"), { status: 404 }),
  );
  await sendDueOfficeRequestEmails();
  expect(m.send).not.toHaveBeenCalled();
});
it("routes to active CPAs in scope, once even if they share several agencies", async () => {
  m.officeAgencies.mockResolvedValue([{ id: 2 }, { id: 6 }]);
  m.agencies.mockResolvedValue([{ id: 2 }, { id: 6 }]);
  m.query.mockResolvedValue([
    [
      { id: 465, role: "clinical_practice_assistant", agency_id: 2 },
      { id: 465, role: "clinical_practice_assistant", agency_id: 6 },
      { id: 99, role: "provider", agency_id: 2 },
      {
        id: 100,
        role: "clinical_practice_assistant",
        agency_id: 2,
        is_active: 0,
      },
      {
        id: 101,
        role: "clinical_practice_assistant",
        agency_id: 2,
        is_archived: 1,
      },
      {
        id: 102,
        role: "clinical_practice_assistant",
        agency_id: 2,
        is_demo: 1,
      },
    ],
  ]);
  await queueOfficeRequestReview({
    source: "booking",
    id: 7,
    providerId: 12,
    officeId: 1,
  });
  expect(m.query.mock.calls[0][0]).toContain("ua.is_active=1");
  expect(m.query.mock.calls[0][0]).toContain("ola.office_location_id=?");
  expect(m.query.mock.calls[0][1]).toEqual([[2, 6], 1]);
  const inserts = m.db.mock.calls.filter(([s]) => s.startsWith("INSERT"));
  expect(inserts).toHaveLength(1);
  expect(inserts[0][1]).toEqual(["review", 2, 465, "booking:7", null, 60]);
});
it("duplicate hooks cannot reset the batch timer or replay an email", async () => {
  m.db.mockImplementation(async (sql) =>
    sql.includes("GET_LOCK") ? [[{ acquired: 1 }]] : [{ affectedRows: 0 }],
  );
  await enqueueOfficeEmail({
    kind: "decision",
    agencyId: 2,
    userId: 12,
    key: "booking:4",
    payload: item,
  });
  expect(m.db.mock.calls.some(([s]) => s.startsWith("UPDATE"))).toBe(false);
});
it("only confirms attached sessions backed by a booked office event and canonical appointment", async () => {
  m.query.mockResolvedValue([
    [{ start_at: "2026-11-03 00:30:00", end_at: "2026-11-03 01:30:00" }],
  ]);
  const snapshot = await officeDecisionSnapshot({
    request: { ...item, clientLinked: true },
    action: "approve",
    result: { event: { id: 15 } },
  });
  expect(m.query.mock.calls[0][0]).toContain("e.status='BOOKED'");
  expect(snapshot.sessions).toHaveLength(1);
  const empty = await officeDecisionSnapshot({
    request: { ...item, clientLinked: true },
    action: "approve",
  });
  expect(empty.sessions).toEqual([]);
});
it("shows precise local times and recurrence without treating a room as a confirmed session", () => {
  const content = buildOfficeRequestEmail({
    kind: "decision",
    items: [item],
    base: "https://app.example.test",
    name: "Pat",
  });
  expect(content.text).toContain("Monday, November 2, 2026");
  expect(content.text).toContain("5:00 PM–7:00 PM (America/Denver)");
  expect(content.text).toContain("Weekly");
  expect(content.text).toContain("until app session booking is enabled");
  expect(content.text).not.toContain("Confirmed:");
  const unconfirmed = buildOfficeRequestEmail({
    kind: "decision",
    items: [{ ...item, clientLinked: true }],
    base: "https://app.example.test",
  });
  expect(unconfirmed.text).toContain("has not been confirmed");
});
it("emails link directly into authenticated Building Master review and escape user content", () => {
  const url = new URL(officeReviewUrl("https://app.example.test", item));
  expect(url.pathname).toBe("/buildings/schedule");
  expect(url.searchParams.get("request")).toBe("booking:4");
  const content = buildOfficeRequestEmail({
    kind: "review",
    items: [{ ...item, providerName: "<script>bad</script>" }],
    base: "https://app.example.test",
  });
  expect(content.html).not.toContain("<script>");
  expect(content.html).toContain("border-radius:10px");
  expect(content.text).toContain(
    "approve, deny, or choose another available room",
  );
});
it("embeds hosted building and room photos without inflating each email with attachments", async () => {
  m.execute.mockResolvedValue([
    [
      {
        id: 10,
        office_name: "Windchime",
        street_address: "437 Windchime Place",
        room_number: 10,
        name: "Counseling",
        photo_url: "uploads/office_room_photos/room_10/photo.jpg",
        building_photo_url:
          "uploads/office_building_photos/building_1/photo.jpg",
      },
    ],
  ]);
  m.storage.mockResolvedValue(Buffer.from("image"));
  const items = [{ ...item }, { ...item }];
  await enrichOfficeEmailItems(items, {
    base: "https://app.example.test/agency",
  });
  expect(m.storage).not.toHaveBeenCalled();
  expect(items[0].roomPhoto).toBe(
    "https://app.example.test/api/uploads/office_room_photos/room_10/photo.jpg",
  );
  expect(items[0].buildingPhoto).toBe(
    "https://app.example.test/api/uploads/office_building_photos/building_1/photo.jpg",
  );
  const mail = buildOfficeRequestEmail({
    kind: "decision",
    items,
    base: "https://app.example.test",
  });
  expect(mail.html.match(/building_1\/photo.jpg/g)).toHaveLength(1);
  expect(mail.html).toContain('alt="Windchime"');
  expect(items[0].roomLabel).toContain("Office #10");
  expect(items[1].roomPhoto).toBe(items[0].roomPhoto);
});
it("never fetches arbitrary URLs, traversal paths, or another room’s photo", () => {
  expect(officePhotoKey("https://private.example/photo.jpg", 10)).toBeNull();
  expect(
    officePhotoKey("uploads/office_room_photos/room_11/photo.jpg", 10),
  ).toBeNull();
  expect(
    officePhotoKey("uploads/office_room_photos/room_10/../photo.jpg", 10),
  ).toBeNull();
  expect(
    officePhotoKey("/uploads/office_room_photos/room_10/photo.png", 10),
  ).toBeTruthy();
});

it("removes pending reviewer mail when a former CPA changes role", async () => {
  group.kind = "review";
  rows = rows.map((r) => ({ ...r, kind: "review" }));
  m.find.mockResolvedValue(item);
  await sendDueOfficeRequestEmails();
  expect(m.send).not.toHaveBeenCalled();
});
it("delivers pending requests to a current CPA with access", async () => {
  group.kind = "review";
  rows = rows.map((r) => ({ ...r, kind: "review" }));
  m.user.mockResolvedValue({
    id: 12,
    role: "clinical_practice_assistant",
    is_active: 1,
    is_archived: 0,
  });
  m.find.mockResolvedValue(item);
  await sendDueOfficeRequestEmails();
  expect(m.send).toHaveBeenCalledOnce();
  expect(m.send.mock.calls[0][0].triggerKey).toBe("office_request_review");
});
it("omits absent photos in production and labels preview placeholders and fictional data", () => {
  const args = {
    kind: "decision",
    items: [item],
    base: "https://app.example.test",
  };
  expect(buildOfficeRequestEmail(args).html).not.toContain("PHOTO PLACEHOLDER");
  const preview = buildOfficeRequestEmail({ ...args, preview: true });
  expect(preview.subject).toContain("PREVIEW");
  expect(preview.html).toContain("Nothing has been booked");
  expect(preview.html).toContain("Office interior photo");
  expect(
    officePhotoKey(
      "uploads/office_building_photos/building_2/photo.jpg",
      1,
      "building",
    ),
  ).toBeNull();
});

it("does not confuse linked appointments with missing file attachments", () => {
  for (const kind of ["review", "decision"]) {
    const mail = buildOfficeRequestEmail({
      kind,
      items: [
        {
          ...item,
          clientLinked: true,
          sessions: [
            { start: "2026-11-03T00:30:00Z", end: "2026-11-03T01:30:00Z" },
          ],
        },
      ],
      base: "https://app.example.test",
    });
    const result = validateOutboundEmailQuality({
      ...mail,
      templateType: "office_request_decision",
    });
    expect(result.flags.some((f) => f.code === "missing_attachment")).toBe(
      false,
    );
  }
});
