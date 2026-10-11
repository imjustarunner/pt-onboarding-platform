import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../workplaceHandbook.service.js', () => ({ getPublishedHandbook: vi.fn() }));
vi.mock('../workplaceHandbookAssistant.service.js', async importOriginal => ({ ...await importOriginal(), answerFromHandbook: vi.fn() }));
import { getPublishedHandbook } from '../workplaceHandbook.service.js';
import { answerFromHandbook } from '../workplaceHandbookAssistant.service.js';
import { answerPublishedHandbook } from '../workplaceHandbookAnswer.service.js';
beforeEach(() => vi.resetAllMocks());
describe('published answer snapshot', () => {
  it('reloads the current published version for each question and ignores client section text', async () => {
    getPublishedHandbook.mockResolvedValue({ version: { id: 7 }, sections: ['authorized source'] });
    answerFromHandbook.mockResolvedValue({ status: 'answered' });
    await answerPublishedHandbook(2, { question: 'PTO please', expectedVersionId: 7, sections: ['invented policy'], preview: true });
    expect(getPublishedHandbook).toHaveBeenCalledWith(2);
    expect(answerFromHandbook).toHaveBeenCalledWith({ handbook: { version: { id: 7 }, sections: ['authorized source'] }, question: 'PTO please', history: [] });
  });
  it('rejects a stale reader before generating an answer', async () => {
    getPublishedHandbook.mockResolvedValue({ version: { id: 8 }, sections: [] });
    await expect(answerPublishedHandbook(2, { question: 'PTO please', expectedVersionId: 7 })).rejects.toMatchObject({ status: 409 });
    expect(answerFromHandbook).not.toHaveBeenCalled();
  });
  it('rejects an answer if a newer version was published during generation', async () => {
    getPublishedHandbook.mockResolvedValueOnce({ version: { id: 7 } }).mockResolvedValueOnce({ version: { id: 8 } });
    answerFromHandbook.mockResolvedValue({ status: 'answered' });
    await expect(answerPublishedHandbook(2, { question: 'PTO please', expectedVersionId: 7 })).rejects.toMatchObject({ status: 409 });
  });
});
