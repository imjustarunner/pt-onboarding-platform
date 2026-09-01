import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoalsFromIntakeText,
  isPacketBootstrapPlan,
  TREATMENT_PLAN_DRAFT_TITLE,
  INTAKE_PACKET_BOOTSTRAP_TOOL
} from '../intakePacketBootstrap.service.js';

test('extractGoalsFromIntakeText parses goal / objective blocks with scales', () => {
  const text = `
Goals:
Goal 1: Reduce anxiety symptoms
Objective 1: Practice coping skills 3 → 8
Objective 2: Attend weekly sessions 2 to 7

Goal 2: Improve school functioning
- Complete homework routines 4/8
`;
  const goals = extractGoalsFromIntakeText(text);
  assert.ok(goals.length >= 2);
  assert.match(goals[0].goalText, /anxiety/i);
  assert.ok(goals[0].objectives?.length >= 1);
  assert.equal(goals[0].objectives[0].scaleCurrent, 3);
  assert.equal(goals[0].objectives[0].scaleTarget, 8);
});

test('extractGoalsFromIntakeText returns a default goal when none found', () => {
  const goals = extractGoalsFromIntakeText('No structured goals here.');
  assert.equal(goals.length, 1);
  assert.ok(String(goals[0].goalText || '').length > 10);
  assert.equal(goals[0].objectives?.[0]?.scaleCurrent, 3);
  assert.equal(goals[0].objectives?.[0]?.scaleTarget, 7);
});

test('isPacketBootstrapPlan matches tool id and draft status', () => {
  assert.equal(
    isPacketBootstrapPlan({ source_tool_id: INTAKE_PACKET_BOOTSTRAP_TOOL, status: 'draft' }),
    true
  );
  assert.equal(
    isPacketBootstrapPlan({ source_tool_id: INTAKE_PACKET_BOOTSTRAP_TOOL, status: 'active' }),
    false
  );
  assert.equal(isPacketBootstrapPlan({ sourceToolId: 'note_aid_plan_import', status: 'draft' }), false);
  assert.equal(TREATMENT_PLAN_DRAFT_TITLE, 'Treatment Plan Draft');
});
