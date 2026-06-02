/** Stable id used when migrating legacy signature_x/y columns into field_definitions */
export const DOCUMENT_SIGNATURE_FIELD_ID = 'document_signature';

/**
 * Merge legacy signature_* columns into a unified field_definitions array (once).
 */
export function mergeLegacySignatureIntoFields(fieldDefinitions = [], signatureCoords = {}) {
  const fields = (fieldDefinitions || []).map((f) => ({ ...f }));
  if (fields.some((f) => f?.type === 'signature')) {
    return fields.map(normalizeDocumentField);
  }

  const x = signatureCoords?.x;
  const y = signatureCoords?.y;
  if (x === null || x === undefined || y === null || y === undefined) {
    return fields.map(normalizeDocumentField);
  }

  return [
    normalizeDocumentField({
      id: DOCUMENT_SIGNATURE_FIELD_ID,
      label: 'Signature',
      type: 'signature',
      required: true,
      x,
      y,
      width: signatureCoords?.width ?? 200,
      height: signatureCoords?.height ?? 60,
      page: signatureCoords?.page ?? null
    }),
    ...fields
  ];
}

export function extractSignatureCoordsFromFields(fieldDefinitions = []) {
  const sig = (fieldDefinitions || []).find((f) => f?.type === 'signature');
  if (!sig || sig.x === null || sig.x === undefined || sig.y === null || sig.y === undefined) {
    return { x: null, y: null, width: 200, height: 60, page: null };
  }
  return {
    x: sig.x,
    y: sig.y,
    width: sig.width ?? 200,
    height: sig.height ?? 60,
    page: sig.page ?? null
  };
}

export function normalizeDocumentFieldLayout(fieldDefinitions = [], signatureCoords = {}) {
  return mergeLegacySignatureIntoFields(fieldDefinitions, signatureCoords);
}

export function learnerFillableFields(fieldDefinitions = []) {
  return (fieldDefinitions || []).filter((f) => f?.type !== 'signature');
}

function normalizeDocumentField(field) {
  return {
    id: field.id || `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: field.label || '',
    type: field.type || 'text',
    required: field.type === 'signature' ? true : Boolean(field.required),
    autoToday: Boolean(field.autoToday),
    defaultChecked: Boolean(field.defaultChecked),
    options: Array.isArray(field.options) ? field.options : [],
    showIf: {
      fieldId: field.showIf?.fieldId || '',
      equals: field.showIf?.equals ?? ''
    },
    x: field.x ?? null,
    y: field.y ?? null,
    width: field.width ?? (field.type === 'signature' ? 200 : 120),
    height: field.height ?? (field.type === 'signature' ? 60 : 24),
    page: field.page ?? null
  };
}
