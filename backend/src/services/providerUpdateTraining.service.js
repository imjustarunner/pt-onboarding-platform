import {normalizeSectionTraining} from '../../../frontend/src/navigation/providerUpdateTraining.js';
import {sanitizeTrainingHtml, resolveTrainingHtml, trainingKeyAllowed} from './updateTrainingMedia.service.js';
import sanitizeHtml from 'sanitize-html';

export function sanitizeSectionTraining(raw, agencyId, sectionKeys) {
  if (JSON.stringify(raw || {}).length > 500000) throw Object.assign(new Error('There are too many training attachments in this update.'), {status:400});
  const normalized = normalizeSectionTraining(raw, sectionKeys);
  for (const guides of Object.values(normalized)) for (const guide of guides) {
    sanitizeHtml(guide.html, {transformTags: {'*': (tag, attrs) => {
      if (attrs['data-training-key'] && !trainingKeyAllowed(attrs['data-training-key'], agencyId)) {
        throw Object.assign(new Error('Training attachments must belong to this agency.'), {status:403});
      }
      return {tagName:tag, attribs:attrs};
    }}});
    guide.html = sanitizeTrainingHtml(guide.html);
  }
  return normalized;
}
export async function resolveSectionTraining(config, key, agencyId) {
  const guides = sanitizeSectionTraining(config?._training, agencyId, [key])[key] || [];
  return Promise.all(guides.map(async guide => ({...guide, html:await resolveTrainingHtml(guide.html, agencyId)})));
}
