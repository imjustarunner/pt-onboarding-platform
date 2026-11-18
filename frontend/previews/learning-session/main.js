import { createApp, h, ref } from 'vue';
import Checklist from '../../src/components/tutoring/LearningPlanSessionChecklist.vue';
import { bundle, planChecklist, brief } from './fixture';
createApp({ setup() {
  const status = ref('');
  return () => h('main', { class: 'sample' }, [
    h('header', { class: 'agency' }, [h('img', { src: './nlu-logo.png', alt: 'Next Level Up' }), h('div', [h('b', 'NEXT LEVEL UP'), h('p', 'Fictional interface preview · No client data')])]),
    h('section', { class: 'identity' }, [h('strong', 'Example Student · fictional'), h('span', 'Mathematics · Nov 18, 2026 · 45 min'), h('span', 'Participants: student and tutor')]),
    h(Checklist, { bundle, brief, initialChecklist: planChecklist, status: status.value, onDirty: () => { status.value = ''; }, onSave: () => { status.value = 'Preview only · In the app, this saves to the scheduled session.'; } })
  ]);
} }).mount('#app');
