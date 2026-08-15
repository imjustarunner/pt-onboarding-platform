<template>
  <form class="pas-form" @submit.prevent="submit">
    <input
      v-model="form.website"
      type="text"
      class="pas-honeypot"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
    />
    <label class="pas-span">
      How can we help today?
      <select v-model="form.category" required>
        <option disabled value="">Select a category</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
    </label>
    <div class="pas-contact-row">
      <label>
        Your name
        <input v-model.trim="form.name" type="text" required maxlength="120" />
      </label>
      <label>
        Email
        <input v-model.trim="form.email" type="email" required maxlength="255" />
      </label>
      <label>
        Phone number
        <input v-model.trim="form.phone" type="tel" required maxlength="40" placeholder="Best number to call or text" />
      </label>
    </div>
    <label class="pas-check">
      <input v-model="form.preferText" type="checkbox" />
      <span>Please text me back instead of calling</span>
    </label>
    <label class="pas-span">
      Your message
      <textarea v-model.trim="form.message" rows="5" required maxlength="4000" placeholder="Tell us what's going on — we're here to help." />
    </label>

    <div v-if="looksLikePhi" class="pas-smart">
      <p>
        It looks like your message may include health details — that's okay.
        For extra privacy, you can log in and send us a secure message in your portal.
        You're also welcome to send it here.
      </p>
      <div class="pas-smart-actions">
        <router-link v-if="joinPath" class="pas-mini" :to="joinPath">Looking for a counselor?</router-link>
        <router-link v-if="loginPath" class="pas-mini" :to="loginPath">Log in to your portal</router-link>
      </div>
    </div>

    <p class="pas-phi">{{ phiWarning }}</p>
    <p v-if="loginPath" class="pas-phi">
      Want something more private?
      <router-link :to="loginPath">Log in to your portal</router-link>
      and send us a secure message there.
    </p>
    <label class="pas-check">
      <input v-model="form.phiAcknowledged" type="checkbox" />
      <span>
        I've read the note above. I understand this page is less secure than messaging us in your portal, and I won't
        include my Social Security number or payment card information.
      </span>
    </label>
    <p v-if="error" class="pas-error">{{ error }}</p>
    <p v-if="success" class="pas-ok">{{ success }}</p>
    <button type="submit" class="pas-submit" :style="{ background: accent }" :disabled="sending || !canSubmit">
      {{ sending ? 'Sending…' : 'Send my message' }}
    </button>
  </form>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { scanPublicSupportContent } from '../../utils/publicSupportScan';

const props = defineProps({
  agencySlug: { type: String, required: true },
  defaultCategory: { type: String, default: '' },
  config: { type: Object, default: null },
  joinPath: { type: String, default: '' },
  loginPath: { type: String, default: '' },
  accent: { type: String, default: '#1b3d2f' }
});

const categories = ref([]);
const phiWarning = ref(
  'If sharing health details would help us respond, you can include them here. This page isn\'t as secure as messaging us inside your portal. Please don\'t include Social Security or payment card numbers.'
);
const recaptchaSiteKey = ref('');
const recaptchaRequired = ref(false);
const sending = ref(false);
const error = ref('');
const success = ref('');
const form = reactive({
  category: props.defaultCategory || '',
  name: '',
  email: '',
  phone: '',
  preferText: false,
  message: '',
  phiAcknowledged: false,
  website: ''
});

const looksLikePhi = computed(() => scanPublicSupportContent(form.message).flags.includes('possible_phi'));

const canSubmit = computed(() =>
  form.phiAcknowledged
  && form.name.trim().length >= 2
  && form.email.includes('@')
  && String(form.phone || '').replace(/\D/g, '').length >= 7
  && form.message.trim().length >= 10
  && !!form.category
);

function applyConfig(data) {
  if (!data) return;
  categories.value = data.categories || categories.value;
  if (data.phiWarning) phiWarning.value = data.phiWarning;
  recaptchaSiteKey.value = data.recaptchaSiteKey || '';
  recaptchaRequired.value = !!data.recaptchaRequired;
  if (!form.category && categories.value[0]) form.category = categories.value[0].id;
}

watch(
  () => props.defaultCategory,
  (next) => {
    if (next) form.category = next;
  }
);

watch(
  () => props.config,
  (next) => applyConfig(next),
  { immediate: true }
);

onMounted(async () => {
  if (props.config) return;
  try {
    const { data } = await api.get(`/public/agency-support/${encodeURIComponent(props.agencySlug)}`, {
      skipGlobalLoading: true
    });
    applyConfig(data);
  } catch {
    categories.value = [
      { id: 'other', label: 'Something else' },
      { id: 'parent_access', label: 'Help with parent or guardian login' }
    ];
  }
});

async function getCaptchaToken() {
  const siteKey = recaptchaSiteKey.value || String(import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();
  if (!siteKey) return '';
  await new Promise((resolve, reject) => {
    if (window.grecaptcha?.execute) return resolve();
    const existing = document.querySelector('script[data-public-support-recaptcha="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('captcha')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.setAttribute('data-public-support-recaptcha', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('captcha'));
    document.head.appendChild(script);
  });
  return window.grecaptcha.execute(siteKey, { action: 'public_agency_support' });
}

async function submit() {
  error.value = '';
  success.value = '';
  if (!canSubmit.value) {
    error.value = 'Almost there — please fill in all the fields, including a phone number we can reach you at.';
    return;
  }
  sending.value = true;
  try {
    let captchaToken = '';
    try {
      captchaToken = await getCaptchaToken();
    } catch {
      if (recaptchaRequired.value) {
        error.value = 'Please complete the human verification and try again.';
        sending.value = false;
        return;
      }
    }
    await api.post(`/public/agency-support/${encodeURIComponent(props.agencySlug)}/tickets`, {
      name: form.name,
      email: form.email,
      phone: form.phone,
      preferText: form.preferText,
      category: form.category,
      message: form.message,
      phiAcknowledged: form.phiAcknowledged,
      website: form.website,
      captchaToken
    }, { skipGlobalLoading: true });
    success.value = form.preferText
      ? 'Thanks! We got your message and will text you back as soon as we can.'
      : 'Thanks! We got your message and will follow up by phone or email soon.';
    form.message = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to send your message right now.';
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.pas-form { display: grid; gap: 0.7rem; }
.pas-form label { display: grid; gap: 0.25rem; font-size: 0.86rem; font-weight: 650; }
.pas-contact-row {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) minmax(9rem, 1.1fr) minmax(8.5rem, 1fr);
  gap: 0.65rem;
}
@media (max-width: 720px) {
  .pas-contact-row { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) {
  .pas-contact-row { grid-template-columns: 1fr; }
}
.pas-form input,
.pas-form select,
.pas-form textarea {
  min-height: 2.4rem;
  border: 1px solid #d7e3dc;
  border-radius: 10px;
  padding: 0.4rem 0.65rem;
  font: inherit;
}
.pas-honeypot { position: absolute; left: -9999px; }
.pas-phi { margin: 0; font-size: 0.82rem; color: #4b5563; line-height: 1.4; font-weight: 500; }
.pas-phi a { color: inherit; font-weight: 800; }
.pas-check { display: flex !important; gap: 0.5rem; align-items: flex-start; font-weight: 600; }
.pas-check input { margin-top: 0.2rem; }
.pas-smart {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 12px;
  padding: 0.75rem;
  display: grid;
  gap: 0.45rem;
}
.pas-smart p { margin: 0; font-size: 0.84rem; line-height: 1.4; color: #9a3412; }
.pas-smart-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.pas-mini {
  font-size: 0.8rem;
  font-weight: 800;
  color: #9a3412;
}
.pas-error { color: #b42318; margin: 0; }
.pas-ok { color: #166534; margin: 0; }
.pas-submit {
  border: 0;
  border-radius: 10px;
  min-height: 2.6rem;
  background: #1b3d2f;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.pas-submit:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
