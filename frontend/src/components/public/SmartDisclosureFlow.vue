<template>
  <div class="smart-disclosure-flow">
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="stage === 'intro'" class="smart-disclosure-card">
      <div v-if="!isEmbeddedMode" class="progress-label">{{ tr('Step 1 of', 'Paso 1 de') }} {{ totalSteps }}</div>
      <h3 v-if="!isEmbeddedMode">{{ tr('Provider Disclosure Statement', 'Declaracion de Divulgacion del Proveedor') }}</h3>
      <p class="lead">
        {{ tr(
          'Please review the disclosure below, including licensed provider information, business entity details, and your rights.',
          'Revise la divulgacion a continuacion, incluida la informacion de proveedores con licencia, la entidad comercial y sus derechos.'
        ) }}
      </p>

      <div :class="isEmbeddedMode ? 'disclosure-scroll' : 'disclosure-full'">
      <section
        v-for="section in htmlSections"
        :key="section.id"
        class="disclosure-section"
      >
        <h4 v-if="section.title">{{ section.title }}</h4>
        <div class="disclosure-html" v-html="section.html" />
      </section>

      <section v-if="businessEntityBlock" class="disclosure-section">
        <h4>{{ tr('Business entity', 'Entidad comercial') }}</h4>
        <div v-if="businessEntityBlock.html" class="disclosure-html" v-html="businessEntityBlock.html" />
        <div v-else class="entity-block">
          <p v-if="businessEntityBlock.name"><strong>{{ businessEntityBlock.name }}</strong></p>
          <p v-if="businessEntityBlock.address">{{ businessEntityBlock.address }}</p>
          <p v-if="businessEntityBlock.phone">{{ businessEntityBlock.phone }}</p>
          <p v-if="businessEntityBlock.email">{{ businessEntityBlock.email }}</p>
          <div v-if="businessEntityBlock.text" class="disclosure-html" v-html="businessEntityBlock.text" />
        </div>
      </section>

      <section
        v-for="group in providerGroups"
        :key="group.key"
        class="disclosure-section provider-group"
      >
        <h4 class="provider-group__title">{{ group.label }}</h4>
        <div v-if="!group.providers.length" class="muted">
          {{ tr('None listed in this category.', 'Ninguno listado en esta categoria.') }}
        </div>
        <div
          v-for="provider in group.providers"
          :key="provider.id || provider.userId || provider.fullName"
          class="provider-row"
        >
          <div class="provider-row__name">
            {{ providerDisplayName(provider) }}
            <span v-if="provider.title || provider.credential" class="provider-row__title">
              {{ provider.title || provider.credential }}
            </span>
          </div>
          <div class="provider-row__meta">
            <div v-if="licenseLine(provider)">
              <span class="meta-label">{{ tr('License / Service Provider', 'Licencia / Proveedor de servicios') }}:</span>
              {{ licenseLine(provider) }}
            </div>
            <div v-if="provider.education">
              <span class="meta-label">{{ tr('Education', 'Educacion') }}:</span>
              {{ provider.education }}
            </div>
            <div v-for="(sup, idx) in supervisorLines(provider)" :key="`${provider.id || provider.fullName}-sup-${idx}`">
              <span class="meta-label">{{ sup.label }}:</span>
              {{ sup.value }}
            </div>
            <div v-if="provider.regulatoryBoard || provider.specificRegulatoryBoard">
              <span class="meta-label">{{ tr('Specific Regulatory Board', 'Junta regulatoria especifica') }}:</span>
              {{ provider.regulatoryBoard || provider.specificRegulatoryBoard }}
            </div>
          </div>
        </div>
      </section>

      <section v-if="rightsHtml" class="disclosure-section">
        <h4>{{ tr('Client rights', 'Derechos del cliente') }}</h4>
        <div class="disclosure-html" v-html="rightsHtml" />
      </section>

      <section v-if="levelsHtml" class="disclosure-section">
        <h4>{{ tr('Levels of regulation', 'Niveles de regulacion') }}</h4>
        <div class="disclosure-html" v-html="levelsHtml" />
      </section>

      <label v-if="isEmbeddedMode" class="ack-checkbox" :class="{ 'required-highlight': !acknowledged }">
        <input v-model="acknowledged" type="checkbox" />
        <span>
          {{ tr(
            'I acknowledge that I have reviewed this disclosure and the parties listed.',
            'Reconozco que he revisado esta divulgacion y las partes listadas.'
          ) }}
        </span>
      </label>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBackOrEmit">{{ tr('Back', 'Atras') }}</button>
        <button v-if="!hideIntroContinue || isEmbeddedMode" type="button" class="btn btn-primary" :disabled="isEmbeddedMode && !acknowledged" @click="goNext">
          {{ isEmbeddedMode ? tr('Continue to signature', 'Continuar a la firma') : tr('Continue', 'Continuar') }}
        </button>
      </div>
    </div>

    <div v-else-if="stage === 'acknowledge'" class="smart-disclosure-card">
      <div class="progress-label">{{ tr('Step', 'Paso') }} {{ stepNumber }} {{ tr('of', 'de') }} {{ totalSteps }}</div>
      <h3>{{ tr('Acknowledgment', 'Reconocimiento') }}</h3>
      <div v-if="acknowledgmentText" class="ack-body" v-html="acknowledgmentText" />
      <p v-else>
        {{ tr(
          'I have read and understand this disclosure statement, including the credentials and regulatory status of the providers listed.',
          'He leido y entiendo esta declaracion de divulgacion, incluidas las credenciales y el estado regulatorio de los proveedores listados.'
        ) }}
      </p>
      <label class="ack-checkbox" :class="{ 'required-highlight': !acknowledged }">
        <input v-model="acknowledged" type="checkbox" />
        <span>
          {{ tr(
            'I acknowledge that I have reviewed this disclosure and the parties listed.',
            'Reconozco que he revisado esta divulgacion y las partes listadas.'
          ) }}
        </span>
      </label>
      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">{{ tr('Back', 'Atras') }}</button>
        <button type="button" class="btn btn-primary" :disabled="!acknowledged" @click="goNext">
          {{ tr('Continue', 'Continuar') }}
        </button>
      </div>
    </div>

    <div v-else-if="stage === 'sign'" class="smart-disclosure-card">
      <div v-if="!isEmbeddedMode" class="progress-label">{{ tr('Step', 'Paso') }} {{ stepNumber }} {{ tr('of', 'de') }} {{ totalSteps }}</div>
      <h3>{{ tr('Electronic signature', 'Firma electronica') }}</h3>
      <p>
        {{ tr(
          'Apply your saved signature to complete this disclosure, or draw a new one.',
          'Aplique su firma guardada para completar esta divulgacion, o dibuje una nueva.'
        ) }}
      </p>

      <div v-if="signatureData && !forceResign" class="applied-sig">
        <div class="applied-sig-check">✓ {{ tr('Signature saved', 'Firma guardada') }}</div>
        <img :src="signatureData" alt="Saved signature" class="applied-sig-img" />
        <button type="button" class="btn btn-secondary btn-sm" @click="resign">
          {{ tr('Sign again', 'Firmar de nuevo') }}
        </button>
      </div>

      <template v-else>
        <div v-if="sessionSavedSignature" class="saved-sig-preview">
          <p class="muted small">{{ tr('Signature saved', 'Firma guardada') }}</p>
          <button type="button" class="saved-sig-thumb" @click="applySessionSignature">
            <img :src="sessionSavedSignature" alt="Saved signature preview" />
            <span>{{ tr('Apply my signature', 'Aplicar mi firma') }}</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="forceResign = true">
            {{ tr('Use a new signature', 'Usar una firma nueva') }}
          </button>
        </div>
        <div v-if="!sessionSavedSignature || forceResign" class="review-block">
          <SignaturePad
            compact
            :locale="resolvedLocale"
            :initial-value="''"
            @signed="onSigned"
          />
        </div>
      </template>

      <div class="actions">
        <button type="button" class="btn btn-secondary" @click="goBack">{{ tr('Back', 'Atras') }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="submitting || !signatureData || !acknowledged"
          @click="submitDisclosure"
        >
          {{
            submitting
              ? tr('Submitting...', 'Enviando...')
              : (isEmbeddedMode
                ? tr('Continue', 'Continuar')
                : tr('Complete disclosure', 'Completar divulgacion'))
          }}
        </button>
      </div>
    </div>

    <div v-else-if="stage === 'complete'" class="smart-disclosure-card">
      <h3>{{ tr('Disclosure completed', 'Divulgacion completada') }}</h3>
      <p>
        {{ tr(
          'The smart disclosure was signed successfully.',
          'La divulgacion inteligente se firmo correctamente.'
        ) }}
      </p>
      <div class="actions">
        <a
          v-if="downloadUrl"
          class="btn btn-primary"
          :href="downloadUrl"
          target="_blank"
          rel="noopener"
        >
          {{ tr('Download signed disclosure', 'Descargar divulgacion firmada') }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';

const CATEGORY_ORDER = ['FULLY_LICENSED', 'PRE_LICENSED', 'UNLICENSED'];
const CATEGORY_LABELS = {
  FULLY_LICENSED: { en: 'FULLY LICENSED', es: 'COMPLETAMENTE LICENCIADO' },
  PRE_LICENSED: { en: 'PRE-LICENSED', es: 'PRE-LICENCIADO' },
  UNLICENSED: { en: 'UNLICENSED', es: 'SIN LICENCIA' }
};

const props = defineProps({
  disclosureContext: {
    type: Object,
    default: null
  },
  publicKey: {
    type: String,
    required: true
  },
  submissionId: {
    type: [Number, String],
    default: null
  },
  sessionToken: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    default: 'standalone'
  },
  locale: {
    type: String,
    default: 'en'
  },
  link: {
    type: Object,
    default: null
  },
  boundClient: {
    type: Object,
    default: null
  },
  hideIntroContinue: {
    type: Boolean,
    default: false
  },
  savedCapture: {
    type: Object,
    default: null
  },
  sessionSavedSignature: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['completed', 'captured', 'back']);

const stageIndex = ref(0);
const localSubmissionId = ref(props.submissionId || null);
const signatureData = ref('');
const forceResign = ref(false);
const downloadUrl = ref('');
const submitting = ref(false);
const acknowledged = ref(false);
const error = ref('');

const resolvedLocale = computed(() => {
  const code = String(
    props.locale
    || props.disclosureContext?.locale
    || props.link?.language_code
    || 'en'
  ).trim().toLowerCase();
  return code.startsWith('es') ? 'es' : 'en';
});
const tr = (english, spanish) => (resolvedLocale.value === 'es' ? spanish : english);

const copy = computed(() => {
  const ctx = props.disclosureContext || {};
  return (ctx.copy && typeof ctx.copy === 'object') ? ctx.copy : {};
});

const htmlSections = computed(() => {
  const ctx = props.disclosureContext || {};
  if (Array.isArray(ctx.sections) && ctx.sections.length) {
    return ctx.sections
      .map((section, idx) => ({
        id: section.id || `section_${idx}`,
        title: section.title || '',
        html: String(section.html || section.body || section.content || '')
      }))
      .filter((section) => section.html);
  }
  const fromCopy = [];
  const pairs = [
    ['intro', copy.value.introTitle || tr('Introduction', 'Introduccion'), copy.value.introHtml || copy.value.intro],
    ['dora', copy.value.doraTitle || 'DORA', copy.value.doraHtml || copy.value.dora],
    ['levels', null, null] // rendered separately
  ];
  for (const [id, title, html] of pairs) {
    if (id === 'levels') continue;
    if (html) fromCopy.push({ id, title, html: String(html) });
  }
  return fromCopy;
});

const businessEntityBlock = computed(() => {
  const ctx = props.disclosureContext || {};
  const entity = ctx.businessEntity || ctx.business_entity || copy.value.businessEntity || null;
  const html = copy.value.businessEntityHtml || copy.value.business_entity_html || entity?.html || '';
  const text = copy.value.businessEntityText || entity?.text || '';
  if (!entity && !html && !text) return null;
  return {
    name: entity?.name || entity?.legalName || '',
    address: entity?.address || '',
    phone: entity?.phone || '',
    email: entity?.email || '',
    html: html || '',
    text: text || ''
  };
});

const rightsHtml = computed(() =>
  String(copy.value.rightsHtml || copy.value.clientRightsHtml || copy.value.rights || '').trim()
);
const levelsHtml = computed(() =>
  String(copy.value.levelsHtml || copy.value.levelsOfRegulationHtml || copy.value.levelsOfRegulation || '').trim()
);
const acknowledgmentText = computed(() =>
  String(copy.value.acknowledgmentHtml || copy.value.acknowledgmentText || copy.value.acknowledgment || '').trim()
);

const normalizeCategory = (raw) => {
  const value = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (value.includes('FULLY') || value === 'LICENSED') return 'FULLY_LICENSED';
  if (value.includes('PRE')) return 'PRE_LICENSED';
  if (value.includes('UNLICENSED') || value === 'UNLICENSED') return 'UNLICENSED';
  return 'UNLICENSED';
};

const providers = computed(() => {
  const list = props.disclosureContext?.providers;
  return Array.isArray(list) ? list : [];
});

const categoryLabel = (key) => {
  const fromCopy = {
    FULLY_LICENSED: copy.value.fullyLicensedHeading || copy.value.fully_licensed_heading,
    PRE_LICENSED: copy.value.preLicensedHeading || copy.value.pre_licensed_heading,
    UNLICENSED: copy.value.unlicensedHeading || copy.value.unlicensed_heading
  }[key];
  if (fromCopy) return String(fromCopy);
  const labels = CATEGORY_LABELS[key] || CATEGORY_LABELS.UNLICENSED;
  return resolvedLocale.value === 'es' ? labels.es : labels.en;
};

const providerGroups = computed(() =>
  CATEGORY_ORDER.map((key) => ({
    key,
    label: categoryLabel(key),
    providers: providers.value.filter((p) => normalizeCategory(p.category || p.licenseCategory || p.credentialCategory) === key)
  }))
);

const isEmbeddedMode = computed(() => String(props.mode || '').toLowerCase() === 'embedded');
const stageOrder = computed(() => (
  isEmbeddedMode.value ? ['intro', 'sign', 'complete'] : ['intro', 'acknowledge', 'sign', 'complete']
));
const stage = computed(() => stageOrder.value[stageIndex.value] || 'intro');
const totalSteps = computed(() => Math.max(stageOrder.value.length - 1, 1));
const stepNumber = computed(() => Math.min(stageIndex.value + 1, totalSteps.value));

watch(
  () => props.submissionId,
  (next) => {
    if (next != null && next !== '') localSubmissionId.value = next;
  }
);

const providerDisplayName = (provider) => {
  const name = String(provider.fullName || provider.full_name || '').trim();
  if (name) return name;
  return [provider.firstName || provider.first_name, provider.lastName || provider.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || '—';
};

const licenseLine = (provider) => {
  if (provider.licenseNumber || provider.license_number) {
    return String(provider.licenseNumber || provider.license_number);
  }
  if (provider.serviceProvider || provider.service_provider) {
    return String(provider.serviceProvider || provider.service_provider);
  }
  if (provider.serviceProviderLabel || provider.service_provider_label) {
    return String(provider.serviceProviderLabel || provider.service_provider_label);
  }
  if (provider.licenseOrServiceProvider) return String(provider.licenseOrServiceProvider);
  return '';
};

const supervisorLines = (provider) => {
  const lines = [];
  const supervisors = Array.isArray(provider.supervisors) ? provider.supervisors : [];
  for (const sup of supervisors) {
    const name = String(sup.fullName || sup.name || '').trim();
    if (!name) continue;
    const kind = String(sup.type || sup.kind || '').toLowerCase();
    const label = kind.includes('billing')
      ? tr('Billing supervisor', 'Supervisor de facturacion')
      : tr('Clinical supervisor', 'Supervisor clinico');
    const credential = String(sup.credential || '').trim();
    lines.push({ label, value: credential ? `${name}, ${credential}` : name });
  }
  if (!lines.length) {
    if (provider.clinicalSupervisor) {
      lines.push({
        label: tr('Clinical supervisor', 'Supervisor clinico'),
        value: String(provider.clinicalSupervisor)
      });
    }
    if (provider.billingSupervisor) {
      lines.push({
        label: tr('Billing supervisor', 'Supervisor de facturacion'),
        value: String(provider.billingSupervisor)
      });
    }
  }
  return lines;
};

const goNext = () => {
  error.value = '';
  if (stage.value === 'complete') {
    emit('captured', { smartDisclosure: buildDisclosurePayload() });
    return;
  }
  if ((stage.value === 'acknowledge' || (isEmbeddedMode.value && stage.value === 'intro')) && !acknowledged.value) {
    error.value = tr('Please acknowledge the disclosure to continue.', 'Reconozca la divulgacion para continuar.');
    return;
  }
  if (stage.value === 'sign') {
    submitDisclosure();
    return;
  }
  if (stageIndex.value < stageOrder.value.length - 1) {
    stageIndex.value += 1;
  }
};

const goBack = () => {
  error.value = '';
  if (stageIndex.value > 0) stageIndex.value -= 1;
};

const goBackOrEmit = () => {
  if (stageIndex.value > 0) {
    goBack();
    return;
  }
  emit('back');
};

defineExpose({ goNext, goBack });

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl || '';
  forceResign.value = false;
  error.value = '';
};

function applySessionSignature() {
  const sig = String(props.sessionSavedSignature || '').trim();
  if (!sig) return;
  signatureData.value = sig;
  forceResign.value = false;
  error.value = '';
}

function resign() {
  signatureData.value = '';
  forceResign.value = true;
}

watch(
  () => props.savedCapture,
  (saved) => {
    if (!saved?.signatureData) return;
    acknowledged.value = true;
    signatureData.value = saved.signatureData;
    const signIdx = stageOrder.value.indexOf('sign');
    if (signIdx >= 0) stageIndex.value = signIdx;
  },
  { immediate: true }
);

const buildDisclosurePayload = () => ({
  acknowledged: !!acknowledged.value,
  signatureData: signatureData.value || null,
  locale: resolvedLocale.value,
  contentHash: props.disclosureContext?.contentHash || props.disclosureContext?.content_hash || null,
  providers: providers.value.map((p) => ({
    id: p.id || p.userId || p.user_id || null,
    fullName: providerDisplayName(p),
    category: normalizeCategory(p.category || p.licenseCategory || p.credentialCategory),
    credentialFingerprint: p.credentialFingerprint || p.credential_fingerprint || null,
    licenseNumber: p.licenseNumber || p.license_number || null,
    education: p.education || null,
    regulatoryBoard: p.regulatoryBoard || p.specificRegulatoryBoard || null
  })),
  businessEntity: businessEntityBlock.value
    ? {
        name: businessEntityBlock.value.name || null,
        address: businessEntityBlock.value.address || null
      }
    : null
});

const buildSubmissionPayload = () => {
  const client = props.disclosureContext?.client || props.boundClient || {};
  const clientId = client.id || client.client_id || null;
  const fullName = client.fullName || client.full_name || '';
  return {
    sessionToken: props.sessionToken || null,
    signerName: fullName || null,
    signerEmail: '',
    intakeData: {
      smartDisclosure: buildDisclosurePayload(),
      clients: clientId || fullName
        ? [{ id: clientId, fullName: fullName || null }]
        : []
    }
  };
};

const withRequestTimeout = (promise, ms = 30000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('request_timeout')), ms);
    })
  ]);

const submitDisclosure = async () => {
  if (!acknowledged.value) {
    error.value = tr('Please acknowledge the disclosure to continue.', 'Reconozca la divulgacion para continuar.');
    return;
  }
  if (!signatureData.value) {
    error.value = tr('Please save your signature before submitting.', 'Guarde su firma antes de enviar.');
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const payload = buildDisclosurePayload();
    if (isEmbeddedMode.value) {
      emit('captured', { smartDisclosure: payload });
      return;
    }
    if (!localSubmissionId.value) {
      const consentResp = await withRequestTimeout(
        api.post(`/public-intake/${props.publicKey}/consent`, buildSubmissionPayload()),
        45000
      );
      localSubmissionId.value = consentResp.data?.submission?.id || null;
      if (consentResp.data?.alreadyCompleted) {
        downloadUrl.value = consentResp.data?.downloadUrl || '';
        stageIndex.value = stageOrder.value.indexOf('complete');
        emit('completed', {
          submissionId: localSubmissionId.value,
          downloadUrl: downloadUrl.value,
          emailDelivery: consentResp.data?.emailDelivery || null
        });
        return;
      }
    }
    if (!localSubmissionId.value) {
      error.value = tr('Unable to start this signing session.', 'No se pudo iniciar esta sesion de firma.');
      return;
    }
    const finalizeResp = await withRequestTimeout(
      api.post(`/public-intake/${props.publicKey}/${localSubmissionId.value}/finalize`, {
        ...buildSubmissionPayload(),
        submissionId: localSubmissionId.value,
        signatureData: signatureData.value,
        intakeData: {
          smartDisclosure: payload
        }
      }),
      60000
    );
    downloadUrl.value = finalizeResp.data?.downloadUrl || '';
    stageIndex.value = stageOrder.value.indexOf('complete');
    emit('completed', {
      submissionId: localSubmissionId.value,
      downloadUrl: downloadUrl.value,
      emailDelivery: finalizeResp.data?.emailDelivery || null
    });
  } catch (err) {
    if (String(err?.message || '').includes('request_timeout')) {
      error.value = tr(
        'This is taking too long to submit. Please retry in a few seconds.',
        'Esto esta tardando demasiado. Intente de nuevo en unos segundos.'
      );
    } else {
      error.value = err.response?.data?.error?.message
        || tr('Failed to complete the smart disclosure.', 'No se pudo completar la divulgacion inteligente.');
    }
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.smart-disclosure-flow {
  display: grid;
  gap: 16px;
}

.smart-disclosure-card {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

.smart-disclosure-card > h3 {
  color: var(--df-primary, #1e4d3b);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.progress-label {
  color: var(--df-primary, var(--text-secondary));
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.lead {
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.disclosure-scroll {
  max-height: min(58vh, 640px);
  overflow: auto;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 12px 14px;
  background: #fafafa;
  margin: 0 0 12px;
}

.disclosure-section {
  margin: 18px 0;
  padding-top: 8px;
  border-top: 1px solid var(--border, #e2e8f0);
}

.disclosure-section > h4,
.provider-group__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--df-primary, #1e4d3b);
}

.disclosure-html :deep(p) {
  margin: 0 0 10px;
  line-height: 1.55;
}

.disclosure-html :deep(ul),
.disclosure-html :deep(ol) {
  margin: 0 0 10px 1.2rem;
  padding: 0;
}

.entity-block p {
  margin: 0 0 4px;
}

.provider-group__title {
  text-transform: uppercase;
}

.provider-row {
  padding: 12px 0;
  border-bottom: 1px dashed var(--border, #e2e8f0);
}

.provider-row:last-child {
  border-bottom: none;
}

.provider-row__name {
  font-weight: 700;
  margin-bottom: 6px;
}

.provider-row__title {
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 6px;
}

.provider-row__meta {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-label {
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 4px;
}

.ack-checkbox {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 16px 0;
  padding: 12px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-secondary, #f8fafc);
  cursor: pointer;
}

.ack-checkbox.required-highlight {
  border-color: #f59e0b;
  background: #fffbeb;
}

.ack-checkbox input {
  margin-top: 3px;
}

.ack-body {
  line-height: 1.55;
}

.review-block {
  margin: 16px 0;
}

.saved-sig-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0;
}
.saved-sig-thumb {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  max-width: 320px;
  text-align: left;
  font: inherit;
  font-weight: 700;
  color: #0f766e;
}
.saved-sig-thumb img {
  max-width: 240px;
  max-height: 72px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.applied-sig {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}
.applied-sig-check {
  font-weight: 700;
  color: #166534;
}
.applied-sig-img {
  max-width: 280px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
}

.muted {
  color: var(--text-secondary, #64748b);
  font-size: 13px;
}
</style>
