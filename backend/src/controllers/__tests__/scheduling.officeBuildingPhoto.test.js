import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
const m = vi.hoisted(() => ({
  execute: vi.fn(),
  office: vi.fn(),
  agencies: vi.fn(),
  access: vi.fn(),
  save: vi.fn(),
}));
vi.mock("../../config/database.js", () => ({
  default: { execute: m.execute },
}));
vi.mock("../../models/OfficeLocation.model.js", () => ({
  default: { findById: m.office },
}));
vi.mock("../../models/OfficeLocationAgency.model.js", () => ({
  default: { userHasAccess: m.access },
}));
vi.mock("../../models/User.model.js", () => ({
  default: { getAgencies: m.agencies },
}));
vi.mock("../../services/storage.service.js", () => ({
  default: { saveOfficeBuildingPhoto: m.save },
}));
vi.mock("../../services/googleCalendar.service.js", () => ({ default: {} }));
vi.mock("../../services/officeKioskAccess.service.js", () => ({}));
import { updateBuildingPhoto } from "../officeSettings.controller.js";
const req = () => ({
  method: "POST",
  user: { id: 465, role: "clinical_practice_assistant" },
  params: { officeId: "1" },
  file: { buffer: Buffer.from("invalid") },
});
const response = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});
beforeEach(() => {
  vi.resetAllMocks();
  m.execute.mockResolvedValue([[]]);
  m.agencies.mockResolvedValue([{ id: 2 }]);
  m.access.mockResolvedValue(true);
  m.office.mockResolvedValue({ id: 1, is_active: 1 });
  m.save.mockResolvedValue({
    relativePath: "uploads/office_building_photos/building_1/new.jpg",
  });
});
it("allows an authorized CPA to upload an optimized building photo", async () => {
  const request = req(),
    res = response(),
    next = vi.fn();
  request.file.buffer = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#98ac8d" },
  })
    .png()
    .toBuffer();
  await updateBuildingPhoto(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.access).toHaveBeenCalledWith({
    officeLocationId: 1,
    agencyIds: [2],
  });
  const saved = await sharp(m.save.mock.calls[0][1]).metadata();
  expect(saved.format).toBe("jpeg");
  expect(saved.width).toBeLessThanOrEqual(1400);
  expect(saved.height).toBeLessThanOrEqual(1000);
  expect(saved.exif).toBeUndefined();
  expect(m.execute).toHaveBeenCalledWith(
    "UPDATE office_locations SET building_photo_url=? WHERE id=?",
    ["uploads/office_building_photos/building_1/new.jpg", 1],
  );
});
it("rejects a CPA without access to this building", async () => {
  m.access.mockResolvedValue(false);
  const res = response();
  await updateBuildingPhoto(req(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(m.save).not.toHaveBeenCalled();
  expect(m.execute).not.toHaveBeenCalled();
});
it("rejects a provider without management rights", async () => {
  const request = req(),
    res = response();
  request.user.role = "provider";
  await updateBuildingPhoto(request, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(m.save).not.toHaveBeenCalled();
});
it("rejects unreadable image bytes before storage or database changes", async () => {
  const res = response();
  await updateBuildingPhoto(req(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(m.save).not.toHaveBeenCalled();
  expect(m.execute).not.toHaveBeenCalled();
});
it("removes the current image without deleting assets used by earlier email receipts", async () => {
  const request = req(),
    res = response();
  request.method = "DELETE";
  await updateBuildingPhoto(request, res, vi.fn());
  expect(m.execute).toHaveBeenCalledWith(
    "UPDATE office_locations SET building_photo_url=? WHERE id=?",
    [null, 1],
  );
  expect(m.save).not.toHaveBeenCalled();
});
it("does not attach a separate photo to a billing identity", async () => {
  m.office.mockResolvedValue({
    id: 1,
    is_active: 1,
    physical_office_location_id: 8,
  });
  const res = response();
  await updateBuildingPhoto(req(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(m.save).not.toHaveBeenCalled();
});
