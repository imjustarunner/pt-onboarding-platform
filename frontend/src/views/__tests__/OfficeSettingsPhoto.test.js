import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { officeId: "1" } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../store/auth", () => ({
  useAuthStore: () => ({
    user: { id: 465, role: "clinical_practice_assistant" },
  }),
}));
vi.mock("../../services/api", () => ({
  default: { get: m.get, post: m.post, delete: m.remove },
}));
import OfficeSettings from "../OfficeSettingsView.vue";
beforeEach(() => {
  vi.resetAllMocks();
  m.get.mockImplementation(async (url) => ({
    data:
      url === "/offices/1"
        ? { id: 1, name: "Windchime", timezone: "America/Denver", agencies: [] }
        : [],
  }));
  m.post.mockResolvedValue({
    data: {
      building_photo_url: "uploads/office_building_photos/building_1/photo.jpg",
    },
  });
  m.remove.mockResolvedValue({ data: { building_photo_url: null } });
});
it("lets a CPA upload and remove a building photo through the selected building settings", async () => {
  const w = mount(OfficeSettings, {
    global: {
      stubs: {
        KioskBuildingSelector: true,
        OfficeKioskAccessSettings: true,
        OfficeRoomPhotoButton: true,
        OfficeRoomPhotoGalleryModal: true,
      },
    },
  });
  await flushPromises();
  const input = w.find(".building-photo-upload input");
  expect(input.exists()).toBe(true);
  Object.defineProperty(input.element, "files", {
    value: [new File(["image"], "building.jpg", { type: "image/jpeg" })],
  });
  await input.trigger("change");
  await flushPromises();
  expect(m.post.mock.calls[0][0]).toBe("/offices/1/photo");
  expect(m.post.mock.calls[0][1].get("photo").name).toBe("building.jpg");
  expect(w.find(".building-photo-preview").attributes("src")).toContain(
    "building_1/photo.jpg",
  );
  await w.find(".building-photo-editor button").trigger("click");
  await flushPromises();
  expect(m.remove).toHaveBeenCalledWith("/offices/1/photo");
  expect(w.find(".building-photo-preview").exists()).toBe(false);
  w.unmount();
});
