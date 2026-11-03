import { expect, it, vi } from 'vitest';
import { referralPacketUploaderLabel } from '../referralPacketUploader.js';

it('identifies the original uploader when somebody else submits the packet', async () => {
  const database = { execute: vi.fn(async () => [[{ first_name: 'Jamie', last_name: 'Taylor' }]]) };
  expect(await referralPacketUploaderLabel({ uploaderId: 12, currentUser: { id: 501, first_name: 'Michael', last_name: 'Mendez' }, database })).toBe('Jamie Taylor');
  expect(database.execute).toHaveBeenCalledWith(expect.any(String), [12]);
});

it('uses the authenticated name when the original uploader submits it', async () => {
  const database = { execute: vi.fn() };
  expect(await referralPacketUploaderLabel({ uploaderId: 12, currentUser: { id: 12, first_name: 'Jamie', last_name: 'Taylor' }, database })).toBe('Jamie Taylor');
  expect(database.execute).not.toHaveBeenCalled();
});

it('does not attribute a public upload to the later submitter', async () => {
  expect(await referralPacketUploaderLabel({ uploaderId: null, currentUser: { id: 501, first_name: 'Michael' }, database: {} })).toBe('Public upload');
});

it('loads the uploader name when authentication contains only their ID and email', async () => {
  const database = { execute: vi.fn(async () => [[{ first_name: 'Jamie', last_name: 'Taylor' }]]) };
  expect(await referralPacketUploaderLabel({ uploaderId: 12, currentUser: { id: 12, email: 'jamie@itsco.health' }, database })).toBe('Jamie Taylor');
  expect(database.execute).toHaveBeenCalledOnce();
});
