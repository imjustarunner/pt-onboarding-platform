// Synthetic UI test: every API request is intercepted; never uses production data.
import { chromium } from "../../node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const perms = [
  "admin",
  "clinical",
  "schedule",
  "billing",
  "supervise",
  "agreements",
  "migration",
];
const practice = {
  id: "synthetic-practice",
  slug: "champions",
  name: "Champions · Synthetic",
  actorType: "staff",
  permissions: perms,
  capabilities: Object.fromEntries(
    [
      "clients",
      "schedule",
      "documentation",
      "billing",
      "messages",
      "portal",
      "imports",
    ].map((k) => [k, true]),
  ),
};
const patient = {
  id: "synthetic-patient",
  revision: 1,
  canonicalClientId: 101,
  sharedFingerprint: "synthetic-shared-version",
  data: {
    name: "Synthetic Patient",
    dob: "2000-01-01",
    status: "active",
    careTeam: ["synthetic-owner"],
  },
};
const provider = {
  id: "synthetic-provider",
  revision: 1,
  data: {
    name: "Synthetic Clinician",
    accountId: "synthetic-owner",
    credential: "LPC",
    status: "active",
    credentialsReviewed: true,
    services: ["90837"],
    locations: ["Office"],
  },
};
const notes = [
  {
    id: "draft-one",
    revision: 1,
    patientId: patient.id,
    data: {
      patientId: patient.id,
      title: "First saved draft",
      type: "Progress note",
      serviceDate: "2026-09-01",
      content: "Synthetic first note",
      status: "draft",
      authorAccountId: "synthetic-owner",
    },
  },
  {
    id: "draft-two",
    revision: 2,
    patientId: "another-patient",
    data: {
      patientId: "another-patient",
      title: "Second saved draft",
      type: "Progress note",
      serviceDate: "2026-09-02",
      content: "Synthetic second note",
      status: "draft",
      authorAccountId: "synthetic-owner",
    },
  },
  {
    id: "review-note",
    revision: 3,
    patientId: patient.id,
    data: {
      title: "Assigned supervision note",
      type: "Progress note",
      serviceDate: "2026-09-02",
      content: "Synthetic signed note for review",
      status: "signed",
      requiresCosign: true,
      authorAccountId: "supervisee",
    },
  },
  {
    id: "other-review",
    revision: 1,
    patientId: patient.id,
    data: {
      title: "Another supervisor's note",
      status: "signed",
      requiresCosign: true,
      authorAccountId: "other-supervisee",
    },
  },
];
let cosignRequest;
let authenticated = false;
let savedNote, savedPatient, savedStaffConnection, savedStaffDetails;
const clinicalTemplate = {
  id: "synthetic-template",
  revision: 1,
  data: {
    name: "Practice progress",
    noteType: "Progress note",
    status: "active",
    serviceCodes: ["90837"],
    fields: [
      {
        key: "interventions",
        label: "Interventions",
        type: "textarea",
        required: true,
        options: [],
      },
    ],
  },
};
await page.route("**/api/auricwell/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  let body = {};
  if (pathname.endsWith("/auth/status") && !authenticated)
    return route.fulfill({
      status: 401,
      json: { error: { message: "Sign in" } },
    });
  if (pathname.endsWith("/auth/login")) {
    authenticated = true;
    body = { mfaEnabled: false };
  } else if (pathname.endsWith("/bootstrap"))
    body = {
      account: {
        id: "synthetic-owner",
        name: "Synthetic Owner",
        operator: true,
      },
      practices: [
        practice,
        { ...practice, id: "second", slug: "second", name: "Second Practice" },
      ],
    };
  else if (pathname.endsWith("/workspace"))
    body = {
      practice: {
        ...practice,
        slug: pathname.includes("/second/") ? "second" : "champions",
      },
      patients: pathname.includes("/second/")
        ? []
        : [
            patient,
            {
              ...patient,
              id: "another-patient",
              data: { ...patient.data, name: "Another Patient" },
            },
          ],
      appointments: pathname.includes("/second/")
        ? []
        : [
            {
              id: "unwritten-visit",
              patientId: patient.id,
              data: {
                start: "2026-09-01T16:00:00Z",
                end: "2026-09-01T17:00:00Z",
                serviceCode: "90837",
                providerAccountId: "synthetic-owner",
                status: "completed",
              },
            },
          ],
      notes: pathname.includes("/second/") ? [] : notes,
      billingNotes: [],
      messages: [],
      ledger: [],
      claims: [],
      providers: [
        provider,
        {
          id: "supervisee-provider",
          data: {
            accountId: "supervisee",
            supervisorAccountId: "synthetic-owner",
          },
        },
        {
          id: "other-provider",
          data: {
            accountId: "other-supervisee",
            supervisorAccountId: "another-supervisor",
          },
        },
      ],
      balances: {},
    };
  else if (pathname.endsWith("/settings"))
    body = {
      revision: 1,
      settings: {
        onboardingMode: "new",
        practice: { legalName: practice.name },
        timezone: "America/Denver",
        services: [{ code: "90837", name: "Individual therapy" }],
        locations: [],
        capabilities: practice.capabilities,
      },
      readiness: {
        checks: [{ id: "baa", label: "BAA execution", ready: false }],
      },
    };
  else if (pathname.endsWith("/members"))
    body = [
      {
        id: "synthetic-owner",
        name: "Synthetic Owner",
        username: "owner",
        actorType: "staff",
        permissions: perms,
        status: "active",
        ...(savedStaffConnection
          ? {
              canonicalUserId: 201,
              sharedIdentity: {
                name: "Shared Clinician",
                active: true,
                identityProduct: "auricwell_ehr",
                firstName: "Shared",
                lastName: "Clinician",
                credential: "LPC",
                fingerprint: "shared-staff-version",
              },
            }
          : {}),
      },
    ];
  else if (pathname.endsWith("/shared-identity/preview"))
    body = {
      previewHash: "synthetic-staff-preview",
      account: { name: "Synthetic Owner", username: "owner" },
      target: {
        userId: 201,
        name: "Shared Clinician",
        credential: "LPC",
        active: true,
      },
    };
  else if (pathname.endsWith("/shared-identity")) {
    savedStaffConnection = route.request().postDataJSON();
    body = { canonicalUserId: 201 };
  } else if (pathname.endsWith("/members/synthetic-owner/identity")) {
    savedStaffDetails = route.request().postDataJSON();
    body = { canonicalUserId: 201 };
  } else if (pathname.endsWith("/note-aid"))
    body = { aids: [], aiEnabled: false };
  else if (pathname.endsWith("/note-templates"))
    body = pathname.includes("/second/") ? [] : [clinicalTemplate];
  else if (pathname.endsWith("/notes/review-note/sign")) {
    cosignRequest = route.request().postDataJSON();
    notes.find((n) => n.id === "review-note").data.status = "cosigned";
    body = { ok: true };
  } else if (
    pathname.endsWith("/notes") &&
    route.request().method() === "POST"
  ) {
    savedNote = route.request().postDataJSON();
    body = { id: "saved-note", revision: 1, data: savedNote };
  } else if (
    pathname.endsWith("/patients/synthetic-patient") &&
    route.request().method() === "PUT"
  ) {
    savedPatient = route.request().postDataJSON();
    body = { ...patient, revision: 2, data: savedPatient };
  } else if (pathname.endsWith("/billing-setup"))
    body = { identity: {}, integrations: {} };
  else if (pathname.endsWith("/agreement-templates")) body = {};
  else body = [];
  await route.fulfill({ json: body });
});
try {
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.screenshot({
    path: "deliverables/auricwell-verification/marketing-desktop.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:5174/app");
  await page.getByLabel("Username", { exact: true }).fill("synthetic-owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic password only");
  assert.equal(
    await page.getByText(/Continue with Google|Single Sign-On/).count(),
    0,
  );
  await page.screenshot({
    path: "deliverables/auricwell-verification/login-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await page.getByRole("link", { name: /Champions/ }).click();
  await page.getByRole("heading", { name: "Your day, at a glance." }).waitFor();
  await page.screenshot({
    path: "deliverables/auricwell-verification/workspace-desktop.png",
    fullPage: true,
  });
  for (const section of [
    "clients",
    "schedule",
    "documentation",
    "providers",
    "billing",
    "messages",
    "reports",
    "agreements",
    "imports",
    "settings",
  ]) {
    await page.goto(`http://127.0.0.1:5174/app/champions/${section}`);
    await page.locator(".workspace-main h1").waitFor();
    assert.equal(
      await page.getByRole("alert").count(),
      0,
      `error in ${section}`,
    );
  }
  await page.goto("http://127.0.0.1:5174/app/champions/documentation");
  const assertExpanded = async () => {
    assert.equal(
      await page
        .getByRole("button", { name: "Hide drafts", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Hide to do", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
  };
  const assertCollapsed = async () => {
    assert.equal(
      await page
        .getByRole("button", { name: "Show drafts", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Show to do", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
  };
  await assertExpanded();
  await page.screenshot({
    path: "deliverables/auricwell-verification/note-workspace-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("complementary", { name: "Drafts and records" })
    .getByRole("button", { name: /First saved draft/ })
    .click();
  await assertCollapsed();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    "First saved draft",
  );
  await page.getByRole("button", { name: "Show drafts", exact: true }).click();
  await page.getByRole("button", { name: "Show to do", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Drafts and records" })
    .getByRole("button", { name: /Second saved draft/ })
    .click();
  await assertCollapsed();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    "Second saved draft",
  );
  await page.screenshot({
    path: "deliverables/auricwell-verification/note-editor-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await assertExpanded();
  await page.getByLabel("Supervision", { exact: true }).check();
  const todo = page.getByRole("complementary", { name: "Documentation to do" });
  assert.equal(
    await todo.getByRole("button", { name: /Another supervisor/ }).count(),
    0,
  );
  await todo.getByRole("button", { name: /Assigned supervision note/ }).click();
  await assertCollapsed();
  assert.match(
    await page.locator(".note-center").innerText(),
    /Synthetic signed note for review/,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Review & cosign", exact: true })
    .click();
  await page.getByText("cosigned", { exact: true }).waitFor();
  assert.deepEqual(cosignRequest, {
    revision: 3,
    reviewed: true,
    cosign: true,
  });
  await page.getByRole("button", { name: "Close note", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "deliverables/auricwell-verification/note-workspace-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Supervision", { exact: true }).uncheck();
  await page.getByRole("button", { name: /Write session note/ }).click();
  await assertCollapsed();
  assert.equal(
    await page.getByLabel("Appointment", { exact: true }).inputValue(),
    "unwritten-visit",
  );
  assert.equal(
    await page.getByLabel("Service date", { exact: true }).inputValue(),
    "2026-09-01",
  );
  assert.equal(
    await page.getByLabel("Service code", { exact: true }).inputValue(),
    "90837",
  );
  assert.equal(
    await page.getByLabel("Billable service", { exact: true }).isChecked(),
    false,
  );
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: /New note/ }).click();
  await page
    .getByLabel("Patient", { exact: true })
    .selectOption("synthetic-patient");
  await page
    .getByLabel("Practice template")
    .selectOption("synthetic-template:1");
  await page
    .getByLabel("Interventions (required to sign)")
    .fill("First patient's synthetic intervention");
  await page.getByLabel("Title", { exact: true }).fill("First patient's draft");
  await page
    .getByLabel("Clinical documentation / additional narrative")
    .fill("First patient's narrative");
  await page
    .getByLabel("Patient", { exact: true })
    .selectOption("another-patient");
  assert.equal(
    await page.getByLabel("Interventions (required to sign)").inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByLabel("Clinical documentation / additional narrative")
      .inputValue(),
    "",
  );
  await page
    .getByLabel("Interventions (required to sign)")
    .fill("Second patient's verified intervention");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Structured synthetic note");
  await page.getByLabel("Service date").fill("2026-09-01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(savedNote.patientId, "another-patient");
  assert.equal(savedNote.structured.templateRevision, 1);
  assert.equal(
    savedNote.structured.answers.interventions,
    "Second patient's verified intervention",
  );
  assert.equal(savedNote.content, "");
  await page.goto("http://127.0.0.1:5174/app/champions/settings");
  await page
    .getByRole("button", { name: "Review access", exact: true })
    .click();
  await page.getByLabel("Shared staff ID", { exact: true }).fill("201");
  await page
    .getByRole("button", { name: "Preview staff connection", exact: true })
    .click();
  await page.getByRole("region", { name: "Staff connection review" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Connect reviewed staff identity" })
      .isDisabled(),
    true,
  );
  await page
    .getByLabel("I verified these records belong to the same person.", {
      exact: true,
    })
    .check();
  await page.screenshot({
    path: "deliverables/auricwell-verification/staff-connection-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Connect reviewed staff identity" })
    .click();
  await page
    .getByText("Shared staff identity connected.", { exact: false })
    .waitFor();
  assert.equal(savedStaffConnection.previewHash, "synthetic-staff-preview");
  assert.equal(savedStaffConnection.userId, 201);
  assert.equal(savedStaffConnection.reviewed, true);
  assert.ok(savedStaffConnection.idempotencyKey);
  await page
    .getByRole("button", { name: "Review access", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Updated");
  await page
    .getByLabel("Professional credential", { exact: true })
    .fill("LMFT");
  await page
    .getByRole("button", { name: "Save staff details", exact: true })
    .click();
  await page.getByText("Staff details saved.", { exact: false }).waitFor();
  assert.equal(savedStaffDetails.firstName, "Updated");
  assert.equal(savedStaffDetails.credential, "LMFT");
  assert.equal(savedStaffDetails.sharedFingerprint, "shared-staff-version");
  await page
    .getByRole("button", { name: "Edit template", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Template name").inputValue(),
    "Practice progress",
  );
  assert.equal(
    await page.getByLabel("Label", { exact: true }).inputValue(),
    "Interventions",
  );
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/note-templates"),
    ),
    page.getByRole("link", { name: "Documentation", exact: true }).click(),
  ]);
  await page.goto("http://127.0.0.1:5174/app/champions/clients");
  await page.getByRole("button", { name: /Synthetic Patient/ }).click();
  await page.getByRole("button", { name: "Edit client", exact: true }).click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Synthetic patient edit");
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/workspace")),
    page.locator(".editor").getByRole("button", { name: /^Save/ }).click(),
  ]);
  assert.equal(savedPatient.sharedFingerprint, "synthetic-shared-version");
  assert.equal(savedPatient.revision, 1);
  assert.equal(savedPatient.name, "Synthetic patient edit");
  await page.goto("http://127.0.0.1:5174/app/second/clients");
  await page.getByRole("heading", { name: "Clients", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /Synthetic Patient/ }).count(),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/app/champions",
    "/app/champions/settings",
    "/app/champions/imports",
  ]) {
    await page.goto(`http://127.0.0.1:5174${path}`);
    await page.locator("h1").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `horizontal overflow ${path}`,
    );
  }
  await page.goto("http://127.0.0.1:5174/app/champions");
  await page.locator(".workspace-main h1").waitFor();
  await page.screenshot({
    path: "deliverables/auricwell-verification/workspace-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  assert.notEqual(
    await page.evaluate(() => document.activeElement.tagName),
    "BODY",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "deliverables/auricwell-verification/browser-result.json",
    JSON.stringify(
      {
        passed: true,
        sections: 10,
        widths: [1440, 390],
        synthetic: true,
        structuredTemplates: true,
        patientDraftIsolation: true,
        sharedPatientVersionSubmitted: true,
        sharedStaffConnectionReview: true,
        notePanelsAndAssignedSupervision: true,
        sharedStaffDetailsVersionSubmitted: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Passed: marketing, username login, 10 workspace sections, practice state isolation, mobile overflow and keyboard focus.",
  );
} catch (error) {
  await page.screenshot({
    path: "deliverables/auricwell-verification/browser-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("main").innerText()).slice(0, 3000));
  throw error;
} finally {
  await browser.close();
}
