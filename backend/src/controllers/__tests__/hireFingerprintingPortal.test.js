import { beforeEach, expect, it, vi } from 'vitest';
import { denverFingerprintingStep } from '../../../../frontend/src/navigation/hireDocuments.js';

vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
vi.mock('../../services/workplaceHandbook.service.js', () => ({ getPublishedHandbook: vi.fn() }));
vi.mock('../prehirePortal.controller.js', () => ({ portalStateForUser: vi.fn(), getPortalTask: vi.fn(), viewPortalSignedFile: vi.fn() }));
vi.mock('../../services/hirePortalWorkflow.service.js', () => ({ savePortalStep: vi.fn(), portalStepSubmissions: vi.fn(), validatePreemployment: vi.fn() }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
vi.mock('../../services/documentSigning.service.js', () => ({ default: {} }));
import { portalStateForUser } from '../prehirePortal.controller.js';
import { savePortalStep } from '../../services/hirePortalWorkflow.service.js';
import { saveWorkflowStep } from '../hirePortalWorkflow.controller.js';

const guide = { html: '<p>Instructions from the lesson</p>', revision: 'current-edition' };
const step = { ...denverFingerprintingStep, key: denverFingerprintingStep.id, guide };
let portal;

beforeEach(() => {
  vi.clearAllMocks();
  portal = {
    agency: { id: 2 }, candidate: { status: 'PREHIRE_OPEN' },
    workflow: { steps: { pre_hire: [{ ...step }], onboarding: [] } }
  };
  portalStateForUser.mockResolvedValue(portal);
});

async function submit(body) {
  const res = { json: vi.fn() };
  const next = vi.fn();
  await saveWorkflowStep({ portalUser: { id: 9 }, params: { stepKey: step.key }, body }, res, next);
  return { res, next };
}

it('records only the server-resolved lesson and candidate confirmation', async () => {
  const { res, next } = await submit({ acknowledged: true, guideRevision: guide.revision, guideHtml: '<p>Untrusted replacement</p>' });
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ ok: true });
  expect(savePortalStep).toHaveBeenCalledWith(expect.objectContaining({
    userId: 9, agencyId: 2, phase: 'pre_hire', key: step.key, complete: true,
    value: { title: step.title, guideHtml: guide.html, guideRevision: guide.revision, acknowledged: true }
  }));
});

it.each([
  [{ acknowledged: false, guideRevision: guide.revision }, 400],
  [{ acknowledged: true, guideRevision: guide.revision, complete: false }, 400],
  [{ acknowledged: true, guideRevision: 'expired-edition' }, 409]
])('requires completion and the current edition', async (body, status) => {
  expect((await submit(body)).next).toHaveBeenCalledWith(expect.objectContaining({ status }));
  expect(savePortalStep).not.toHaveBeenCalled();
});

it('does not accept a confirmation for an unassigned step or missing lesson', async () => {
  const body = { acknowledged: true, guideRevision: guide.revision };
  portal.workflow.steps.pre_hire[0].guide = null;
  expect((await submit(body)).next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  portal.workflow.steps.pre_hire = [];
  expect((await submit(body)).next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(savePortalStep).not.toHaveBeenCalled();
});
