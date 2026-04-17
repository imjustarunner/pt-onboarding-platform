/**
 * Short labels for intake answer-summary PDF (first page headers / section titles).
 * Signed template PDFs stay as uploaded; this only affects the generated answers page.
 */
const STRINGS = {
  en: {
    intakeResponses: 'Intake Responses',
    staffAssisted: 'Staff-Assisted Verification',
    mode: 'Mode',
    staffLastName: 'Staff last name',
    clientFirstName: 'Client first name',
    approvedAt: 'Approved at'
  },
  es: {
    intakeResponses: 'Respuestas de ingreso',
    staffAssisted: 'Verificación asistida por el personal',
    mode: 'Modo',
    staffLastName: 'Apellido del personal',
    clientFirstName: 'Nombre del participante',
    approvedAt: 'Aprobado el'
  }
};

export function resolveIntakePdfLocale(languageCode) {
  const lc = String(languageCode || 'en').trim().toLowerCase();
  if (lc.startsWith('es')) return 'es';
  return 'en';
}

export function getIntakePdfStrings(languageCode) {
  const loc = resolveIntakePdfLocale(languageCode);
  return STRINGS[loc] || STRINGS.en;
}
