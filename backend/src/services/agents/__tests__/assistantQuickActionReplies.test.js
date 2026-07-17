import { describe, it, expect } from 'vitest';
import {
  ASSISTANT_QUICK_ACTION_TOOLS,
  assertQuickActionToolsHaveReplies
} from '../../../controllers/agents.controller.js';

describe('Ask Assistant everyday quick-action replies', () => {
  it('lists the tools wired to everyday buttons', () => {
    expect(ASSISTANT_QUICK_ACTION_TOOLS).toEqual(
      expect.arrayContaining([
        'openTodaysWorkspace',
        'listMyOpenTasks',
        'listTeamPresence',
        'findNextMeeting',
        'listMyRecentActivity',
        'findIntakeOpenings',
        'searchReferralDirectory'
      ])
    );
  });

  it('never returns bare Done. for empty quick-action tool results', () => {
    const failures = assertQuickActionToolsHaveReplies();
    expect(failures).toEqual([]);
  });
});
