// Client behavior only: all API traffic is intercepted and all data is synthetic.
import { chromium } from "../../node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let role = "staff",
  questionnaire,
  record,
  history = [],
  createdChart,
  acceptBody;
const capabilities = Object.fromEntries(
  [
    "clients",
    "schedule",
    "documentation",
    "billing",
    "messages",
    "portal",
    "imports",
    "intake",
  ].map((c) => [c, true]),
);
const existing = {
  id: "existing",
  data: { name: "Synthetic Client", dob: "2000-01-01", status: "active" },
};
const practice = () => ({
  id: "practice",
  slug: "champions",
  name: "Synthetic Practice",
  actorType: role === "staff" ? "staff" : "guardian",
  permissions:
    role === "staff" ? ["admin", "clinical", "schedule", "agreements"] : [],
  capabilities,
});
const summary = () => ({
  ...record,
  canRead: role === "staff",
  canReview: role === "staff",
  canRespond: role !== "staff",
  data: { ...record.data, questionnaireName: record.data.snapshot.name },
});
await page.route("**/api/auricwell/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const method = route.request().method();
  let body = [];
  if (path.endsWith("/bootstrap"))
    body = {
      account: {
        id: role === "staff" ? "owner" : "guardian",
        name: role === "staff" ? "Synthetic Owner" : "Synthetic Guardian",
      },
      practices: [
        practice(),
        {
          ...practice(),
          id: "second",
          slug: "second",
          name: "Second Practice",
        },
      ],
    };
  else if (path.endsWith("/workspace"))
    body = {
      practice: {
        ...practice(),
        ...(path.includes("/second/")
          ? { slug: "second", name: "Second Practice" }
          : {}),
      },
      patients:
        role === "staff"
          ? [existing, ...(createdChart ? [createdChart] : [])]
          : [],
      providers: [],
      notes: [],
      billingNotes: [],
      messages: [],
      ledger: [],
      claims: [],
      appointments: [],
      balances: {},
    };
  else if (path.endsWith("/settings"))
    body = {
      revision: 1,
      settings: {
        onboardingMode: "new",
        capabilities,
        services: [],
        locations: [],
        practice: {},
      },
      readiness: { checks: [] },
    };
  else if (path.endsWith("/intake-templates")) {
    if (method === "POST") {
      questionnaire = {
        id: "questionnaire",
        revision: 1,
        data: route.request().postDataJSON(),
      };
      body = questionnaire;
    } else body = questionnaire ? [questionnaire] : [];
  } else if (path.endsWith("/intake-options"))
    body = {
      respondents: [
        {
          id: "guardian",
          name: "Synthetic Guardian",
          actorType: "guardian",
          status: "active",
          patientIds: [],
        },
      ],
      reviewers: [{ id: "owner", name: "Synthetic Owner" }],
    };
  else if (path.endsWith("/intakes")) {
    if (method === "POST") {
      const input = route.request().postDataJSON();
      assert.equal(input.authorityReviewed, true);
      assert.equal(input.templateRevision, 1);
      record = {
        id: "intake",
        revision: 1,
        patientId: null,
        data: {
          ...input,
          snapshot: questionnaire.data,
          status: "assigned",
          demographics: {},
          answers: {},
          submissionNumber: 0,
        },
      };
      body = summary();
    } else body = record && !path.includes("/second/") ? [summary()] : [];
  } else if (path.endsWith("/intakes/intake/answers")) {
    const input = route.request().postDataJSON();
    assert.equal(input.revision, record.revision);
    record.data.demographics = input.demographics;
    record.data.answers = input.answers;
    record.data.status = input.action === "submit" ? "submitted" : "draft";
    record.revision++;
    if (input.action === "submit") {
      assert.equal(input.reviewed, true);
      record.data.submissionNumber++;
      record.data.submissionHash = `submitted-${record.data.submissionNumber}`;
      history.push({
        id: record.data.submissionHash,
        data: structuredClone({
          ...record.data,
          submittedAt: "2026-09-29T12:00:00Z",
        }),
      });
    }
    body = {
      id: record.id,
      revision: record.revision,
      status: record.data.status,
    };
  } else if (path.endsWith("/intakes/intake/review")) {
    const input = route.request().postDataJSON();
    assert.equal(input.reviewed, true);
    assert.equal(input.revision, record.revision);
    assert.equal(input.submissionHash, record.data.submissionHash);
    record.revision++;
    if (input.action === "return") {
      record.data.status = "needs_changes";
      record.data.feedback = input.reason;
    } else {
      assert.equal(input.matchingReviewed, true);
      acceptBody = input;
      createdChart = {
        id: "new-chart",
        data: { ...record.data.demographics, status: "active" },
      };
      record.data.status = "accepted";
      record.data.acceptedPatientId = createdChart.id;
    }
    body = { acceptedPatientId: createdChart?.id };
  } else if (path.endsWith("/intakes/intake/history")) body = history;
  else if (path.endsWith("/intakes/intake")) body = summary();
  await route.fulfill({ json: body });
});
const visit = async (as) => {
  role = as;
  await page.goto("http://127.0.0.1:5174/app/champions/intake");
  await page.getByRole("button", { name: /Synthetic new client/ }).click();
};
try {
  await page.goto("http://127.0.0.1:5174/app/champions/settings");
  await page
    .getByRole("button", { name: "New questionnaire", exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Getting started");
  await page
    .getByLabel("Instructions for patients")
    .fill("Please share your goals for care.");
  await page
    .getByLabel("Label", { exact: true })
    .fill("What would you like help with?");
  await page
    .getByRole("button", { name: "Save template version", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit questionnaire", exact: true })
    .waitFor();
  await page.goto("http://127.0.0.1:5174/app/champions/intake");
  await page
    .getByRole("button", { name: "Assign intake", exact: true })
    .click();
  await page
    .getByLabel("Questionnaire", { exact: true })
    .selectOption("questionnaire");
  await page
    .getByLabel("Patient / intake label", { exact: true })
    .fill("Synthetic new client");
  await page
    .getByLabel("Person completing the form", { exact: true })
    .selectOption("guardian");
  await page
    .getByLabel("Clinical reviewer", { exact: true })
    .selectOption("owner");
  await page
    .getByLabel("Respondent capacity", { exact: true })
    .fill("Verified guardian");
  await page
    .getByLabel("Identity and authority review reference")
    .fill("Synthetic identity review");
  await page.getByLabel(/I verified this account/).check();
  await page
    .getByRole("button", { name: "Assign form in app", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Intake assigned" })
    .waitFor();

  await visit("guardian");
  await page
    .getByLabel("Patient full name", { exact: true })
    .fill("Synthetic Client");
  await page
    .getByLabel("Patient birth date", { exact: true })
    .fill("2000-01-01");
  await page
    .getByLabel("What would you like help with?", { exact: true })
    .fill("Original synthetic goals");
  await page
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Progress saved" })
    .waitFor();
  await visit("guardian");
  assert.equal(
    await page
      .getByLabel("What would you like help with?", { exact: true })
      .inputValue(),
    "Original synthetic goals",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page
    .getByLabel("Patient full name", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "deliverables/auricwell-verification/intake-patient-mobile.png",
  });
  await page.getByLabel(/I reviewed these answers/).check();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Intake submitted" })
    .waitFor();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit("staff");
  await page.getByText(/Possible existing charts/).waitFor();
  await page
    .getByLabel("Review explanation", { exact: true })
    .fill("Please clarify your goals.");
  await page.getByLabel(/I reviewed this submitted version/).check();
  await page
    .getByRole("button", { name: "Request corrections", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Corrections requested" })
    .waitFor();
  await visit("guardian");
  await page
    .getByLabel("What would you like help with?", { exact: true })
    .fill("Clarified synthetic goals");
  await page.getByLabel(/I reviewed these answers/).check();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Intake submitted" })
    .waitFor();
  await visit("staff");
  await page.getByRole("button", { name: "View submitted versions" }).click();
  await page.locator("summary").filter({ hasText: "Submission 1" }).click();
  await page.getByText("Original synthetic goals", { exact: true }).waitFor();
  await page
    .getByLabel("Review explanation", { exact: true })
    .fill(
      "Identity and potential matching charts reviewed; create a distinct test chart.",
    );
  await page.getByLabel(/I reviewed existing charts/).check();
  await page.getByLabel(/I reviewed this submitted version/).check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "deliverables/auricwell-verification/intake-review-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Accept reviewed intake", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Intake reviewed" })
    .waitFor();
  assert.equal(acceptBody.patientId, null);
  assert.equal(history.length, 2);
  await visit("guardian");
  assert.equal(
    await page.getByRole("button", { name: "Submit for review" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Accept reviewed intake" }).count(),
    0,
  );
  await page.getByRole("link", { name: /Practices/ }).click();
  await page.getByRole("link", { name: /Second Practice/ }).click();
  await page.getByRole("link", { name: "Intake forms", exact: true }).click();
  await page.getByText("No intake forms assigned.", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Clarified synthetic goals", { exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "deliverables/auricwell-verification/intake-browser-result.json",
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        assignment: true,
        resumableResponse: true,
        corrections: true,
        versionHistory: true,
        reviewedChartCreation: true,
        practiceIsolation: true,
        widths: [1440, 390],
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Passed: questionnaire setup, assignment, guardian save/resume/submit, corrections, history, clinical review, practice isolation and mobile layout.",
  );
} catch (error) {
  await page.screenshot({
    path: "deliverables/auricwell-verification/intake-browser-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("main").innerText()).slice(0, 3000));
  throw error;
} finally {
  await browser.close();
}
