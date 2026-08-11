/** Default school intake step — Spanish-language clarification (ES forms only). */

export const SPANISH_CLARIFICATION_STEP_TYPE = 'spanish_clarification';

export const DEFAULT_SPANISH_CLARIFICATION_STEP = {
  type: SPANISH_CLARIFICATION_STEP_TYPE,
  label: 'Aclaración de idioma',
  visibility: 'always'
};

export const EMPTY_SPANISH_CLARIFICATION_RESPONSE = {
  guardianPrefersSpanishOnly: '',
  clientNeedsSpanishOnly: '',
  interpreterConsent: '',
  sessionPrimaryLanguage: '',
  providerLanguagePreference: '',
  schoolDayVirtualCoordination: '',
  afterSchoolSpanishVirtual: ''
};

export const SPANISH_CLARIFICATION_COPY = {
  title: 'Aclaración de idioma y preferencias de comunicación',
  intro:
    'Para coordinar los servicios en el idioma adecuado, necesitamos algunas aclaraciones. Responda en español según corresponda.',
  guardianPrefersSpanishOnly: {
    label: '¿Prefiere el tutor o representante legal recibir comunicaciones únicamente en español?',
    options: [
      { value: 'yes', label: 'Sí, solo en español' },
      { value: 'no', label: 'No, puedo recibir comunicaciones en inglés' },
      { value: 'bilingual_ok', label: 'Prefiero español, pero puedo usar inglés cuando sea necesario' }
    ]
  },
  clientNeedsSpanishOnly: {
    label: '¿Será necesario que la comunicación con el cliente propuesto sea únicamente en español?',
    options: [
      { value: 'yes', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'unsure', label: 'No estoy seguro/a' }
    ]
  },
  interpreterConsent: {
    label: 'Intérprete del personal de OJR durante el proceso de admisión',
    disclosure:
      'Si su proveedor asignado no habla español, ¿está dispuesto/a a que otro miembro del personal de OJR actúe como intérprete durante el proceso de admisión con nuestro proveedor?',
    options: [
      { value: 'yes', label: 'Sí, entiendo y acepto' },
      { value: 'no', label: 'No' }
    ]
  },
  sessionPrimaryLanguage: {
    label:
      '¿El cliente puede tener el español (o español con algo de inglés — “Spanglish”) como idioma principal en las sesiones?',
    options: [
      { value: 'spanish', label: 'Español' },
      { value: 'spanglish', label: 'Español con algo de inglés (Spanglish)' },
      { value: 'english', label: 'Inglés' },
      { value: 'unsure', label: 'No estoy seguro/a' }
    ]
  },
  providerLanguagePreference: {
    label: '¿Cuál es su preferencia de idioma para su proveedor?',
    options: [
      { value: 'spanish', label: 'Sí, prefiero un proveedor que hable español' },
      { value: 'no_preference', label: 'No tengo preferencia' },
      { value: 'english', label: 'Prefiero un proveedor que hable inglés' }
    ]
  },
  schoolDayVirtualCoordination: {
    label: 'Coordinación virtual durante el día escolar',
    disclosure:
      'Aunque contamos con personal que habla español, es posible que nuestros proveedores de habla hispana no estén disponibles durante el día escolar en SU escuela. Si lo desea, podemos intentar coordinar con su escuela la participación virtual de un proveedor de habla hispana fuera del sitio durante el día escolar, si es posible. Esto no siempre es posible, pero podemos consultar en su nombre.',
    options: [
      { value: 'yes', label: 'Sí, por favor intenten coordinar virtualmente durante el día escolar' },
      { value: 'no', label: 'No, no es necesario' },
      { value: 'discuss', label: 'Tal vez — contáctenme para conversar' }
    ]
  },
  afterSchoolSpanishVirtual: {
    label: 'Servicios virtuales en español después de la escuela',
    disclosure:
      'Si no podemos ofrecer servicios según lo indicado anteriormente durante el día escolar, ¿le interesarían servicios virtuales en español después de la escuela?',
    options: [
      { value: 'yes', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'maybe', label: 'Tal vez' }
    ]
  }
};

const REQUIRED_KEYS = Object.keys(EMPTY_SPANISH_CLARIFICATION_RESPONSE);

/** @returns {string|null} First missing field key, or null if complete */
export function firstMissingSpanishClarificationField(data) {
  const bag = data && typeof data === 'object' ? data : {};
  for (const key of REQUIRED_KEYS) {
    if (!String(bag[key] || '').trim()) return key;
  }
  return null;
}

export function isSpanishClarificationComplete(data) {
  return !firstMissingSpanishClarificationField(data);
}

/** English summary for admins editing the ES master (participant text stays Spanish). */
export const SPANISH_CLARIFICATION_ADMIN_EN = {
  title: 'Language clarification & communication preferences',
  intro:
    'Shown on the About You step (before other questions) when a family uses the Spanish version of this form. All participant-facing text is in Spanish.',
  sections: [
    {
      key: 'guardianPrefersSpanishOnly',
      title: 'Guardian communication language',
      question: 'Does the guardian prefer to receive communications in Spanish only?',
      options: [
        'Yes — Spanish only',
        'No — I can receive communications in English',
        'I prefer Spanish but can use English when needed'
      ]
    },
    {
      key: 'clientNeedsSpanishOnly',
      title: 'Client communication language',
      question: 'Will communication with the proposed client need to be in Spanish only?',
      options: ['Yes', 'No', 'Not sure']
    },
    {
      key: 'interpreterConsent',
      title: 'OJR staff interpreter during intake',
      question:
        'If the assigned provider does not speak Spanish, are they willing to have another OJR staff member interpret during the intake process with our provider?',
      options: ['Yes — I understand and agree', 'No']
    },
    {
      key: 'sessionPrimaryLanguage',
      title: 'Primary language in sessions',
      question:
        'Can the client have Spanish (or Spanish with some English — “Spanglish”) as the primary language in sessions?',
      options: ['Spanish', 'Spanish with some English (Spanglish)', 'English', 'Not sure']
    },
    {
      key: 'providerLanguagePreference',
      title: 'Provider language preference',
      question: 'What is your preferred language for your provider?',
      options: [
        'Yes — I prefer a Spanish-speaking provider',
        'No preference',
        'I prefer an English-speaking provider'
      ]
    },
    {
      key: 'schoolDayVirtualCoordination',
      title: 'School-day virtual coordination',
      question:
        'Although we have Spanish-speaking staff, our Spanish-speaking providers may not be available during the school day at THEIR school. Should we attempt to coordinate an off-site Spanish-speaking provider virtually during the school day with their school when possible? (This may not always be possible, but we can inquire on their behalf.)',
      options: [
        'Yes — please try to coordinate virtually during the school day',
        'No — not necessary',
        'Maybe — contact me to discuss'
      ]
    },
    {
      key: 'afterSchoolSpanishVirtual',
      title: 'After-school Spanish virtual services',
      question:
        'If we cannot provide services during the school day as described above, would they be interested in after-school virtual services in Spanish?',
      options: ['Yes', 'No', 'Maybe']
    }
  ]
};
