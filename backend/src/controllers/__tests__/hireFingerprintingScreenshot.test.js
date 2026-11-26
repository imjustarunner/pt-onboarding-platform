import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../services/hireFingerprintingGuide.service.js', () => ({ readHireFingerprintingScreenshot: vi.fn() }));
vi.mock('../prehirePortal.controller.js', () => ({ portalStateForUser: vi.fn() }));
import { readHireFingerprintingScreenshot } from '../../services/hireFingerprintingGuide.service.js';
import { portalStateForUser } from '../prehirePortal.controller.js';
import { portalFingerprintingScreenshot, staffFingerprintingScreenshot } from '../hireFingerprintingScreenshot.controller.js';
const image = Buffer.from('synthetic fixture'), id = 'a'.repeat(64);
let state, res, next;
beforeEach(() => {
 vi.clearAllMocks();state = { agency: { id: 9000 }, workflow: { steps: { pre_hire: [{ kind: 'fingerprinting', key: 'denver-school-fingerprinting' }] } } };
 portalStateForUser.mockImplementation(async () => state);readHireFingerprintingScreenshot.mockResolvedValue(image);
 res = { set: vi.fn(), type: vi.fn(), send: vi.fn() };res.type.mockReturnValue(res);next = vi.fn();
});
it('serves private PNG bytes for the assigned candidate and derives the organization from their portal state', async () => {
 await portalFingerprintingScreenshot({ portalUser: { id: 9100 }, params: { screenshotId: id }, query: { agencyId: 9001 } }, res, next);
 expect(next).not.toHaveBeenCalled();expect(readHireFingerprintingScreenshot).toHaveBeenCalledWith(9000, id);
 expect(res.set).toHaveBeenCalledWith({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });expect(res.type).toHaveBeenCalledWith('image/png');expect(res.send).toHaveBeenCalledWith(image);
});
it('denies candidates without this assigned step', async () => {
 state.workflow.steps.pre_hire = [];await portalFingerprintingScreenshot({ portalUser: { id: 9100 }, params: { screenshotId: id } }, res, next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));expect(readHireFingerprintingScreenshot).not.toHaveBeenCalled();
});
it('keeps reference screenshots available for a completed pre-hire step without changing its acknowledgement', async () => {
 state.workflow.steps.pre_hire[0].complete = true;const before = JSON.stringify(state);
 await portalFingerprintingScreenshot({ portalUser: { id: 9100 }, params: { screenshotId: id } }, res, next);
 expect(next).not.toHaveBeenCalled();expect(res.send).toHaveBeenCalledWith(image);expect(JSON.stringify(state)).toBe(before);
});
it('requires a valid organization for staff preview', async () => {
 await staffFingerprintingScreenshot({ params: { screenshotId: id }, query: {} }, res, next);expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));expect(readHireFingerprintingScreenshot).not.toHaveBeenCalled();
});
