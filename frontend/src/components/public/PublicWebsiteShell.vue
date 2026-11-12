<template>
  <BrandingProvider>
    <main class="public-website-content"><slot /><TenantLegalFooter /></main>
    <PublicTranslateWidget v-if="showTranslate" />
    <PublicWebsiteEditorBar />
    <PublicWebsiteAnalytics />
    <PublicWebsiteChat v-if="!auth.isAuthenticated" />
  </BrandingProvider>
</template>
<script setup>
import {computed,defineAsyncComponent} from 'vue';
import {useRoute} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import BrandingProvider from '../BrandingProvider.vue';
import {shouldShowPublicTranslate,clearLegacyGoogleTranslateCookie} from '../../utils/publicTranslateWidget.js';
// Public pages render immediately. Optional website tools load independently;
// employee widgets, polling and workspace assets are not part of this shell.
const TenantLegalFooter=defineAsyncComponent(()=>import('../legal/TenantLegalFooter.vue'));
const PublicTranslateWidget=defineAsyncComponent(()=>import('./PublicTranslateWidget.vue'));
const PublicWebsiteEditorBar=defineAsyncComponent(()=>import('./PublicWebsiteEditorBar.vue'));
const PublicWebsiteAnalytics=defineAsyncComponent(()=>import('./PublicWebsiteAnalytics.vue'));
const PublicWebsiteChat=defineAsyncComponent(()=>import('./PublicWebsiteChat.vue'));
const auth=useAuthStore(),route=useRoute();
const showTranslate=computed(()=>shouldShowPublicTranslate(route));
clearLegacyGoogleTranslateCookie();
</script>
<style scoped>.public-website-content{min-height:100dvh}</style>
