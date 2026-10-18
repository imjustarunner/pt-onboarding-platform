<template>
  <main class="login-page">
    <section class="login-story">
      <RouterLink to="/" class="brand"
        ><img src="/auricwell-logo.png" alt="AuricWell"
      /></RouterLink>
      <div>
        <span class="eyebrow">Welcome to your workspace</span>
        <h1>Care begins<br />with connection.</h1>
        <p>A little more clarity.<br />A little more time for what matters.</p>
      </div>
      <span>Therapy practice management, with purpose.</span>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <span class="eyebrow">AuricWell</span>
        <h2>
          {{
            step === "password"
              ? "Welcome back."
              : step === "reset"
                ? "Set your password."
                : step === "choose"
                  ? "Your practices."
                  : "Secure your account."
          }}
        </h2>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <form v-if="step === 'password'" @submit.prevent="signIn">
          <label
            >Username<input
              v-model="username"
              autocomplete="username"
              required
              autofocus /></label
          ><label
            >Password<input
              v-model="password"
              type="password"
              autocomplete="current-password"
              required /></label
          ><button :disabled="busy">
            {{ busy ? "Signing in…" : "Sign in →" }}</button
          ><button class="link-button" type="button" @click="recover">
            Forgot your password?
          </button>
          <p class="muted">
            Use your AuricWell username. Account setup and recovery use your
            account email.
          </p>
        </form>
        <form v-else-if="step === 'reset'" @submit.prevent="resetPassword">
          <label
            >New password<input
              v-model="password"
              type="password"
              autocomplete="new-password"
              minlength="14"
              required
          /></label>
          <p class="muted">Use at least 14 characters.</p>
          <button :disabled="busy">Save password</button>
        </form>
        <div v-else-if="step === 'mfa'">
          <p>
            {{
              mfaEnabled
                ? "Enter your authenticator code or an unused recovery code."
                : "Add AuricWell to your authenticator using this setup key, then enter the six-digit code."
            }}
          </p>
          <code v-if="secret" class="setup-secret">{{ secret }}</code>
          <form @submit.prevent="verify">
            <label
              >Verification code<input
                v-model="code"
                autocomplete="one-time-code"
                required /></label
            ><button :disabled="busy">Verify account</button>
          </form>
        </div>
        <div v-else-if="step === 'recovery'">
          <p>
            Save these recovery codes somewhere secure. Each code works once.
          </p>
          <pre class="recovery-codes">{{ recoveryCodes.join("\n") }}</pre>
          <button @click="choose">I saved my recovery codes</button>
        </div>
        <div v-else-if="step === 'choose'">
          <RouterLink v-if="operator" to="/platform/settings" class="practice-link"><span>Platform settings · sessions and texting</span><span>→</span></RouterLink>
          <RouterLink
            v-for="p in practices"
            :key="p.id"
            :to="`/app/${p.slug}${route.query.records === '1' ? '/records-requests' + (route.query.request ? '?request=' + encodeURIComponent(String(route.query.request)) : '') : ''}`"
            class="practice-link"
            ><span>{{ p.name }}</span
            ><span>→</span></RouterLink
          ><button class="outline" v-if="!mfaEnabled" @click="optionalMfa">
            Set up an authenticator
          </button>
          <p v-if="!practices.length" class="muted">
            No practice is assigned yet.
          </p>
          <details v-if="operator">
            <summary>Create a practice</summary>
            <form @submit.prevent="provision">
              <label
                >Practice name<input
                  v-model="newPractice.name"
                  required /></label
              ><label
                >Practice address slug<input
                  v-model="newPractice.slug"
                  placeholder="champions"
                  required /></label
              ><label
                >Onboarding<select v-model="newPractice.onboardingMode">
                  <option value="new">Start a new practice</option>
                  <option value="transition">Move from TherapyNotes</option>
                </select></label
              ><label
                >Owner name<input
                  v-model="newPractice.ownerName"
                  required /></label
              ><label
                >Owner username<input
                  v-model="newPractice.ownerUsername"
                  required /></label
              ><label
                >Owner account email<input
                  v-model="newPractice.ownerEmail"
                  type="email"
                  required /></label
              ><button :disabled="busy">Create practice</button>
            </form>
          </details>
        </div>
      </div>
      <p class="login-footer">
        AuricWell · Your practice, thoughtfully connected.
      </p>
    </section>
  </main>
</template>
<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "./api";
const route = useRoute(),
  router = useRouter();
const linkToken =
  new URLSearchParams(route.hash.replace(/^#/, "")).get("accountToken") || "";
const username = ref(""),
  password = ref(""),
  code = ref(""),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  step = ref(linkToken ? "reset" : "password");
const token = ref(linkToken),
  secret = ref(""),
  mfaEnabled = ref(false),
  recoveryCodes = ref([]),
  practices = ref([]),
  operator = ref(false);
const newPractice = ref({
  name: "",
  slug: "",
  onboardingMode: "new",
  ownerName: "",
  ownerUsername: "",
  ownerEmail: "",
});
async function perform(fn) {
  error.value = "";
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function choose() {
  await perform(async () => {
    const data = await api("/bootstrap");
    practices.value = data.practices;
    operator.value = data.account.operator;
    step.value = "choose";
    if (data.practices.length === 1 && !operator.value)
      router.replace(`/app/${data.practices[0].slug}${route.query.records === '1' ? '/records-requests' + (route.query.request ? '?request=' + encodeURIComponent(String(route.query.request)) : '') : ''}`);
  });
}
async function signIn() {
  await perform(async () => {
    const data = await api("/auth/login", {
      method: "POST",
      body: { username: username.value, password: password.value },
    });
    password.value = "";
    mfaEnabled.value = data.mfaEnabled;
    try {
      const data = await api("/bootstrap");
      practices.value = data.practices;
      operator.value = data.account.operator;
      step.value = "choose";
    } catch (e) {
      if (e.status !== 403) throw e;
      step.value = "mfa";
      if (!mfaEnabled.value)
        secret.value = (
          await api("/auth/mfa/begin", { method: "POST", body: {} })
        ).secret;
    }
  });
}
async function verify() {
  await perform(async () => {
    const result = await api("/auth/mfa/verify", {
      method: "POST",
      body: { code: code.value },
    });
    code.value = "";
    secret.value = "";
    recoveryCodes.value = result.recoveryCodes;
    if (recoveryCodes.value.length) step.value = "recovery";
    else await choose();
  });
}
async function optionalMfa() {
  await perform(async () => {
    secret.value = (
      await api("/auth/mfa/begin", { method: "POST", body: {} })
    ).secret;
    step.value = "mfa";
  });
}
async function recover() {
  await perform(async () => {
    notice.value = (
      await api("/auth/recovery", {
        method: "POST",
        body: { username: username.value },
      })
    ).message;
  });
}
async function resetPassword() {
  await perform(async () => {
    await api("/auth/redeem", {
      method: "POST",
      body: { token: token.value, password: password.value },
    });
    token.value = "";
    password.value = "";
    step.value = "password";
    notice.value = "Password saved. Sign in with your username.";
  });
}
async function provision() {
  await perform(async () => {
    const p = await api("/practices", {
      method: "POST",
      body: newPractice.value,
    });
    router.push(`/app/${p.slug}/settings`);
  });
}
onMounted(async () => {
  if (token.value) {
    router.replace("/app");
    return;
  }
  try {
    const session = await api("/auth/status");
    mfaEnabled.value = session.mfaEnabled;
    try {
      const b = await api("/bootstrap");
      practices.value = b.practices;
      operator.value = b.account.operator;
      step.value = "choose";
    } catch {
      if (session.verified) await choose();
    }
  } catch {
    /* Sign-in screen. */
  }
});
</script>
