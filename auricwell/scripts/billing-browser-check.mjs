// Synthetic insurance review only; every API request is intercepted.
import { chromium } from "../../node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const practice = (slug) => ({
  slug,
  name: slug === "second" ? "Second Practice" : "Synthetic Practice",
  actorType: "staff",
  permissions: ["billing"],
  timezone: "America/Denver",
  capabilities: { billing: true },
});
const coverage = (memberId) => ({
  sharedFingerprint: `version-${memberId}`,
  requiresConsolidation: false,
  source: "shared",
  data: {
    primary: {
      insurerName: "Synthetic carrier",
      payerId: "TEST",
      memberId,
      groupNumber: "Group A",
      subscriberFirstName: "Synthetic",
      subscriberLastName: "Subscriber",
      subscriberDob: "1980-01-01",
      subscriberSex: "U",
      subscriberAddressLine1: "1 Test St",
      subscriberCity: "Denver",
      subscriberState: "CO",
      subscriberPostalCode: "80202",
      relationshipToSubscriber: "child",
    },
    patient: {
      firstName: "Synthetic",
      lastName: "Patient",
      dateOfBirth: "2000-01-01",
      sex: "U",
      addressLine1: "1 Test St",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
    },
    secondary: { memberId: "PRESERVED-SECONDARY" },
    acceptAssignment: true,
  },
});
let current = coverage("SECOND"),
  saved,
  rejectSave = false,
  writes = 0;
await page.route("**/api/auricwell/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  let body = [],
    status = 200;
  if (path.endsWith("/bootstrap"))
    body = {
      account: { id: "owner", name: "Synthetic biller" },
      practices: [practice("champions"), practice("second")],
    };
  else if (path.endsWith("/workspace"))
    body = {
      practice: practice(path.includes("/second/") ? "second" : "champions"),
      patients: path.includes("/second/")
        ? []
        : [
            { id: "first", data: { name: "First synthetic patient" } },
            { id: "second", data: { name: "Second synthetic patient" } },
          ],
      providers: [],
      appointments: [],
      notes: [],
      billingNotes: [],
      claims: [],
      ledger: [],
      balances: {},
      messages: [],
    };
  else if (path.endsWith("/billing-setup"))
    body = { identity: {}, integrations: {} };
  else if (path.endsWith("/insurance")) {
    if (req.method() === "GET") {
      if (path.includes("/patients/first/")) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        body = coverage("FIRST");
      } else body = current;
    } else {
      writes++;
      saved = req.postDataJSON();
      if (rejectSave) {
        status = 409;
        body = {
          error: {
            message:
              "Insurance changed in the shared backend. Reload and review the current coverage before saving.",
          },
        };
      } else {
        current = {
          ...current,
          sharedFingerprint: "saved-version",
          requiresConsolidation: false,
          prototypeReview: null,
          data: {
            ...current.data,
            primary: saved.primary,
            patient: saved.patient,
          },
        };
        body = current;
      }
    }
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
});
try {
  await page.goto("http://127.0.0.1:5174/app/champions/billing");
  await page
    .getByRole("button", { name: "Open billing tools", exact: true })
    .click();
  const tools = page
    .locator("article.card")
    .filter({
      has: page.getByRole("heading", {
        name: "Billing configuration & review",
      }),
    });
  await tools.getByRole("button", { name: "insurance", exact: true }).click();
  await tools.getByRole("combobox", { name: "Patient", exact: true }).selectOption("first");
  await tools.getByText("Loading current coverage…").waitFor();
  assert.equal(await tools.getByLabel("Member ID", { exact: true }).count(), 0);
  await tools.getByRole("combobox", { name: "Patient", exact: true }).selectOption("second");
  await tools.getByLabel("Member ID", { exact: true }).waitFor();
  await page.waitForTimeout(500); // Let the earlier patient's deliberately delayed reply arrive.
  assert.equal(
    await tools.getByLabel("Member ID", { exact: true }).inputValue(),
    "SECOND",
  );
  assert.equal(
    await tools
      .getByLabel("I reviewed insurance and patient identity")
      .isChecked(),
    false,
  );
  await tools.getByLabel("Member ID", { exact: true }).fill("EDITED");
  await tools.getByLabel("I reviewed insurance and patient identity").check();
  await tools.getByRole("button", { name: "Save", exact: true }).click();
  await tools
    .getByText("Insurance review saved to the shared chart.")
    .waitFor();
  assert.equal(saved.sharedFingerprint, "version-SECOND");
  assert.equal(saved.primary.memberId, "EDITED");
  assert.equal(saved.secondary, undefined);
  assert.equal(writes, 1);
  assert.equal(
    await tools
      .getByLabel("I reviewed insurance and patient identity")
      .isChecked(),
    false,
  );
  rejectSave = true;
  await tools.getByLabel("I reviewed insurance and patient identity").check();
  await tools.getByRole("button", { name: "Save", exact: true }).click();
  await tools.getByRole("alert").waitFor();
  assert.match(await tools.getByRole("alert").innerText(), /Reload and review/);
  assert.equal(writes, 2);
  rejectSave = false;
  current = {
    ...coverage("LATEST"),
    requiresConsolidation: true,
    prototypeReview: coverage("EARLIER").data,
  };
  await tools
    .getByRole("button", { name: "Reload coverage", exact: true })
    .click();
  await tools
    .getByLabel(
      "I compared the earlier coverage and reviewed the shared policy to save",
    )
    .waitFor();
  assert.equal(
    await tools.getByLabel("Member ID", { exact: true }).inputValue(),
    "LATEST",
  );
  await tools.getByText("Earlier coverage for review").click();
  assert.match(await tools.locator("details").innerText(), /EARLIER/);
  await tools.getByLabel("I reviewed insurance and patient identity").check();
  await tools
    .getByLabel(
      "I compared the earlier coverage and reviewed the shared policy to save",
    )
    .check();
  await page.screenshot({
    path: "deliverables/auricwell-verification/insurance-review-desktop.png",
    fullPage: true,
  });
  await tools.getByRole("button", { name: "Save", exact: true }).click();
  await tools
    .getByText("Insurance review saved to the shared chart.")
    .waitFor();
  assert.equal(saved.consolidationReviewed, true);
  assert.equal(saved.sharedFingerprint, "version-LATEST");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "deliverables/auricwell-verification/insurance-review-mobile.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:5174/app/second/billing");
  await page.getByRole("heading", { name: "Billing & claims" }).waitFor();
  assert.equal(await page.getByLabel("Member ID", { exact: true }).count(), 0);
  assert.ok(!(await page.locator("main").innerText()).includes("LATEST"));
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "deliverables/auricwell-verification/billing-browser-result.json",
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        currentCoverageLoaded: true,
        stalePatientResponseIgnored: true,
        versionedSave: true,
        staleSaveRejected: true,
        explicitPrototypeReview: true,
        practiceIsolation: true,
        responsiveLayout: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Passed: shared insurance loading, patient/practice isolation, reviewed saves, stale versions, prototype review and mobile layout.",
  );
} catch (error) {
  console.error(errors, await page.locator('body').ariaSnapshot());
  throw error;
} finally {
  await browser.close();
}
