import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { requireClientPacketPortalSchema } from '../clientPacketPortalReadiness.service.js';

it('blocks readiness when required storage is missing without selecting patient data', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[]]) };
  await requireClientPacketPortalSchema(db);
  expect(db.execute).toHaveBeenCalledTimes(4);
  for (const [sql] of db.execute.mock.calls) expect(sql).toMatch(/ LIMIT 0$/);
  db.execute.mockRejectedValueOnce(new Error('Missing guest invoice schema'));
  await expect(requireClientPacketPortalSchema(db)).rejects.toThrow('Missing guest invoice schema');
});
