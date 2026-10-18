import {
  fail,
  text,
  has,
  requirePermission,
  requireCapability,
  THERAPY_SERVICE_CODES,
  uuid,
} from "./policy.js";
import { create, get, list, update } from "./repository.js";

export const NOTE_TYPES = [
  "Progress note",
  "Intake assessment",
  "Treatment plan",
  "Discharge summary",
  "Amendment",
];
const FIELD_TYPES = ["text", "textarea", "select", "boolean"];

export async function noteTemplates(ctx) {
  requireCapability(ctx, "documentation");
  if (!["admin", "clinical", "supervise"].some((p) => has(ctx, p)))
    throw fail(
      403,
      "Clinical or practice administration permission is required.",
    );
  return list(ctx, "note_template");
}
export async function saveNoteTemplate(ctx, input, id) {
  requirePermission(ctx, "admin");
  requireCapability(ctx, "documentation");
  if (!NOTE_TYPES.includes(input.noteType))
    throw fail(400, "Choose a clinical note type.");
  if (!["active", "inactive"].includes(input.status))
    throw fail(400, "Choose a template status.");
  if (
    !Array.isArray(input.serviceCodes) ||
    !input.serviceCodes.length ||
    input.serviceCodes.some(
      (code) =>
        !THERAPY_SERVICE_CODES.includes(code) ||
        (input.status === "active" &&
          !ctx.settings.services?.some(
            (s) => s.code === code && s.active !== false,
          )),
    )
  )
    throw fail(400, "Choose enabled therapy services for this template.");
  const fields = templateFields(input.fields);
  const data = {
    name: text(input.name, "Template name", 200),
    noteType: input.noteType,
    status: input.status,
    serviceCodes: [...new Set(input.serviceCodes)],
    fields,
  };
  if (!id) return create(ctx, "note_template", data);
  const prior = await get(ctx, "note_template", id);
  if (Number(input.revision) !== prior.revision)
    throw fail(409, "Refresh this template before saving.");
  // Notes retain their server-created snapshot, including after revision or retirement.
  return update(ctx, prior, data);
}

export function templateFields(inputFields) {
  if (
    !Array.isArray(inputFields) ||
    !inputFields.length ||
    inputFields.length > 40
  )
    throw fail(400, "A template needs between 1 and 40 fields.");
  const keys = new Set();
  return inputFields.map((field) => {
    if (
      !field ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(field.key) ||
      ["constructor", "prototype", "__proto__"].includes(field.key) ||
      keys.has(field.key)
    )
      throw fail(400, "Template field identifiers must be unique.");
    keys.add(field.key);
    if (!FIELD_TYPES.includes(field.type))
      throw fail(400, "Unsupported template field type.");
    const options =
      field.type === "select"
        ? Array.isArray(field.options)
          ? field.options.map((s) => text(s, "Choice", 200))
          : []
        : [];
    if (
      field.type === "select" &&
      (!options.length ||
        options.length > 30 ||
        new Set(options).size !== options.length)
    )
      throw fail(400, "Select fields need 1–30 distinct choices.");
    return {
      key: field.key,
      label: text(field.label, "Field label", 200),
      type: field.type,
      required: field.required === true,
      options,
    };
  });
}

export function templateAnswers(
  snapshot,
  input,
  requireComplete = false,
  action = "signing",
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail(400, "Invalid structured answers.");
  if (
    Object.keys(input).some(
      (key) => !snapshot.fields.some((f) => f.key === key),
    )
  )
    throw fail(400, "An answer does not belong to this template version.");
  const answers = {};
  for (const field of snapshot.fields) {
    const value = input[field.key];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      if (requireComplete && field.required)
        throw fail(409, `Complete ${field.label} before ${action}.`);
      continue;
    }
    if (field.type === "boolean") {
      if (typeof value !== "boolean")
        throw fail(400, `Choose yes or no for ${field.label}.`);
      answers[field.key] = value;
    } else {
      answers[field.key] = text(
        value,
        field.label,
        field.type === "textarea" ? 10000 : 1000,
      );
      if (
        field.type === "select" &&
        !field.options.includes(answers[field.key])
      )
        throw fail(400, `Choose a configured option for ${field.label}.`);
    }
  }
  return answers;
}

export async function structuredNote(ctx, input, prior) {
  const selection = input.structured;
  if (!selection) return null;
  if (
    typeof selection !== "object" ||
    !uuid(selection.templateId) ||
    !Number.isInteger(Number(selection.templateRevision)) ||
    Number(selection.templateRevision) < 1
  )
    throw fail(400, "Choose a valid template version.");
  let snapshot;
  const previous = prior?.data.structured;
  if (
    previous &&
    selection.templateId === previous.templateId &&
    Number(selection.templateRevision) === previous.templateRevision
  ) {
    snapshot = previous.snapshot;
  } else {
    const template = await get(ctx, "note_template", selection.templateId);
    if (
      template.data.status !== "active" ||
      template.revision !== Number(selection.templateRevision)
    )
      throw fail(
        409,
        "This template changed or was retired. Choose its current version.",
      );
    snapshot = template.data;
  }
  if (
    snapshot.noteType !== input.type ||
    !snapshot.serviceCodes.includes(input.serviceCode)
  )
    throw fail(409, "The template must match the note type and service.");
  return {
    templateId: selection.templateId,
    templateRevision: Number(selection.templateRevision),
    snapshot,
    answers: templateAnswers(snapshot, selection.answers || {}),
  };
}
export function structuredContent(structured, narrative = "") {
  const sections = structured.snapshot.fields
    .map((field) => {
      const value = structured.answers[field.key];
      return value === undefined
        ? null
        : `${field.label}\n${typeof value === "boolean" ? (value ? "Yes" : "No") : value}`;
    })
    .filter(Boolean);
  if (narrative.trim())
    sections.push(`Additional documentation\n${narrative.trim()}`);
  return sections.join("\n\n");
}
