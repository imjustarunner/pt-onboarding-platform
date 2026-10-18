import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import { fail, hash, text, requirePermission, requirePhi } from "./policy.js";
import { validDate } from "../supervisedBillingPolicy.service.js";
import {
  create,
  get,
  list,
  update,
  transaction,
  lockPractice,
  audit,
} from "./repository.js";

export const AGREEMENT_TEMPLATES = {
  service_agreement: {
    label: "AuricWell platform service agreement",
    patient: false,
    body: "The Operator provides the AuricWell electronic health record service described in the executed order form. The Practice remains responsible for clinical care, credentialing, user access, accurate records and billing decisions. AuricWell does not provide medical care.\n\nAccess is restricted to authorized users. Each user must protect credentials and use the service only for permitted practice purposes. The parties will comply with the executed Business Associate Agreement for protected health information.\n\nThe order form must specify fees, payment terms, service period, support commitments, termination rights, data export arrangements and any agreed limitations. No unspecified service level, certification or payer acceptance is promised. Changes require a new reviewed agreement version.\n\nOn termination, the parties will coordinate authorized record export and disposition under the BAA and applicable retention obligations. The BAA controls conflicting provisions regarding protected health information.",
  },
  order_form: {
    label: "AuricWell order form",
    patient: false,
    body: "This order incorporates the executed platform service agreement and BAA. The parties agree to the services, fees, billing frequency, payment terms, start date, service period, renewal and termination terms written below. Patient payments and insurance reimbursements are separate from these platform charges. No amounts or commitments apply unless explicitly stated in this executed order.",
  },
  baa: {
    label: "Business Associate Agreement",
    patient: false,
    body: "1. Scope and permitted uses. The Practice and Operator identify their respective covered-entity/business-associate capacities in the party details. Operator may use or disclose protected health information only to perform the contracted services, as this agreement permits, or as required by law. Operator may not use or disclose information in a manner that would violate the HIPAA Privacy Rule if done by the covered entity, except as specifically permitted by applicable law and this agreement.\n\n2. Safeguards. Operator will implement appropriate safeguards and comply with applicable HIPAA Security Rule requirements for electronic protected health information to prevent unauthorized use or disclosure.\n\n3. Reporting. Operator will report unauthorized uses or disclosures, security incidents, and breaches of unsecured protected health information to Practice, including information required for Practice to fulfill notification obligations, within the agreed reporting periods stated in the executed terms and applicable law.\n\n4. Subcontractors. Operator will ensure subcontractors that create, receive, maintain or transmit protected health information on its behalf agree to the same applicable restrictions, conditions and safeguards.\n\n5. Individual rights. Operator will make designated-record-set information available as necessary for access, amendment and accounting obligations, and incorporate amendments as directed. Operator will fulfill applicable Privacy Rule obligations to the extent it performs them for Practice.\n\n6. Oversight. Operator will make relevant internal practices, books and records available to the Secretary of HHS for determining HIPAA compliance.\n\n7. Practice responsibilities. Practice will communicate restrictions, authorization changes and privacy-notice limitations relevant to Operator’s work and will not request impermissible uses or disclosures.\n\n8. Termination. Practice may terminate for a material violation. On termination, Operator will return or destroy protected health information where feasible, including subcontractor-held information. If return or destruction is infeasible, protections continue and further uses or disclosures are limited to the purposes making return or destruction infeasible.\n\n9. Interpretation. HIPAA terms carry their regulatory meanings. Conflicting provisions are interpreted to permit compliance. The parties will amend this agreement as necessary to comply with applicable requirements.\n\nComplete party identities, permitted service scope, incident-reporting contacts and periods, individual-rights response procedures, and retention/export terms before approval and issuance.",
  },
  treatment_consent: {
    label: "Consent to treatment",
    patient: true,
    body: "The treating practice, services, benefits, material risks, alternatives, confidentiality limits, contact procedures and withdrawal process must be described in the practice-approved terms below. The patient or authorized guardian confirms informed consent to the described care. AuricWell is the software provider, not the treating clinician.",
  },
  telehealth_consent: {
    label: "Telehealth consent",
    patient: true,
    body: "Describe the treating practice’s telehealth process, privacy limitations, technology requirements, emergency procedures, patient location verification, alternatives and withdrawal process. Recording is not authorized by this form unless a separate explicit recording consent is completed.",
  },
  privacy_acknowledgement: {
    label: "Privacy notice acknowledgement",
    patient: true,
    body: "The patient or authorized representative acknowledges receiving the treating practice’s attached notice of privacy practices. This acknowledgement is not an authorization for unrelated disclosure of records.",
  },
  financial_policy: {
    label: "Patient financial policy",
    patient: true,
    body: "Describe the treating practice’s fees, patient responsibility, insurance handling, payment terms, cancellation policy and dispute/contact process. Signing this policy does not itself charge a payment method.",
  },
  release_authorization: {
    label: "Authorization to release information",
    patient: true,
    body: "Specify the information authorized for disclosure, sender, recipient, purpose, expiration date/event, applicable limitations, revocation procedure and required notices. Authorization applies only to the completed scope below and is not a general permission to disclose all records.",
  },
};
export async function createAgreement(ctx, input) {
  requirePermission(ctx, "agreements");
  const template = AGREEMENT_TEMPLATES[input.type];
  if (!template) throw fail(400, "Choose a supported agreement type.");
  if (template.patient && !input.patientId)
    throw fail(400, "Choose a patient.");
  if (template.patient) {
    requirePhi(ctx);
    await get(ctx, "patient", input.patientId);
  }
  if (!template.patient && input.patientId)
    throw fail(400, "Practice agreements cannot be assigned to a patient.");
  return create(
    ctx,
    "agreement",
    {
      type: input.type,
      title: template.label,
      body: template.body,
      terms: "",
      status: "draft",
      patientId: input.patientId || null,
      signatures: [],
      approvedBy: null,
      approvalHash: null,
    },
    { patientId: input.patientId || null },
  );
}
export function agreementHash(data) {
  return hash(
    JSON.stringify({
      type: data.type,
      body: data.body,
      terms: data.terms,
      parties: data.parties,
      effectiveDate: data.effectiveDate,
      patientId: data.patientId,
      signers: data.signers,
      supersedesId: data.supersedesId || null,
    }),
  );
}
export async function saveAgreement(ctx, id, input) {
  requirePermission(ctx, "agreements");
  const r = await get(ctx, "agreement", id);
  if (r.data.status !== "draft")
    throw fail(
      409,
      "Issued and signed versions are immutable. Create a new version.",
    );
  if (Number(input.revision) !== r.revision)
    throw fail(409, "Refresh this agreement before editing.");
  const signers = input.signers;
  if (!validDate(input.effectiveDate))
    throw fail(400, "Choose a valid effective date.");
  if (
    !Array.isArray(signers) ||
    signers.length < 1 ||
    signers.length > 3 ||
    new Set(signers.map((s) => s.accountId)).size !== signers.length
  )
    throw fail(400, "Select distinct authorized signers.");
  const data = {
    ...r.data,
    body: text(input.body, "Agreement body", 100000),
    terms: text(input.terms, "Completed terms", 50000),
    parties: input.parties,
    effectiveDate: text(input.effectiveDate, "Effective date", 10),
    signers: signers.map((s) => ({
      accountId: text(s.accountId, "Signer account", 36),
      capacity: text(s.capacity, "Signer capacity", 120),
    })),
    approvedBy: null,
    approvalHash: null,
  };
  return update(ctx, r, data);
}
export async function approveAgreement(ctx, id) {
  const r = await get(ctx, "agreement", id);
  if (!AGREEMENT_TEMPLATES[r.data.type]?.patient && !ctx.profile.operator)
    throw fail(403, "An AuricWell operator must approve platform agreements.");
  requirePermission(ctx, "agreements");
  if (r.data.status !== "draft")
    throw fail(409, "Only drafts can be approved.");
  for (const party of ["practice", ...(r.data.patientId ? [] : ["operator"])]) {
    const p = r.data.parties?.[party];
    if (!p?.legalName || !p?.address || !p?.noticeContact)
      throw fail(
        400,
        `Complete ${party} legal name, address and notice contact.`,
      );
  }
  if (!r.data.terms || !r.data.effectiveDate || !r.data.signers?.length)
    throw fail(400, "Complete terms, effective date and signers.");
  if (!r.data.patientId && r.data.signers.length !== 2)
    throw fail(
      400,
      "Practice agreements require operator and practice signers.",
    );
  return update(ctx, r, {
    ...r.data,
    approvedBy: ctx.accountId,
    approvalHash: agreementHash(r.data),
    approvedAt: new Date().toISOString(),
  });
}
export async function issueAgreement(ctx, id) {
  requirePermission(ctx, "agreements");
  const r = await get(ctx, "agreement", id);
  if (
    r.data.status !== "draft" ||
    !r.data.approvedBy ||
    r.data.approvalHash !== agreementHash(r.data)
  )
    throw fail(409, "Approve this exact completed agreement before issuance.");
  const { pool, open } = await import("./repository.js");
  let operatorSigner = false;
  let practiceSigner = false;
  let patientSigner = false;
  for (const signer of r.data.signers) {
    const [[m]] = await pool.execute(
      `SELECT m.*,a.profile FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.account_id=? AND m.status='active' AND a.status='active'`,
      [ctx.practiceId, signer.accountId],
    );
    if (!m)
      throw fail(400, "Every signer must have an active practice account.");
    const { json } = await import("./policy.js");
    if (r.data.patientId) {
      if (
        m.actor_type === "staff"
          ? !json(m.permissions, []).includes("agreements")
          : !json(m.patient_ids, []).includes(r.data.patientId)
      )
        throw fail(
          400,
          "Select an authorized patient, guardian or practice countersigner.",
        );
      if (m.actor_type !== "staff") patientSigner = true;
    } else {
      if (!json(m.permissions, []).includes("agreements"))
        throw fail(400, "Signer lacks agreement authority.");
      if (open(m.profile, `auricwell:account:${signer.accountId}`).operator)
        operatorSigner = true;
      else practiceSigner = true;
    }
  }
  if (r.data.patientId && !patientSigner)
    throw fail(
      400,
      "Patient agreements require a patient or authorized guardian signer.",
    );
  if (!r.data.patientId && (!operatorSigner || !practiceSigner))
    throw fail(400, "Select one operator signer and one practice signer.");
  return update(ctx, r, {
    ...r.data,
    status: "issued",
    issuedAt: new Date().toISOString(),
    contentHash: agreementHash(r.data),
  });
}
export async function signAgreement(ctx, id, input) {
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const r = await get(ctx, "agreement", id, db, true);
    const signer = r.data.signers?.find((s) => s.accountId === ctx.accountId);
    if (!signer || !["issued", "partially_signed"].includes(r.data.status))
      throw fail(403, "This agreement is not awaiting your signature.");
    if (
      r.data.patientId &&
      !(ctx.actorType === "staff"
        ? ctx.permissions.includes("agreements")
        : ctx.patientIds.includes(r.data.patientId))
    )
      throw fail(403, "Patient signing authority is required.");
    if (!r.data.patientId) requirePermission(ctx, "agreements");
    if (
      input.consent !== true ||
      input.contentHash !== r.data.contentHash ||
      agreementHash(r.data) !== r.data.contentHash
    )
      throw fail(
        409,
        "Review this exact document and confirm your intent to sign.",
      );
    if (r.data.signatures.some((s) => s.accountId === ctx.accountId))
      throw fail(409, "You already signed this version.");
    const signatures = [
      ...r.data.signatures,
      {
        accountId: ctx.accountId,
        name: text(input.name, "Signature name", 200),
        capacity: signer.capacity,
        signedAt: new Date().toISOString(),
        contentHash: r.data.contentHash,
      },
    ];
    const completed = signatures.length === r.data.signers.length;
    const result = await update(
      ctx,
      r,
      {
        ...r.data,
        signatures,
        status: completed ? "completed" : "partially_signed",
        completedAt: completed ? new Date().toISOString() : null,
      },
      db,
    );
    if (completed) {
      const bytes = await agreementPdf(result);
      await create(
        ctx,
        "agreement_pdf",
        {
          agreementId: id,
          contentHash: r.data.contentHash,
          pdfHash: hash(bytes),
          base64: bytes.toString("base64"),
        },
        { patientId: r.patientId, sourceKey: id },
        db,
      );
    }
    await audit(
      ctx,
      "agreement.signed",
      id,
      { contentHash: r.data.contentHash, capacity: signer.capacity },
      db,
    );
    return result;
  });
}
export async function reviseAgreement(ctx, id) {
  requirePermission(ctx, "agreements");
  const r = await get(ctx, "agreement", id);
  if (r.data.status !== "completed")
    throw fail(
      409,
      "Only completed agreements can be superseded by a new version.",
    );
  return create(
    ctx,
    "agreement",
    {
      ...r.data,
      status: "draft",
      supersedesId: r.id,
      signatures: [],
      approvedBy: null,
      approvalHash: null,
      approvedAt: null,
      issuedAt: null,
      contentHash: null,
      completedAt: null,
    },
    { patientId: r.patientId },
  );
}
export async function agreementPdf(record) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await fs.readFile(
      new URL("../../assets/fonts/Montserrat-Regular.ttf", import.meta.url),
    ),
    { subset: true },
  );
  const logo = await doc.embedPng(
    await fs.readFile(
      new URL("../../assets/auricwell/logo.png", import.meta.url),
    ),
  );
  let page, y;
  const addPage = () => {
    page = doc.addPage([612, 792]);
    y = 710;
    page.drawImage(logo, { x: 45, y: 720, width: 65, height: 65 });
    page.drawText("AuricWell", {
      x: 124,
      y: 746,
      font,
      size: 20,
      color: rgb(0.02, 0.16, 0.43),
    });
  };
  addPage();
  const d = record.data;
  const content = [
    d.status === "completed" ? "EXECUTED AGREEMENT" : "UNEXECUTED COPY",
    d.title,
    `Version ${record.id}`,
    `Effective date: ${d.effectiveDate || "Not set"}`,
    JSON.stringify(d.parties || {}, null, 2),
    d.body,
    d.terms || "TERMS NOT COMPLETED",
    ...(d.signatures || []).map(
      (s) =>
        `Signed by ${s.name}, ${s.capacity}, ${s.signedAt}\nAccount: ${s.accountId}\nDocument hash: ${s.contentHash}`,
    ),
  ].join("\n\n");
  await doc.attach(
    Buffer.from(JSON.stringify({ id: record.id, ...d }, null, 2)),
    "signed-source.json",
    {
      mimeType: "application/json",
      description: "Exact UTF-8 agreement content and signature evidence",
    },
  );
  for (const paragraph of content.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (font.widthOfTextAtSize(`${line} ${word}`, 10) > 510 && line) {
        if (y < 50) addPage();
        page.drawText(line, { x: 48, y, font, size: 10 });
        y -= 15;
        line = "";
      }
      line += `${line ? " " : ""}${word}`;
    }
    if (y < 50) addPage();
    page.drawText(line, { x: 48, y, font, size: 10 });
    y -= 15;
  }
  return Buffer.from(await doc.save());
}
