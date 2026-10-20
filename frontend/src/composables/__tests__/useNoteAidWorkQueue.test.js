import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useNoteAidWorkQueue } from '../useNoteAidWorkQueue.js';
import { clearAllWorkQueues, fetchWorkQueueFromApi, saveWorkQueue, syncWorkQueueToApi } from '../../utils/noteAidWorkQueue.js';
import api from '../../services/api';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const pending = { id: 'queue_1', status: 'not_started', docStatus: 'not_started' };
const started = { ...pending, status: 'started', docStatus: 'started', draftId: 22 };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  clearAllWorkQueues(501);
  clearAllWorkQueues(502);
});

describe('shared user queue state', () => {
  it('updates both consumers and keeps different users separate', () => {
    const userId = ref(501);
    const tasks = useNoteAidWorkQueue(userId);
    const workspace = useNoteAidWorkQueue(() => 501);
    tasks.value = [pending];
    expect(workspace.value).toEqual([pending]);
    workspace.value = [started];
    expect(tasks.value).toEqual([started]);
    userId.value = 502;
    expect(tasks.value).toEqual([]);
    expect(workspace.value).toEqual([started]);
  });

  it('does not let a late queue read reset a note that was just started', async () => {
    const read = deferred();
    api.get.mockReturnValue(read.promise);
    saveWorkQueue(501, [pending]);
    const request = fetchWorkQueueFromApi(501);
    await Promise.resolve();
    saveWorkQueue(501, [started]);
    read.resolve({ data: { items: [pending] } });
    expect(await request).toEqual([started]);
  });

  it('serializes lifecycle saves and keeps the newest local draft while an older save finishes', async () => {
    const first = deferred();
    api.put.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ data: { items: [started] } });
    const request1 = syncWorkQueueToApi(501, [pending]);
    await Promise.resolve();
    await Promise.resolve();
    const request2 = syncWorkQueueToApi(501, [started]);
    expect(api.put).toHaveBeenCalledTimes(1);
    first.resolve({ data: { items: [pending] } });
    await request1;
    expect(useNoteAidWorkQueue(() => 501).value).toEqual([started]);
    await request2;
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(useNoteAidWorkQueue(() => 501).value).toEqual(expect.arrayContaining([expect.objectContaining(started)]));
  });
});
