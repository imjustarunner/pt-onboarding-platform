import { initializeAuricwellAnalytics } from './analytics.js';
import { createApp } from 'vue';
import ActualExamples from './ActualExamples.vue';
import PublicWebsiteContactForm from '../../components/public/PublicWebsiteContactForm.vue';
import { initializeFeatureRotation } from './feature-rotation.js';
for (const element of document.querySelectorAll('[data-feature-rotation]')) {
  initializeFeatureRotation(element);
}
// Feature examples use fictional fixtures. Only Contact mounts the public support form.
for (const element of document.querySelectorAll('[data-actual-example]')) {
  createApp(ActualExamples, {kind: element.dataset.actualExample}).mount(element);
}

// Only the contact page mounts the existing public support form.
for (const element of document.querySelectorAll('[data-auricwell-contact]')) {
  createApp(PublicWebsiteContactForm, { agencySlug: 'auricwell', title: 'Contact AuricWell' }).mount(element);
}

initializeAuricwellAnalytics();
