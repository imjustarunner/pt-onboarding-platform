import { createApp } from 'vue';
import ActualExamples from './ActualExamples.vue';
// Only presentation components and synthetic fixtures. No API client or stores.
for (const element of document.querySelectorAll('[data-actual-example]')) {
  createApp(ActualExamples, {kind: element.dataset.actualExample}).mount(element);
}
