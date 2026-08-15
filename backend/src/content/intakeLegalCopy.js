const CSI_ALERT_URL =
  'https://resources.csi.state.co.us/wp-content/uploads/2022/07/GT-Alert_Colorado-Lowers-Age-of-Consent-for-Psychotherapy-Services-to-12-Years-Old.pdf';
const HB17_1320_URL = 'https://leg.colorado.gov/bills/hb17-1320';

export const DEFAULT_INTAKE_LEGAL = {
  en: {
    otherGuardianLead:
      'If another parent or guardian has medical decision-making rights, they need their own account and informed consent for the dependent(s). They will not see what you submit.',
    ageOfConsentNote:
      'We follow applicable Colorado law and professional ethics. In Colorado, a minor 12 or older may be able to consent to psychotherapy in some situations. This is information, not legal advice. Your assigned provider will apply the rules that fit this child’s care.',
    noEmailWarning:
      'An email is required to send the other guardian a private intake link. If you only have a phone number, intake and start of care may be delayed while our support team or the assigned provider contacts them to collect the needed permissions.',
    resources: [
      { label: 'Colorado age of consent for psychotherapy (CSI / GT alert, 2019)', url: CSI_ALERT_URL },
      { label: 'Colorado HB17-1320 (related bill history)', url: HB17_1320_URL }
    ]
  },
  es: {
    otherGuardianLead:
      'Si otro padre, madre o tutor tiene derecho a decidir sobre la atención médica, necesita su propia cuenta y consentimiento informado para el o los dependientes. No verá lo que usted envíe.',
    ageOfConsentNote:
      'Seguimos la ley de Colorado aplicable y la ética profesional. En Colorado, un menor de 12 años o más puede, en algunas situaciones, consentir psicoterapia. Esto es información, no asesoría legal. El proveedor asignado aplicará las reglas que correspondan a este menor.',
    noEmailWarning:
      'Se necesita un correo para enviar al otro tutor un enlace privado de admisión. Si solo tiene un teléfono, la admisión y el inicio de servicios pueden retrasarse mientras nuestro equipo de apoyo o el proveedor asignado se comunica para obtener los permisos necesarios.',
    resources: [
      { label: 'Edad de consentimiento para psicoterapia en Colorado (alerta CSI / GT, 2019)', url: CSI_ALERT_URL },
      { label: 'Colorado HB17-1320 (historial legislativo relacionado)', url: HB17_1320_URL }
    ]
  }
};

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function cleanResources(list, fallback) {
  const src = Array.isArray(list) && list.length ? list : fallback;
  return (src || [])
    .map((item) => ({
      label: String(item?.label || '').trim().slice(0, 200),
      url: String(item?.url || '').trim().slice(0, 500)
    }))
    .filter((item) => item.label && item.url)
    .slice(0, 8);
}

function localeBundle(raw, locale) {
  const loc = String(locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  const defaults = DEFAULT_INTAKE_LEGAL[loc];
  const fromRoot = raw && typeof raw === 'object' ? raw : {};
  const fromLocale = fromRoot[loc] && typeof fromRoot[loc] === 'object' ? fromRoot[loc] : fromRoot;
  return {
    locale: loc,
    otherGuardianLead: String(fromLocale.otherGuardianLead || defaults.otherGuardianLead).trim().slice(0, 800),
    ageOfConsentNote: String(fromLocale.ageOfConsentNote || defaults.ageOfConsentNote).trim().slice(0, 1200),
    noEmailWarning: String(fromLocale.noEmailWarning || defaults.noEmailWarning).trim().slice(0, 800),
    resources: cleanResources(fromLocale.resources, defaults.resources)
  };
}

export function resolveIntakeLegalFromTheme(themeSettings, locale = 'en') {
  const theme = parseJson(themeSettings, {});
  return localeBundle(theme.intakeLegal, locale);
}

export function mergeIntakeLegalIntoTheme(themeSettings, payload = {}, locale = 'en') {
  const theme = parseJson(themeSettings, {});
  const loc = String(locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  const current = theme.intakeLegal && typeof theme.intakeLegal === 'object' ? theme.intakeLegal : {};
  const nextLocale = localeBundle({ ...current[loc], ...payload }, loc);
  theme.intakeLegal = {
    ...current,
    [loc]: {
      otherGuardianLead: nextLocale.otherGuardianLead,
      ageOfConsentNote: nextLocale.ageOfConsentNote,
      noEmailWarning: nextLocale.noEmailWarning,
      resources: nextLocale.resources
    }
  };
  return theme;
}

export function intakeLegalHtmlBlock(copy) {
  const resources = (copy?.resources || [])
    .map((r) => `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label)}</a></li>`)
    .join('');
  return [
    '<!-- intake-legal-resources -->',
    `<div class="packet-intake-legal">`,
    `<p>${escapeHtml(copy?.ageOfConsentNote || '')}</p>`,
    resources ? `<ul>${resources}</ul>` : '',
    `</div>`,
    '<!-- /intake-legal-resources -->'
  ].join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function injectIntakeLegalIntoPacketHtml(html, copy) {
  const block = intakeLegalHtmlBlock(copy);
  const source = String(html || '');
  if (/<!-- intake-legal-resources -->[\s\S]*?<!-- \/intake-legal-resources -->/.test(source)) {
    return source.replace(/<!-- intake-legal-resources -->[\s\S]*?<!-- \/intake-legal-resources -->/, block);
  }
  const heading = /(<h2>\s*(MINOR CONSENT|CONSENTIMIENTO DE MENOR)\s*<\/h2>[\s\S]*?<\/p>\s*<p>[\s\S]*?<\/p>)/i;
  if (heading.test(source)) {
    return source.replace(heading, `$1\n  ${block}`);
  }
  return source;
}
