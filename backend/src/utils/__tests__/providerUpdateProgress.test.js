import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finalizedUpdateProgress} from '../providerUpdateProgress.js';

test('counts only requirements present when the update was submitted', () => {
  const recipient = {status:'finalized',finalized_at:'2026-10-15',snapshot_json:JSON.stringify({
    enabledKeys:['pin','contact_info'],
    sections:[{section_key:'pin',completed:1},{section_key:'contact_info',completed:1},{section_key:'school_availability',completed:0}]
  })};
  assert.deepEqual(finalizedUpdateProgress(recipient), {completed:2,total:2});
});
test('does not invent completion or reuse a snapshot for an unfinished update', () => {
  const snapshot_json = {enabledKeys:['pin','contact_info'],sections:[{section_key:'pin',completed:1}]};
  assert.deepEqual(finalizedUpdateProgress({status:'finalized',finalized_at:'2026-10-15',snapshot_json}), {completed:1,total:2});
  assert.equal(finalizedUpdateProgress({status:'in_progress',snapshot_json}), null);
  assert.equal(finalizedUpdateProgress({status:'finalized',finalized_at:'2026-10-15',snapshot_json:'invalid'}), null);
});
