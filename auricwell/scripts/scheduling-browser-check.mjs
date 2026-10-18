// Synthetic client behavior only. Every API request is intercepted.
import { chromium } from "../../node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "Asia/Tokyo",
});
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let role = "staff",
  visits = [],
  previewBody,
  committed = 0,
  requested = false,
  optionsRequests = 0;
const patient = {
  id: "client",
  data: { name: "Synthetic Client", careTeam: ["owner"] },
};
const provider = {
  id: "clinician",
  data: {
    accountId: "owner",
    name: "Synthetic Clinician",
    credential: "LPC",
    jurisdiction: "CO",
    status: "active",
    credentialsReviewed: true,
    services: ["90837"],
    locations: ["Office"],
  },
};
const practice = (slug) => ({
  slug,
  name: slug === "second" ? "Second Practice" : "Synthetic Practice",
  actorType: role,
  permissions: role === "staff" ? ["schedule"] : [],
  timezone: "America/Denver",
  capabilities: { schedule: true, portal: true },
});
await page.route("**/api/auricwell/**", async (route) => {
  const request = route.request(),
    path = new URL(request.url()).pathname,
    input = request.method() === "GET" ? null : request.postDataJSON();
  const second = path.includes("/second/");
  let body = [];
  if (path.endsWith("/bootstrap"))
    body = {
      account: { id: "owner", name: "Synthetic User" },
      practices: [practice("champions"), practice("second")],
    };
  else if (path.endsWith("/workspace"))
    body = {
      practice: practice(second ? "second" : "champions"),
      patients: second ? [] : [patient],
      providers: second ? [] : [provider],
      appointments: second ? [] : visits,
      appointmentRequests: [],
      notes: [],
      billingNotes: [],
      messages: [],
      claims: [],
      ledger: [],
      balances: {},
    };
  else if (path.endsWith("/scheduling-options")) {
    optionsRequests++;
    body = {
      timezone: "America/Denver",
      providers: [provider],
      services: [{ code: "90837", name: "Therapy" }],
      locations: ["Office"],
    };
  } else if (path.endsWith("/appointment-series/preview")) {
    previewBody = input;
    const items =
      input.action === "create"
        ? [0, 1, 2].map((i) => ({
            id: null,
            sequence: i,
            data: {
              ...input,
              start: [
                "2027-03-01T16:00:00.000Z",
                "2027-03-08T16:00:00.000Z",
                "2027-03-15T15:00:00.000Z",
              ][i],
              end: [
                "2027-03-01T17:00:00.000Z",
                "2027-03-08T17:00:00.000Z",
                "2027-03-15T16:00:00.000Z",
              ][i],
              status: "scheduled",
            },
          }))
        : visits
            .filter((v) => !v.data.seriesException)
            .map((v) => ({
              id: v.id,
              sequence: v.data.seriesSequence,
              data: { ...v.data, status: "cancelled" },
            }));
    body = {
      action: input.action,
      timezone: "America/Denver",
      visits: items,
      skipped:
        input.action === "cancel"
          ? visits
              .filter((v) => v.data.seriesException)
              .map((v) => ({
                id: v.id,
                start: v.data.start,
                reason: "Individually changed appointment",
              }))
          : [],
      issues: [],
      previewHash: "exact-preview",
    };
  } else if (path.endsWith("/appointment-series")) {
    assert.equal(input.reviewed, true);
    assert.equal(input.previewHash, "exact-preview");
    assert.ok(input.idempotencyKey);
    committed++;
    if (input.action === "create")
      visits = [0, 1, 2].map((i) => ({
        id: `visit-${i}`,
        canonicalAppointmentId: i + 1,
        sharedFingerprint: `shared-visit-${i}`,
        revision: 1,
        patientId: "client",
        data: {
          ...previewBody,
          providerAccountId: "owner",
          seriesId: "series",
          seriesSequence: i,
          start: [
            "2027-03-01T16:00:00.000Z",
            "2027-03-08T16:00:00.000Z",
            "2027-03-15T15:00:00.000Z",
          ][i],
          end: [
            "2027-03-01T17:00:00.000Z",
            "2027-03-08T17:00:00.000Z",
            "2027-03-15T16:00:00.000Z",
          ][i],
          status: "scheduled",
        },
      }));
    else
      visits = visits.map((v) =>
        v.data.seriesException
          ? v
          : {
              ...v,
              revision: v.revision + 1,
              data: { ...v.data, status: "cancelled" },
            },
      );
    body = {
      seriesId: "series",
      appointmentIds: visits
        .filter((v) => !v.data.seriesException)
        .map((v) => v.id),
      skipped: visits.filter((v) => v.data.seriesException),
    };
  } else if (path.includes("/appointments/")) {
    const v = visits.find((v) => v.id === path.split("/").at(-1));
    assert.ok(v);
    assert.equal(input.revision, v.revision);
    assert.equal(input.sharedFingerprint, v.sharedFingerprint);
    v.revision++;
    v.data = { ...v.data, status: input.status, seriesException: true };
    body = v;
  } else if (path.endsWith("/appointment-requests")) {
    assert.equal(input.patientId, "client");
    requested = true;
    body = { id: "request" };
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
});
try {
  await page.goto("http://127.0.0.1:5174/app/champions/schedule");
  await page.getByRole("heading", { name: "Schedule", exact: true }).waitFor();
  assert.match(await page.locator("main").innerText(), /America\/Denver/);
  await page.getByRole("button", { name: "New appointment" }).click();
  await page
    .getByRole("combobox", { name: "Client", exact: true })
    .selectOption("client");
  await page
    .getByRole("combobox", { name: "Service", exact: true })
    .selectOption("90837");
  await page
    .getByRole("combobox", { name: "Location", exact: true })
    .selectOption("Office");
  await page.getByLabel("Date and time").fill("2027-03-01T09:00");
  await page
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("clinician");
  await page
    .getByRole("combobox", { name: "Repeat", exact: true })
    .selectOption("1");
  await page.getByLabel("Number of visits").fill("3");
  await page.getByRole("button", { name: "Preview series" }).click();
  await page.getByRole("heading", { name: "Review 3 visits" }).waitFor();
  assert.equal(previewBody.localStart, "2027-03-01T09:00");
  assert.equal(
    await page
      .getByRole("button", { name: "Save reviewed series" })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .locator(".series-preview li")
      .filter({ hasText: "9:00 AM" })
      .count(),
    3,
  );
  await page.getByLabel("I reviewed these visits.").check();
  await page.getByRole("button", { name: "Save reviewed series" }).click();
  await page
    .getByText("3 visits saved. 0 preserved.", { exact: true })
    .waitFor();
  assert.equal(committed, 1);
  await page
    .getByRole("combobox", { name: "View", exact: true })
    .selectOption("month");
  await page.getByLabel("Calendar date").fill("2027-03-01");
  assert.equal(await page.locator(".calendar-visit").count(), 3);
  await page
    .locator(".calendar-visit")
    .nth(1)
    .getByRole("button", { name: "Manage" })
    .click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("confirmed");
  await page
    .getByRole("button", { name: "Save appointment", exact: true })
    .click();
  await page.getByText("Appointment saved.", { exact: true }).waitFor();
  await page
    .locator(".calendar-visit")
    .first()
    .getByRole("button", { name: "Manage" })
    .click();
  await page
    .getByRole("combobox", { name: "Change scope", exact: true })
    .selectOption("cancel");
  await page.getByRole("button", { name: "Preview series" }).click();
  await page.getByRole("heading", { name: "Review 2 cancellations" }).waitFor();
  assert.match(
    await page.locator(".series-preview").innerText(),
    /Individually changed/,
  );
  await page.getByLabel("I reviewed these cancellations.").check();
  await page.getByRole("button", { name: "Confirm cancellations" }).click();
  await page
    .getByText("2 visits cancelled. 1 preserved.", { exact: true })
    .waitFor();
  assert.equal(committed, 2);
  await fs.mkdir("deliverables/auricwell-verification", { recursive: true });
  await page.screenshot({
    path: "deliverables/auricwell-verification/calendar-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "View", exact: true })
    .selectOption("week");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator(".calendar-grid").scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({
    path: "deliverables/auricwell-verification/calendar-mobile.png",
  });
  await page.getByRole("button", { name: "New appointment" }).click();
  await page
    .getByRole("combobox", { name: "Client", exact: true })
    .selectOption("client");
  await page.goto("http://127.0.0.1:5174/app/second/schedule");
  await page.getByRole("heading", { name: "Schedule", exact: true }).waitFor();
  assert.equal(await page.locator(".editor").count(), 0);
  assert.equal(await page.locator(".calendar-visit").count(), 0);
  assert.ok(
    !(await page.locator("main").innerText()).includes("Synthetic Client"),
  );
  role = "guardian";
  const priorOptions = optionsRequests;
  await page.goto("http://127.0.0.1:5174/app/champions/schedule");
  await page.getByRole("button", { name: "Request appointment" }).click();
  assert.equal(optionsRequests, priorOptions);
  assert.equal(
    await page.getByRole("combobox", { name: "Provider", exact: true }).count(),
    0,
  );
  await page
    .getByRole("combobox", { name: "Client", exact: true })
    .selectOption("client");
  await page
    .getByLabel("Preferred times and details")
    .fill("Monday morning, please.");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.getByText("Appointment request sent.", { exact: true }).waitFor();
  assert.equal(requested, true);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "deliverables/auricwell-verification/scheduling-browser-result.json",
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        practiceTimezone: true,
        reviewedRecurrence: true,
        individualException: true,
        futureCancellation: true,
        practiceIsolation: true,
        guardianRequest: true,
        responsiveLayout: true,
        sharedAppointmentVersionSubmitted: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Calendar browser checks passed: practice timezone despite Tokyo device, reviewed recurrence, individual exception, future cancellation, practice switch, guardian request and responsive layout.",
  );
} catch (error) {
  console.error(errors, await page.locator("main").ariaSnapshot());
  throw error;
} finally {
  await browser.close();
}
