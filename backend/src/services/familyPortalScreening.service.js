import { buildGad7Fields, buildPsc17Fields } from '../data/validatedClinicalScreens.en.js';
import { buildGad7FieldsEs, buildPsc17FieldsEs } from '../data/validatedClinicalScreens.es.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { ageOn, requireClinicalScope } from './guardianClinicalAccess.service.js';
import { intakeAssessmentResponses } from './intakeAssessmentResponses.service.js';
import { fail } from './safetyPlans/template.js';

const screens = [
  {
    key: 'portal-gad-7', instrumentId: 'gad-7', title: 'GAD-7', audience: 'self', recipient: 'client',
    eligibleAge: age => age >= 18, en: buildGad7Fields, es: buildGad7FieldsEs
  },
  {
    key: 'portal-psc-17', instrumentId: 'psc-17', title: 'PSC-17 · Parent / guardian report',
    titleEs: 'PSC-17 · Informe del padre, madre o tutor', audience: 'guardian', recipient: 'guardian',
    eligibleAge: age => age >= 4 && age <= 17, en: buildPsc17Fields, es: buildPsc17FieldsEs
  }
];

export function portalScreenDefinition(key) {
  return screens.find(screen => screen.key === key);
}

export function familyPortalScreens(client, { audience, locale, service }) {
  if (service !== 'counseling') return [];
  const age = ageOn(client.date_of_birth);
  return screens.filter(screen => screen.audience === audience && Number.isFinite(age) && screen.eligibleAge(age))
    .map(screen => {
      const title = (locale === 'es' && screen.titleEs) || screen.title;
      const fields = screen[locale]().map(field => [
        field.key, field.label, { type: 'radio', required: true, options: field.options, helperText: field.helperText }
      ]);
      return { key: screen.key, title, instrumentId: screen.instrumentId, sections: [{ title, fields }], version: 1 };
    });
}

export async function requirePortalScreenRecipient(screen, row, recipientId, kind, allowCompletion) {
  if (!screen) return;
  if (!allowCompletion || !recipientId || kind !== screen.recipient) {
    fail(400, 'Assign this questionnaire for completion to the client or guardian indicated on the form.');
  }
  if (kind === 'guardian') {
    const link = await ClientGuardian.getLink({ clientId: row.client_id, guardianUserId: recipientId });
    if (Number(link?.access_enabled) !== 1 || link.permissions_json?.canSignDocs === false) {
      fail(403, 'Questionnaire completion is not enabled for this guardian.');
    }
    await requireClinicalScope({ agencyId: row.agency_id, clientId: row.client_id, userId: recipientId, scope: 'clinical_documents' });
  }
}

export function completedPortalScreen(template, data) {
  if (!portalScreenDefinition(template.source?.foundationKey)) return null;
  const [result] = intakeAssessmentResponses({ clinicalResponses: data });
  if (!result?.complete) fail(400, 'Answer each questionnaire item before submitting.');
  return { instrumentKey: result.instrumentKey, total: result.total };
}
