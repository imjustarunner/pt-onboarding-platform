import { ref, computed, unref, watch } from 'vue';
import api from '../services/api';

const PSC17_CUTOFFS = { total: 15, internalizing: 5, attention: 7, externalizing: 7 };
const PSC17_SUBSCALE_MAX = { internalizing: 10, attention: 10, externalizing: 14 };
const PSC17_SUBSCALE_LABEL = {
  internalizing: 'Internalizing',
  attention: 'Attention',
  externalizing: 'Externalizing'
};
const PSC17_SUBSCALE_BY_ITEM = {
  1: 'attention', 2: 'attention', 3: 'attention', 4: 'attention', 7: 'attention',
  5: 'internalizing', 6: 'internalizing', 9: 'internalizing', 10: 'internalizing', 11: 'internalizing',
  8: 'externalizing', 12: 'externalizing', 13: 'externalizing', 14: 'externalizing',
  15: 'externalizing', 16: 'externalizing', 17: 'externalizing'
};
const PSC17_CANONICAL_LABELS = {
  1: 'Fidgety, unable to sit still',
  2: 'Acts as if driven by a motor',
  3: 'Daydreams too much',
  4: 'Distracted easily',
  5: 'Feels sad, unhappy',
  6: 'Feels hopeless',
  7: 'Has trouble concentrating',
  8: 'Fights with others',
  9: 'Is down on him or herself',
  10: 'Worries a lot',
  11: 'Seems to be having less fun',
  12: 'Does not listen to rules',
  13: "Does not understand other people's feelings",
  14: 'Teases others',
  15: 'Blames others for his or her troubles',
  16: 'Takes things that do not belong to him or her',
  17: 'Refuses to share'
};
const PSC17_LABEL_RULES = [
  { sub: 'internalizing', tests: [/feels?\s+sad/i, /unhappy/i, /hopeless/i, /down on (him|her|them)/i, /low\s+self/i, /less fun/i, /worri/i] },
  { sub: 'attention', tests: [/fidget/i, /sit still/i, /driven by a motor/i, /daydream/i, /distract/i, /trouble concentrat/i, /(can'?t|cannot) concentrat/i] },
  { sub: 'externalizing', tests: [/fights? with/i, /(does ?not|doesn'?t) listen/i, /listen to rules/i, /teases?/i, /blames? others/i, /takes? things/i, /refuses? to share/i, /(other people'?s|others'?) feelings/i] }
];
const PSC_SCORE_LABEL = ['Never (0)', 'Sometimes (1)', 'Often (2)'];
const CLINICAL_SECTION_CARD_VARIANT = new Map([
  ['PSC-17 Behavioral Assessment', 'ov-card--clinical-psc'],
  ['Clinical Questions', 'ov-card--clinical-questions'],
  ['Clinical Intake Fields', 'ov-card--clinical-questions'],
  ['Trauma / Abuse History', 'ov-card--clinical-trauma'],
  ['Counseling Goals', 'ov-card--clinical-goals'],
  ['Additional Notes & Medical', 'ov-card--clinical-notes'],
  ['Additional Intake Responses', 'ov-card--clinical-other']
]);

const itemNumberFromPscKey = (key) => {
  const m = String(key || '').match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 17 ? n : null;
};

const subscaleForPscField = (field) => {
  const item = itemNumberFromPscKey(field?.key);
  if (item && PSC17_SUBSCALE_BY_ITEM[item]) return PSC17_SUBSCALE_BY_ITEM[item];
  const label = String(field?.label || '');
  for (const rule of PSC17_LABEL_RULES) {
    if (rule.tests.some((re) => re.test(label))) return rule.sub;
  }
  return null;
};

const parsePscScore = (raw) => {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^[012]$/.test(s)) return Number(s);
  const numMatch = s.match(/(?:^|[^0-9])([012])(?:[^0-9]|$)/);
  if (/never/.test(s)) return 0;
  if (/sometimes/.test(s)) return 1;
  if (/(very )?often/.test(s)) return 2;
  if (numMatch) return Number(numMatch[1]);
  return null;
};

const insuranceSlotFromFieldKey = (key) => {
  const m = String(key || '').match(/^insurance__(primary|secondary)_(front|back)_url$/i);
  return m ? `${m[1].toLowerCase()}_${m[2].toLowerCase()}` : null;
};

const isInsuranceCardField = (field) => {
  const slot = insuranceSlotFromFieldKey(field?.key);
  return !!slot && String(field?.value || '').trim().toLowerCase().startsWith('gs://');
};

/**
 * Clinical intake responses + PSC-17 scoring for the client chart Clinical tab.
 */
export function useClientClinicalResponses(client, options = {}) {
  const isClinicalLike = options.isClinicalLikeClientType || (() => true);
  const isBackoffice = options.isBackofficeRole || (() => false);
  const hasAgencyAccess = options.hasAgencyAccess || (() => true);

  const clinicalSections = ref([]);
  const clinicalCapturedAt = ref(null);
  const clinicalLoading = ref(false);
  const clinicalError = ref('');
  const clinicalDebug = ref('');
  const clinicalDebugLoading = ref(false);
  const clinicalTemplateMode = ref(false);
  const clinicalEditable = ref(false);
  const clinicalEditing = ref(false);
  const clinicalEditForm = ref({});
  const clinicalSaving = ref(false);
  const clinicalEncryptionKeyMissing = ref(false);
  const pscExpanded = ref(false);

  const clinicalTotalFieldCount = computed(() =>
    (clinicalSections.value || []).reduce((acc, s) => acc + (s?.fields?.length || 0), 0)
  );

  const canEditClinicalResponses = computed(
    () => clinicalEditable.value && unref(isClinicalLike) && unref(isBackoffice) && unref(hasAgencyAccess)
  );

  const canEditClinicalField = (field) => {
    if (isInsuranceCardField(field)) return false;
    return !!field?.key;
  };

  const hydrateClinicalEditForm = () => {
    const next = {};
    for (const section of clinicalSections.value || []) {
      for (const field of section?.fields || []) {
        if (!field?.key || isInsuranceCardField(field)) continue;
        next[field.key] = field.value ?? '';
      }
    }
    clinicalEditForm.value = next;
  };

  const startClinicalEdit = () => {
    hydrateClinicalEditForm();
    clinicalEditing.value = true;
  };

  const cancelClinicalEdit = () => {
    clinicalEditing.value = false;
    hydrateClinicalEditForm();
  };

  const isPscSection = (section) =>
    String(section?.title || '').toLowerCase().includes('psc');

  const clinicalSectionCardClass = (section) =>
    CLINICAL_SECTION_CARD_VARIANT.get(section?.title) || 'ov-card--clinical-other';

  const psc17ItemsOrdered = (section) => {
    const items = (section?.fields || []).map((f) => {
      const score = parsePscScore(f.value);
      const sub = subscaleForPscField(f);
      const itemNumber = itemNumberFromPscKey(f.key);
      const rawLabel = String(f.label || '').trim();
      const isPlaceholderLabel = !rawLabel || /^psc[ _-]?item\b/i.test(rawLabel);
      const label = isPlaceholderLabel && itemNumber && PSC17_CANONICAL_LABELS[itemNumber]
        ? PSC17_CANONICAL_LABELS[itemNumber]
        : rawLabel || (itemNumber ? PSC17_CANONICAL_LABELS[itemNumber] : f.key);
      return {
        key: f.key,
        label,
        itemNumber,
        score,
        scoreLabel: score === null ? String(f.value ?? '—') : PSC_SCORE_LABEL[score],
        subscaleLabel: sub ? PSC17_SUBSCALE_LABEL[sub] : null,
        scoreClass:
          score === 2 ? 'is-often' : score === 1 ? 'is-sometimes' : score === 0 ? 'is-never' : 'is-unscored'
      };
    });
    items.sort((a, b) => (a.itemNumber || 99) - (b.itemNumber || 99));
    return items;
  };

  const psc17Summary = computed(() => {
    const section = (clinicalSections.value || []).find(isPscSection);
    if (!section || !section.fields?.length) return null;

    const subTotals = { internalizing: 0, attention: 0, externalizing: 0 };
    const subUnscored = { internalizing: 0, attention: 0, externalizing: 0 };
    const subExpected = { internalizing: 5, attention: 5, externalizing: 7 };
    let total = 0;
    let scored = 0;
    let unscored = 0;
    for (const f of section.fields) {
      const score = parsePscScore(f.value);
      const sub = subscaleForPscField(f);
      if (score === null) {
        unscored += 1;
        if (sub && subUnscored[sub] !== undefined) subUnscored[sub] += 1;
        continue;
      }
      scored += 1;
      total += score;
      if (sub && subTotals[sub] !== undefined) subTotals[sub] += score;
    }

    const subscales = ['internalizing', 'attention', 'externalizing'].map((id) => ({
      id,
      label: PSC17_SUBSCALE_LABEL[id],
      score: subTotals[id],
      max: PSC17_SUBSCALE_MAX[id],
      cutoff: PSC17_CUTOFFS[id],
      expectedItems: subExpected[id],
      unscoredItems: subUnscored[id],
      elevated: subTotals[id] >= PSC17_CUTOFFS[id]
    }));

    const totalElevated = total >= PSC17_CUTOFFS.total;
    const elevatedSubs = subscales.filter((s) => s.elevated);

    let interpretation;
    if (!scored) {
      interpretation =
        'No PSC-17 items could be scored from the submitted responses. '
        + 'Verify that responses use Never/Sometimes/Often or 0/1/2 values.\n\n'
        + 'Without scored items the screening cannot be interpreted.\n\n'
        + 'Re-administer the PSC-17 with valid response options and rescore.';
    } else {
      const subSummary = subscales
        .map((s) => `${s.label} ${s.score} of ${s.max} (cutoff >=${s.cutoff})`)
        .join('; ');
      const scoreSection =
        `Total score: ${total} of 34 (cutoff >=${PSC17_CUTOFFS.total}). `
        + `Subscale scores: ${subSummary}.`;

      const interpParts = [];
      if (totalElevated) {
        interpParts.push(
          `The total score is at or above the >=${PSC17_CUTOFFS.total} cutoff for overall psychosocial impairment.`
        );
      } else {
        interpParts.push(
          `The total score is below the >=${PSC17_CUTOFFS.total} cutoff for overall psychosocial impairment.`
        );
      }
      if (elevatedSubs.length) {
        const subText = elevatedSubs
          .map((s) => `${s.label} (${s.score} of ${s.max}, cutoff >=${s.cutoff})`)
          .join(', ');
        interpParts.push(
          `The following subscale${elevatedSubs.length > 1 ? 's are' : ' is'} at or above threshold and indicate${elevatedSubs.length > 1 ? '' : 's'} elevated risk: ${subText}.`
        );
      } else {
        interpParts.push('No individual subscale is at or above its screening threshold.');
      }
      if (unscored) {
        interpParts.push(
          `Note: ${unscored} item${unscored === 1 ? ' was' : 's were'} not scored, which may underestimate the affected subscale totals.`
        );
      }
      const interpretationSection = interpParts.join(' ');

      let recommendationSection;
      if (totalElevated || elevatedSubs.length) {
        recommendationSection =
          'Recommend follow-up clinical evaluation to confirm the screening signal, complete a comprehensive psychosocial assessment, and identify appropriate supports. '
          + 'Cutoffs are screening thresholds and are not diagnostic; final determinations require a full clinical assessment.';
      } else {
        recommendationSection =
          'No follow-up clinical evaluation is indicated by this screening at this time. Continue routine monitoring and rescreen if concerns arise. '
          + 'Cutoffs are screening thresholds and are not diagnostic.';
      }

      interpretation = `${scoreSection}\n\n${interpretationSection}\n\n${recommendationSection}`;
    }

    return {
      total,
      totalMax: 34,
      totalElevated,
      cutoffs: PSC17_CUTOFFS,
      subscales,
      scored,
      unscored,
      interpretation
    };
  });

  const psc17InterpretationParagraphs = computed(() => {
    const text = psc17Summary.value?.interpretation || '';
    return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  });

  const findSection = (matcher) =>
    (clinicalSections.value || []).find((s) => matcher(String(s?.title || '').toLowerCase()));

  const goalsSection = computed(() => findSection((t) => t.includes('goal')));
  const traumaSection = computed(() => findSection((t) => t.includes('trauma') || t.includes('abuse')));
  const medicalSection = computed(() => findSection((t) => t.includes('medical') || t.includes('notes & medical')));
  const pscSection = computed(() => (clinicalSections.value || []).find(isPscSection) || null);

  const detailSections = computed(() =>
    (clinicalSections.value || []).filter((s) => {
      const title = String(s?.title || '').toLowerCase();
      if (isPscSection(s)) return true;
      return !title.includes('goal') && !title.includes('trauma') && !title.includes('abuse');
    })
  );

  const findFieldByLabel = (patterns) => {
    for (const section of clinicalSections.value || []) {
      for (const field of section?.fields || []) {
        const label = String(field?.label || '').toLowerCase();
        const key = String(field?.key || '').toLowerCase();
        if (patterns.some((re) => re.test(label) || re.test(key))) return field;
      }
    }
    return null;
  };

  const keyInfoItems = computed(() => {
    const items = [];
    const allergy = findFieldByLabel([/allerg/i]);
    const meds = findFieldByLabel([/medication/i, /medicine/i, /current med/i]);
    const pharmacy = findFieldByLabel([/pharmacy/i]);
    if (allergy?.value) items.push({ label: 'Allergies', value: allergy.value });
    if (meds?.value) items.push({ label: 'Current medications', value: meds.value });
    if (pharmacy?.value) items.push({ label: 'Pharmacy', value: pharmacy.value });
    if (!items.length && medicalSection.value) {
      const preview = (medicalSection.value.fields || [])
        .filter((f) => String(f?.value || '').trim())
        .slice(0, 3);
      for (const f of preview) {
        items.push({ label: f.label, value: f.value });
      }
    }
    return items;
  });

  const goalsPreview = computed(() => {
    const fields = goalsSection.value?.fields || [];
    return fields
      .filter((f) => String(f?.value || '').trim())
      .slice(0, 3)
      .map((f) => ({ label: f.label, value: f.value }));
  });

  const clinicalSummaryText = computed(() => {
    const parts = [];
    const questions = findSection((t) => t.includes('clinical question') || t.includes('clinical intake'));
    if (questions?.fields?.length) {
      const narrative = questions.fields
        .filter((f) => String(f?.value || '').trim().length > 40)
        .slice(0, 2);
      for (const f of narrative) {
        parts.push(`${f.label}: ${f.value}`);
      }
    }
    if (!parts.length && medicalSection.value) {
      const f = (medicalSection.value.fields || []).find((x) => String(x?.value || '').trim().length > 20);
      if (f) parts.push(String(f.value).trim());
    }
    return parts.join('\n\n');
  });

  const riskLevelLabel = computed(() => {
    if (psc17Summary.value?.totalElevated) return 'Elevated';
    if (psc17Summary.value) return 'Within normal range';
    return '—';
  });

  async function fetchClinicalResponses(force = false) {
    const c = unref(client);
    if (!c?.id) return;
    if (!unref(isClinicalLike)) {
      clinicalSections.value = [];
      clinicalCapturedAt.value = null;
      clinicalTemplateMode.value = false;
      clinicalEditable.value = false;
      clinicalEditing.value = false;
      return;
    }
    if (!force && clinicalSections.value.length > 0) return;
    try {
      clinicalLoading.value = true;
      clinicalError.value = '';
      clinicalDebug.value = '';
      const r = await api.get(`/clients/${c.id}/clinical-responses`);
      clinicalSections.value = r.data?.sections || [];
      clinicalCapturedAt.value = r.data?.capturedAt || null;
      clinicalEncryptionKeyMissing.value = !!r.data?.encryptionKeyMissing;
      clinicalTemplateMode.value = !!r.data?.templateMode;
      clinicalEditable.value = !!r.data?.editable;
      if (clinicalEditing.value) hydrateClinicalEditForm();
    } catch (e) {
      clinicalError.value = e.response?.data?.error?.message || 'Failed to load clinical responses';
    } finally {
      clinicalLoading.value = false;
    }
  }

  async function saveClinicalResponses() {
    const c = unref(client);
    if (!canEditClinicalResponses.value || !c?.id) return;
    try {
      clinicalSaving.value = true;
      clinicalError.value = '';
      await api.put(`/clients/${c.id}/clinical-responses`, {
        responses: clinicalEditForm.value,
        reason: 'Admin updated clinical profile fields from client profile'
      });
      await fetchClinicalResponses(true);
      clinicalEditing.value = false;
    } catch (e) {
      clinicalError.value = e.response?.data?.error?.message || 'Failed to save clinical responses';
    } finally {
      clinicalSaving.value = false;
    }
  }

  async function loadClinicalDebug() {
    const c = unref(client);
    if (!c?.id) return;
    try {
      clinicalDebugLoading.value = true;
      const r = await api.get(`/clients/${c.id}/clinical-responses`, { params: { debug: 1 } });
      clinicalDebug.value = JSON.stringify(r.data?._debug || r.data || {}, null, 2);
    } catch (e) {
      clinicalDebug.value = `Debug fetch failed: ${e.response?.data?.error?.message || e.message}`;
    } finally {
      clinicalDebugLoading.value = false;
    }
  }

  async function viewInsuranceCard(clientId, slot) {
    const cid = Number(clientId || 0);
    if (!cid || !slot) return;
    try {
      const r = await api.get(`/clients/${cid}/insurance-card`, {
        params: { slot },
        responseType: 'blob'
      });
      const contentType = r?.headers?.['content-type'] || 'application/octet-stream';
      const blob = new Blob([r.data], { type: contentType });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error('[client insurance] view failed', e?.response?.data?.error?.message || e?.message || e);
    }
  }

  watch(
    () => [unref(client)?.id, unref(isClinicalLike)],
    () => { void fetchClinicalResponses(true); },
    { immediate: true }
  );

  return {
    clinicalSections,
    clinicalCapturedAt,
    clinicalLoading,
    clinicalError,
    clinicalDebug,
    clinicalDebugLoading,
    clinicalTemplateMode,
    clinicalEditing,
    clinicalEditForm,
    clinicalSaving,
    clinicalEncryptionKeyMissing,
    pscExpanded,
    clinicalTotalFieldCount,
    canEditClinicalResponses,
    canEditClinicalField,
    startClinicalEdit,
    cancelClinicalEdit,
    saveClinicalResponses,
    fetchClinicalResponses,
    loadClinicalDebug,
    isPscSection,
    clinicalSectionCardClass,
    psc17ItemsOrdered,
    psc17Summary,
    psc17InterpretationParagraphs,
    goalsSection,
    traumaSection,
    medicalSection,
    pscSection,
    detailSections,
    keyInfoItems,
    goalsPreview,
    clinicalSummaryText,
    riskLevelLabel,
    viewInsuranceCard,
    insuranceSlotFromFieldKey,
    isInsuranceCardField
  };
}
