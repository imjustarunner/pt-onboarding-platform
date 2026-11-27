import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import ModuleContent from '../models/ModuleContent.model.js';
import { TRAINING_CONTENT_TYPE_SET } from '../constants/trainingContentTypes.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function revision(module, blocks) {
  return createHash('sha256').update(JSON.stringify([module, blocks])).digest('hex');
}

async function readLesson(db, agencyId, moduleId, lock = false) {
  // For a save, hold the module and its current blocks through commit. Keep IDs
  // for existing blocks so assignments and answer references survive edits.
  const suffix = lock ? ' FOR UPDATE' : '';
  const [[module]] = await db.execute(`SELECT id, agency_id, title, description, track_id, estimated_time_minutes,
    publish_status, is_active, version, updated_at FROM modules
    WHERE id=? AND agency_id=? AND COALESCE(is_archived,0)=0${suffix}`, [moduleId, agencyId]);
  if (!module) throw fail('Lesson not found in this company.', 404);
  const [blocks] = await db.execute(`SELECT * FROM module_content WHERE module_id=? ORDER BY order_index,id${suffix}`, [moduleId]);
  return { module, blocks, revision: revision(module, blocks) };
}

const hasText = value => typeof value === 'string' && !!value.replace(/<[^>]*>|&nbsp;/g, '').trim();
const mediaFields = ['url', 'videoUrl', 'imageUrl', 'fileUrl', 'googleUrl', 'googleSlidesUrl', 'slidesUrl', 'formUrl'];
function validLink(value) {
  if (typeof value !== 'string' || !value.trim() || /[\s\\]/.test(value.trim())) return false;
  const url = value.trim();
  if (/^\/(?!\/)/.test(url)) return true;
  try { return ['http:', 'https:'].includes(new URL(url).protocol); }
  catch { return false; }
}

function incompleteBlock({ contentType, contentData: data }) {
  switch (contentType) {
    case 'text': return ![data.content, data.textContent, data.description].some(hasText);
    case 'callout': return !hasText(data.content);
    case 'response': return !hasText(data.prompt);
    case 'acknowledgment': return !hasText(data.text || data.description);
    case 'video': return !validLink(data.videoUrl);
    case 'image': return !validLink(data.imageUrl);
    case 'pdf': return !validLink(data.fileUrl || data.googleUrl);
    case 'slide': return !validLink(data.slidesUrl || data.googleSlidesUrl) && !data.slides?.length;
    case 'google_form': return !validLink(data.formUrl);
    case 'knowledge_check': {
      const options = Array.isArray(data.options) ? data.options : [];
      return !hasText(data.question) || options.filter(option => hasText(option?.text ?? option)).length < 2 ||
        !hasText(options[Number(data.correctAnswer)]?.text ?? options[Number(data.correctAnswer)]);
    }
    case 'quiz': return !Array.isArray(data.questions) || !data.questions.length ||
      data.questions.some(question => !hasText(question?.question));
    default: return false;
  }
}

function normalizeLesson(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const estimated = input.estimatedMinutes === '' || input.estimatedMinutes == null ? null : Number(input.estimatedMinutes);
  if (!title || title.length > 255 || description.length > 10000 ||
    estimated !== null && (!Number.isInteger(estimated) || estimated < 0 || estimated > 1440)) {
    throw fail('Enter a lesson title and an estimated duration from 0 to 1,440 minutes.');
  }
  if (!Array.isArray(input.blocks) || input.blocks.length > 100 || typeof input.publish !== 'boolean') {
    throw fail('A lesson can contain up to 100 blocks.');
  }
  if (input.publish && !input.blocks.some(block => !['spacer', 'divider'].includes(block?.contentType))) {
    throw fail('Add learning content before publishing.');
  }
  for (const [index, block] of input.blocks.entries()) {
    if (!TRAINING_CONTENT_TYPE_SET.has(block?.contentType) || !isObject(block.contentData) ||
      block.settings != null && !isObject(block.settings) ||
      block.title != null && (typeof block.title !== 'string' || block.title.length > 255)) {
      throw fail('One of the lesson blocks is invalid.');
    }
    if (mediaFields.some(field => block.contentData[field] && !validLink(block.contentData[field]))) {
      throw fail(`Block ${index + 1} has an invalid link. Use an HTTP or HTTPS link.`);
    }
    if (input.publish && incompleteBlock(block)) {
      throw fail(`Complete the content in block ${index + 1} before publishing.`);
    }
  }
  if (input.publish && ['quiz', 'acknowledgment'].some(type =>
    input.blocks.filter(block => block.contentType === type).length > 1)) {
    throw fail('Use at most one graded quiz and one acknowledgment per lesson. Add knowledge checks for additional practice.');
  }
  return { title, description, estimated };
}

export function createPlotlineTrainingStudio(db = pool, content = ModuleContent) {
  return {
    read: (agencyId, moduleId) => readLesson(db, agencyId, moduleId),
    async save(agencyId, moduleId, input) {
      const { title, description, estimated } = normalizeLesson(input);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const current = await readLesson(conn, agencyId, moduleId, true);
        if (input.revision !== current.revision) {
          throw fail('This lesson changed since you opened it. Copy any unsaved edits you want to keep, then reload.', 409);
        }
        if (current.module.publish_status === 'published' && !input.publish) {
          throw fail('Use Publish changes to update a lesson the team can already see.', 409);
        }
        const existing = new Set(current.blocks.map(block => Number(block.id)));
        const retained = new Set();
        for (const block of input.blocks) {
          if (block.id == null) continue;
          const id = Number(block.id);
          if (!existing.has(id) || retained.has(id)) throw fail('One of the blocks does not belong to this lesson.');
          retained.add(id);
        }
        for (const id of existing) {
          if (retained.has(id)) continue;
          const [[answer]] = await conn.execute('SELECT id FROM module_response_answers WHERE content_id=? LIMIT 1 FOR UPDATE', [id]);
          if (answer) throw fail('A block with learner responses cannot be removed. Keep it here or create a new lesson.', 409);
          await content.delete(id, conn);
        }
        for (const [orderIndex, block] of input.blocks.entries()) {
          if (block.id == null) await content.create({ ...block, moduleId, orderIndex }, conn);
          else await content.update(Number(block.id), { ...block, orderIndex }, conn);
        }
        await conn.execute(`UPDATE modules SET title=?,description=?,estimated_time_minutes=?${input.publish
          ? ",is_active=1,publish_status='published',published_at=NOW(),version=COALESCE(version,1)+1"
          : ''} WHERE id=? AND agency_id=?`, [title, description || null, estimated, moduleId, agencyId]);
        const result = await readLesson(conn, agencyId, moduleId);
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }
  };
}
