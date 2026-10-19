/**
 * Published Spanish editions; do not machine-translate scored instrument items.
 * PHQ-9 and GAD-7: Spanish for the USA, Spitzer / Williams / Kroenke et al.
 * Their source forms expressly permit reproduction, translation and distribution.
 * PSC-17: Jellinek / Murphy, Spanish PSC Gouverneur Revision 2-7-03.
 * PSC item wording is mapped by meaning to our existing keys, NOT PDF numbering.
 * Sources retrieved 2026-10-18. Keep keys and numeric response values stable.
 */
import { buildPhq9Fields, buildGad7Fields, buildPsc17Fields } from './validatedClinicalScreens.en.js';

export const SPANISH_SCREEN_SOURCES = {
  phq9: {
    title: 'PHQ-9 · Español para Estados Unidos',
    url: 'https://depts.washington.edu/uwhatc/PDF/TF-%20CBT/pages/3%20Assessment/Standardized%20Measures/PHQ9_Spanish%20for%20the%20USA.pdf',
    attribution: 'Elaborado por los doctores Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke y colegas, mediante una subvención educativa otorgada por Pfizer Inc. No se requiere permiso para reproducir, traducir, presentar o distribuir.'
  },
  gad7: {
    title: 'GAD-7 · Español para Estados Unidos',
    url: 'https://ncpal.org/sites/default/files/2025-03/GeneralizedAnxietyDisorder7-GAD-7-SelfReport-Spanish.pdf',
    attribution: 'Elaborado por los doctores Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke y colegas, mediante una subvención educativa otorgada por Pfizer Inc. No se requiere permiso para reproducir, traducir, presentar o distribuir.'
  },
  psc17: {
    title: 'PSC-17 · Spanish PSC Gouverneur Revision 2-7-03',
    url: 'https://capp.ucsf.edu/sites/g/files/tkssra6871/f/PSC%2017-Spanish.pdf',
    attribution: 'M.S. Jellinek y J. M. Murphy, Massachusetts General Hospital. Spanish PSC Gouverneur Revision 2-7-03.'
  }
};

const FREQUENCY = ['Ningún día', 'Varios días', 'Más de la mitad de los días', 'Casi todos los días'];
const TWO_WEEKS = 'Durante las últimas 2 semanas, ¿qué tan seguido ha tenido molestias debido a los siguientes problemas?';
const ITEMS = {
  phq9: [
    'Poco interés o placer en hacer cosas',
    'Se ha sentido decaído(a), deprimido(a) o sin esperanzas',
    'Ha tenido dificultad para quedarse o permanecer dormido(a), o ha dormido demasiado',
    'Se ha sentido cansado(a) o con poca energía',
    'Sin apetito o ha comido en exceso',
    'Se ha sentido mal con usted mismo(a) – o que es un fracaso o que ha quedado mal con usted mismo(a) o con su familia',
    'Ha tenido dificultad para concentrarse en ciertas actividades, tales como leer el periódico o ver la televisión',
    '¿Se ha movido o hablado tan lento que otras personas podrían haberlo notado? o lo contrario – muy inquieto(a) o agitado(a) que ha estado moviéndose mucho más de lo normal',
    'Pensamientos de que estaría mejor muerto(a) o de lastimarse de alguna manera'
  ],
  gad7: [
    'Se ha sentido nervioso(a), ansioso(a) o con los nervios de punta',
    'No ha sido capaz de parar o controlar su preocupación',
    'Se ha preocupado demasiado por motivos diferentes',
    'Ha tenido dificultad para relajarse',
    'Se ha sentido tan inquieto(a) que no ha podido quedarse quieto(a)',
    'Se ha molestado o irritado fácilmente',
    'Ha tenido miedo de que algo terrible fuera a pasar'
  ],
  // Existing app order: attention/internalizing/externalizing keys are already
  // used by scoring and saved records. Spanish source item 17 is our psc_16.
  psc17: [
    'Es inquieto(a), incapaz de sentarse tranquilo(a)',
    'Es muy activo(a), tiene mucha energía',
    'Sueña despierto demasiado',
    'Se distrae fácilmente',
    'Se siente triste, infeliz',
    'Se siente sin esperanzas',
    'Tiene problemas para concentrarse',
    'Pelea con otros niños',
    'Se siente mal de sí mismo(a)',
    'Se preocupa mucho',
    'Parece divertirse menos',
    'No obedece las reglas',
    'No comprende los sentimientos de otros',
    'Molesta o se burla de otros',
    'Culpa a otros por sus problemas',
    'Toma cosas que no le pertenecen',
    'Se niega a compartir'
  ]
};

function localize(fields, instrument) {
  const options = (instrument === 'psc17' ? ['Nunca', 'Algunas veces', 'Frecuentemente'] : FREQUENCY)
    .map((label, index) => ({ value: String(index), label }));
  return fields.map((field, index) => ({ ...field, label: ITEMS[instrument][index],
    helperText: instrument === 'psc17' ? 'Indique cual síntoma mejor describe a su hijo/a' : TWO_WEEKS,
    options: options.map(option => ({...option})), instrumentLocale: 'es', instrumentSource: SPANISH_SCREEN_SOURCES[instrument].url
  }));
}
export const buildPhq9FieldsEs = () => localize(buildPhq9Fields(), 'phq9');
export const buildGad7FieldsEs = () => localize(buildGad7Fields(), 'gad7');
export const buildPsc17FieldsEs = (options) => localize(buildPsc17Fields(options), 'psc17');

const byKey = new Map([...buildPhq9FieldsEs(), ...buildGad7FieldsEs(), ...buildPsc17FieldsEs()].map(field => [field.key, field]));
/** Replace only known instrument display copy; preserve conditions and answers. */
export function spanishClinicalField(key, label, config = {}) {
  const field = byKey.get(key);
  if (!field || (config.instrument && config.instrument !== field.instrument)) return null;
  return [key, field.label, {...config, helperText: field.helperText,
    options: field.options.map(option => ({...option})), instrument: field.instrument,
    instrumentLocale: 'es', instrumentSource: field.instrumentSource }];
}
