import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESPONSE_PLAN_STEP_STATUS,
  RESPONSE_PLAN_STEP_TYPES,
  RESPONSE_PLAN_STATUS,
  buildResponsePlan,
  buildResponsePlanSteps,
  computeResponsePlanStatus,
  mapActionItemStepStatus
} from '../schoolSupportResponsePlan.shared.js';

describe('schoolSupportResponsePlan.shared', () => {
  it('builds a status-request plan with matched client and draft', () => {
    const ticket = {
      id: 42,
      client_id: 7,
      status: 'open',
      subject: 'Status for Jane Doe',
      question: 'Can you send an update on Jane Doe?',
      ai_draft_response: 'Here is the latest status...',
      ai_draft_review_state: 'pending'
    };
    const client = {
      id: 7,
      initials: 'JDoe',
      client_status_label: 'Active',
      paperwork_status_label: 'ROI pending',
      provider_name: 'Smith, PT'
    };
    const steps = buildResponsePlanSteps({
      ticket,
      client,
      checklistItems: [{ label: 'ROI', isNeeded: true }]
    });

    assert.equal(steps[0].type, RESPONSE_PLAN_STEP_TYPES.MATCH_CLIENT);
    assert.equal(steps[0].status, RESPONSE_PLAN_STEP_STATUS.DONE);
    assert.equal(steps[1].type, RESPONSE_PLAN_STEP_TYPES.PULL_STATUS);
    assert.equal(steps[1].status, RESPONSE_PLAN_STEP_STATUS.DONE);
    assert.equal(steps[2].type, RESPONSE_PLAN_STEP_TYPES.DRAFT_REPLY);
    assert.equal(steps[2].status, RESPONSE_PLAN_STEP_STATUS.READY);
    assert.equal(steps[steps.length - 1].type, RESPONSE_PLAN_STEP_TYPES.NOTIFY);
    assert.equal(steps[steps.length - 1].status, RESPONSE_PLAN_STEP_STATUS.READY);
  });

  it('blocks notify when action items still need approval', () => {
    const ticket = {
      id: 55,
      status: 'open',
      subject: 'Please add Natalie',
      question: 'Please add Natalie to the listserv',
      ai_draft_response: 'We created her account.'
    };
    const steps = buildResponsePlanSteps({
      ticket,
      actionItems: [
        {
          id: 9,
          action_type: 'create_school_staff_account',
          title: 'Create school staff account',
          status: 'proposed'
        }
      ]
    });

    const notify = steps[steps.length - 1];
    assert.equal(notify.type, RESPONSE_PLAN_STEP_TYPES.NOTIFY);
    assert.equal(notify.status, RESPONSE_PLAN_STEP_STATUS.BLOCKED);
    assert.equal(mapActionItemStepStatus('proposed'), RESPONSE_PLAN_STEP_STATUS.NEEDS_APPROVAL);
  });

  it('marks plan completed when reply was sent', () => {
    const plan = buildResponsePlan({
      ticket: {
        id: 60,
        client_id: 3,
        status: 'answered',
        sent_at: '2026-08-19 12:00:00',
        subject: 'Status update',
        question: 'Status please',
        ai_draft_response: 'All set.'
      },
      client: { id: 3, initials: 'ABC' }
    });

    assert.equal(plan.status, RESPONSE_PLAN_STATUS.COMPLETED);
    assert.equal(plan.steps.at(-1).status, RESPONSE_PLAN_STEP_STATUS.DONE);
    assert.equal(computeResponsePlanStatus(plan.steps), RESPONSE_PLAN_STATUS.COMPLETED);
  });

  it('does not interpret ticket closure as an emailed reply', () => {
    const plan = buildResponsePlan({ ticket: { id: 61, status: 'closed', subject: 'General question', ai_draft_response: 'Draft only' } });
    assert.notEqual(plan.status, RESPONSE_PLAN_STATUS.COMPLETED);
    assert.notEqual(plan.steps.at(-1).status, RESPONSE_PLAN_STEP_STATUS.DONE);
    assert.doesNotMatch(plan.steps.at(-1).detail, /Reply sent/);
  });

  it('blocks a stored draft and send step when the required client match remains unresolved', () => {
    const plan = buildResponsePlan({ ticket: { id: 62, subject: 'Client status update', question: 'Where is the paperwork?', ai_draft_response: 'Here is an update.' } });
    assert.equal(plan.steps.find((step) => step.type === RESPONSE_PLAN_STEP_TYPES.DRAFT_REPLY).status, RESPONSE_PLAN_STEP_STATUS.BLOCKED);
    assert.equal(plan.steps.at(-1).status, RESPONSE_PLAN_STEP_STATUS.BLOCKED);
  });

  it('does not call a send ready when there is no draft or approved actions have not executed', () => {
    const empty = buildResponsePlan({ ticket: { id: 63, subject: 'General question' } });
    assert.equal(empty.steps.at(-1).status, RESPONSE_PLAN_STEP_STATUS.BLOCKED);
    const pending = buildResponsePlan({ ticket: { id: 64, subject: 'General question', ai_draft_response: 'We created the account.' }, actionItems: [{ id: 7, title: 'Create account', status: 'approved' }] });
    assert.equal(pending.steps.at(-1).status, RESPONSE_PLAN_STEP_STATUS.BLOCKED);
  });
});
