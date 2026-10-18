import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./api.js";
test("API uses the product namespace, same-origin cookies and mutation header", async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ saved: true }) };
  };
  try {
    assert.deepEqual(
      await api("/practices/example/settings", {
        method: "PUT",
        body: { onboardingMode: "new" },
      }),
      { saved: true },
    );
    assert.equal(request.url, "/api/auricwell/practices/example/settings");
    assert.equal(request.options.credentials, "same-origin");
    assert.equal(request.options.headers["X-AuricWell"], "1");
    assert.equal(JSON.parse(request.options.body).onboardingMode, "new");
  } finally {
    globalThis.fetch = original;
  }
});
test("API propagates authorization failure rather than returning a success-shaped object", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: "Practice access required." } }),
  });
  try {
    await assert.rejects(
      api("/practices/other/workspace"),
      (e) => e.status === 403 && e.message === "Practice access required.",
    );
  } finally {
    globalThis.fetch = original;
  }
});
