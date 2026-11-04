<template>
  <div class="assistant-shell">
    <header class="assistant-shell__header">
      <router-link to="/assistant" class="assistant-shell__brand">Assistant workspace</router-link>
      <div class="assistant-shell__identity">
        <span>{{ auth.user?.email || 'Scoped account' }}</span>
        <router-link v-if="auth.isAuthenticated" to="/account-security">Account security</router-link>
        <button v-if="auth.isAuthenticated" type="button" @click="signOut" :disabled="leaving">Sign out</button>
      </div>
    </header>
    <main class="assistant-shell__main"><slot /></main>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../../store/auth';
const auth = useAuthStore();
const leaving = ref(false);
async function signOut() {
  leaving.value = true;
  try { await auth.logout('user_logout', { skipStatusPrompt: true }); }
  finally { leaving.value = false; }
}
</script>
<style scoped>
.assistant-shell{min-height:100vh;background:#f5f7f9;color:#172b32;font-family:Arial,Helvetica,sans-serif}.assistant-shell__header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px max(24px,calc((100vw - 1160px)/2));background:#fff;border-bottom:1px solid #d8e1e6}.assistant-shell__brand{color:#184d46;font-size:18px;font-weight:700;text-decoration:none}.assistant-shell__identity{display:flex;align-items:center;gap:18px;font-size:13px;flex-wrap:wrap}.assistant-shell__identity a{color:#275f67}.assistant-shell button{background:#fff;color:#183c42;border:1px solid #bacbd0;border-radius:7px;padding:8px 12px;cursor:pointer}.assistant-shell__main{max-width:1160px;margin:auto;padding:32px 24px}@media(max-width:640px){.assistant-shell__header{align-items:flex-start;flex-direction:column;padding:18px}.assistant-shell__main{padding:24px 16px}.assistant-shell__identity{gap:12px;overflow-wrap:anywhere}}
</style>
