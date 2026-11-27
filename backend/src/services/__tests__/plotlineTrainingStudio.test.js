import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createPlotlineTrainingStudio } from '../plotlineTrainingStudio.service.js';
import { plotlineApiAllowed } from '../plotlineCompanyPolicy.service.js';

let sqlite, studio, database, failContent;
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE modules (id INTEGER PRIMARY KEY, agency_id INTEGER, title TEXT, description TEXT, track_id INTEGER,
      estimated_time_minutes INTEGER, publish_status TEXT, is_active INTEGER, version INTEGER, updated_at TEXT,
      published_at TEXT, is_archived INTEGER DEFAULT 0);
    CREATE TABLE module_content (id INTEGER PRIMARY KEY, module_id INTEGER, content_type TEXT, title TEXT,
      content_data TEXT, settings TEXT, order_index INTEGER);
    CREATE TABLE module_response_answers (id INTEGER PRIMARY KEY, content_id INTEGER REFERENCES module_content(id) ON DELETE CASCADE);
    INSERT INTO modules(id,agency_id,title,publish_status,is_active,version) VALUES (1,463,'First lesson','draft',0,1), (2,464,'Private','draft',0,1);
    INSERT INTO module_content VALUES (9,1,'text','Intro','{"content":"Welcome"}',NULL,0);
  `);
  failContent = false;
  database = {
    async execute(sql, params = []) {
      const normalized = sql.replace(/ FOR UPDATE/g, '').replace(/NOW\(\)/g, 'CURRENT_TIMESTAMP');
      if (failContent && normalized.startsWith('INSERT INTO module_content')) throw new Error('Write unavailable');
      const statement = sqlite.prepare(normalized);
      if (/^SELECT/i.test(sql)) return [statement.all(...params)];
      const result = statement.run(...params);
      return [{ insertId: Number(result.lastInsertRowid), affectedRows: result.changes }];
    },
    async getConnection() {
      return { execute: database.execute, beginTransaction: () => sqlite.exec('BEGIN'),
        commit: () => sqlite.exec('COMMIT'), rollback: () => sqlite.exec('ROLLBACK'), release: () => {} };
    }
  };
  studio = createPlotlineTrainingStudio(database);
});
afterEach(() => sqlite.close());

const block = (id, content) => ({ id, contentType: 'text', title: 'Lesson text', contentData: { content }, settings: {} });
async function payload(blocks, publish = false) {
  return { revision: (await studio.read(463, 1)).revision, title: 'Safety orientation', description: 'Training for the team',
    estimatedMinutes: 6, publish, blocks };
}

it('saves content, order and lesson details in one draft and publishes only on request', async () => {
  const saved = await studio.save(463, 1, await payload([block(null, 'New opening'), block(9, 'Revised')]));
  expect(saved.module).toMatchObject({ title: 'Safety orientation', publish_status: 'draft', is_active: 0, estimated_time_minutes: 6 });
  expect(saved.blocks).toMatchObject([{ order_index: 0 }, { id: 9, order_index: 1 }]);
  const published = await studio.save(463, 1, await payload(saved.blocks.map(b => block(b.id, JSON.parse(b.content_data).content)), true));
  expect(published.module).toMatchObject({ publish_status: 'published', is_active: 1, version: 2 });
  await expect(studio.save(463, 1, await payload([block(9, 'Do not expose')]))).rejects.toHaveProperty('status', 409);
});

it('rolls back a partial save and rejects conflicting revisions', async () => {
  const request = await payload([block(9, 'Changed'), block(null, 'New')]);
  failContent = true;
  await expect(studio.save(463, 1, request)).rejects.toThrow('Write unavailable');
  expect((await studio.read(463, 1)).revision).toBe(request.revision);
  failContent = false;
  await studio.save(463, 1, request);
  await expect(studio.save(463, 1, request)).rejects.toHaveProperty('status', 409);
  expect((await studio.read(463, 1)).blocks).toHaveLength(2);
});

it('rejects cross-company records and protects saved learner responses', async () => {
  await expect(studio.read(463, 2)).rejects.toHaveProperty('status', 404);
  await expect(studio.save(463, 1, await payload([block(99, 'Other block')]))).rejects.toHaveProperty('status', 400);
  sqlite.exec('INSERT INTO module_response_answers VALUES (1,9)');
  await expect(studio.save(463, 1, await payload([]))).rejects.toHaveProperty('status', 409);
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM module_response_answers').get().count).toBe(1);
});

it('opens only the handbook authoring and learner quiz routes required by Plotline', () => {
  expect(plotlineApiAllowed('/api/provider-update/handbook/workspace', 'GET')).toBe(true);
  expect(plotlineApiAllowed('/api/provider-update/handbook/source/stage', 'POST')).toBe(true);
  expect(plotlineApiAllowed('/api/provider-update/handbook/draft', 'GET')).toBe(false);
  expect(plotlineApiAllowed('/api/provider-update/admin-updates', 'GET')).toBe(false);
  expect(plotlineApiAllowed('/api/quizzes/1/submit', 'POST')).toBe(true);
});

it('lets authors save empty starter blocks but requires real content and valid resource URLs before publication', async () => {
  const empty = block(9, '<p>&nbsp;</p>');
  await studio.save(463, 1, await payload([empty]));
  await expect(studio.save(463, 1, await payload([empty], true))).rejects.toThrow('Complete the content in block 1');
  const pdf = { contentType: 'pdf', contentData: { fileUrl: 'https://example.test/resources/handout.pdf' } };
  await expect(studio.save(463, 1, await payload([pdf], true))).resolves.toMatchObject({ module: { publish_status: 'published' } });
});
