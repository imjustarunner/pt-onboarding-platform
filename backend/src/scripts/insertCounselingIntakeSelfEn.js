/**
 * Insert Master English self + parent/child counseling interviews into an
 * agency office digital master, preserving packet/consent steps.
 *
 * Usage:
 *   node backend/src/scripts/insertCounselingIntakeSelfEn.js [--agencyId=2]
 */
import AgencyOfficeIntakeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import { flattenIntakeFields, buildCounselingSelfEnSteps } from '../data/counselingIntakeSelfEn.js';
import {
  mergeCounselingOfficeEnIntoSteps,
  buildCounselingDependentEnSteps,
  COUNSELING_DEP_STEP_PREFIX
} from '../data/counselingIntakeDependentEn.js';
import { COUNSELING_SELF_STEP_PREFIX } from '../data/counselingIntakeSelfEn.js';

const agencyId = Number(
  (process.argv.find((a) => a.startsWith('--agencyId=')) || '--agencyId=2').split('=')[1]
);

function assertUniqueKeys(steps, label) {
  const keys = [];
  for (const step of steps) {
    for (const field of step.fields || []) {
      if (!field?.key) continue;
      keys.push(field.key);
    }
  }
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) {
    throw new Error(`Duplicate ${label} keys: ${[...new Set(dupes)].join(', ')}`);
  }
}

function assertShapes() {
  const self = buildCounselingSelfEnSteps();
  if (self.length !== 9) {
    throw new Error(`Expected 9 self counseling pages, got ${self.length}`);
  }
  assertUniqueKeys(self, 'self counseling');
  const dep = buildCounselingDependentEnSteps();
  const guardian = dep.filter((s) => s.audience === 'guardian').length;
  const childQuestions = dep.filter((s) => s.audience === 'dependent' && s.type === 'questions').length;
  if (guardian !== 1 || childQuestions !== 11) {
    throw new Error(`Expected 1 family + 11 child pages, got family=${guardian} child=${childQuestions}`);
  }
  assertUniqueKeys(dep, 'dependent counseling');
}

async function main() {
  assertShapes();
  const existing = await AgencyOfficeIntakeMaster.findByAgencyLanguage(agencyId, 'en');
  if (!existing) {
    throw new Error(`No English office master found for agency ${agencyId}`);
  }
  const nextSteps = mergeCounselingOfficeEnIntoSteps(existing.intake_steps || []);
  const nextFields = flattenIntakeFields(nextSteps);
  const master = await AgencyOfficeIntakeMaster.upsertContent({
    agencyId,
    languageCode: 'en',
    title: existing.title || 'Master Office Digital (EN)',
    intakeSteps: nextSteps,
    intakeFields: nextFields,
    actorUserId: 501,
    bumpVersion: true
  });
  const selfCount = (master.intake_steps || []).filter((s) =>
    String(s?.id || '').startsWith(COUNSELING_SELF_STEP_PREFIX)
  ).length;
  const depCount = (master.intake_steps || []).filter((s) =>
    String(s?.id || '').startsWith(COUNSELING_DEP_STEP_PREFIX)
  ).length;
  console.log(JSON.stringify({
    ok: true,
    agencyId,
    version: master.version,
    totalSteps: (master.intake_steps || []).length,
    selfPages: selfCount,
    dependentPages: depCount,
    fieldCount: Array.isArray(master.intake_fields) ? master.intake_fields.length : 0
  }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
