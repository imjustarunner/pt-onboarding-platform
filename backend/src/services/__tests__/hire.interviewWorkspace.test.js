import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ getConnection: vi.fn(), execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import { mergeInterviewWorkspace, interviewArtifactForViewer, saveInterviewWorkspace } from '../hiringInterviewWorkspace.service.js';
import HiringInterviewArtifact from '../../models/HiringInterviewArtifact.model.js';
const actor = { id: 11, first_name: 'Elena', last_name: 'Cruz' };
const base = () => ({ id: 1, flow_state_json: { sections: [{ key: 'standard', questions: [{ key: 'q1', text: 'Experience?' }] }], completed: { 'standard:q1': true } }, private_notes_json: { '22': 'Private colleague note' }, scorecard_json: { byInterviewer: { '22': { communication: 2 } } }, team_chat_json: [{ id: 'old', authorId: '22', text: 'Earlier' }] });
describe('multi-interviewer persistence', () => {
  it('keeps other notes and exposes only the viewer’s notes', () => {
    const merged = mergeInterviewWorkspace(base(), { myNotes: 'My note' }, actor);
    expect(merged.private_notes_json).toEqual({ '11': 'My note', '22': 'Private colleague note' });
    expect(interviewArtifactForViewer(merged, 11).private_notes_json).toEqual({ '11': 'My note' });
    expect(interviewArtifactForViewer(merged, 33).private_notes_json).toEqual({ '33': '' });
  });
  it('ignores forged private note maps and team authors', () => {
    const merged = mergeInterviewWorkspace(base(), { private_notes_json: { '22': 'Changed' }, teamMessage: { id: 'new', text: 'Hello', authorId: '22' } }, actor);
    expect(merged.private_notes_json['22']).toBe('Private colleague note');
    expect(merged.team_chat_json[1].authorId).toBe('11');
    expect(merged.team_chat_json[1].authorName).toBe('Elena Cruz');
  });
  it('merges disjoint question changes without resetting earlier progress', () => {
    const first = mergeInterviewWorkspace(base(), { completedPatch: { 'standard:q2': true } }, actor);
    const second = mergeInterviewWorkspace(first, { completedPatch: { 'standard:q3': true } }, { id: 22 });
    expect(second.flow_state_json.completed).toEqual({ 'standard:q1': true, 'standard:q2': true, 'standard:q3': true });
  });
  it('keeps individual ratings and derives the team score', () => {
    const merged = mergeInterviewWorkspace(base(), { myRatings: { communication: 4, experience: 0 } }, actor);
    expect(merged.scorecard_json.ratings.communication).toBe(3);
    expect(merged.scorecard_json.byInterviewer['22'].communication).toBe(2);
    expect(interviewArtifactForViewer(merged, 11).my_scorecard.communication).toBe(4);
  });
  it('does not duplicate retried chat messages or discard concurrent messages', () => {
    const payload = { teamMessage: { id: 'new', text: 'Hello' } };
    const first = mergeInterviewWorkspace(base(), payload, actor);
    const second = mergeInterviewWorkspace(first, { teamMessage: { id: 'other', text: 'Welcome' } }, { id: 22 });
    expect(mergeInterviewWorkspace(second, payload, actor).team_chat_json).toHaveLength(3);
  });
  it('preserves questions added concurrently', () => {
    const first = mergeInterviewWorkspace(base(), { sectionPatch: { key: 'additional', questions: [{ key: 'a', text: 'First' }] } }, actor);
    const second = mergeInterviewWorkspace(first, { sectionPatch: { key: 'additional', questions: [{ key: 'b', text: 'Second' }] } }, actor);
    expect(second.flow_state_json.sections[1].questions.map(q => q.key)).toEqual(['a', 'b']);
  });
  it('rejects invalid ratings and full replacement clients', async () => {
    expect(() => mergeInterviewWorkspace(base(), { myRatings: { communication: 100 } }, actor)).toThrow('Ratings');
    await expect(saveInterviewWorkspace(1, { privateNotesJson: {} }, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('locks the latest row before changing artifacts and commits', async () => {
    const conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn().mockResolvedValueOnce([[base()]]).mockResolvedValueOnce([{}]) };
    db.getConnection.mockResolvedValue(conn);
    const result = await saveInterviewWorkspace(1, { myNotes: 'Saved' }, actor);
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
    expect(result.private_notes_json).toEqual({ '11': 'Saved' });
  });
  it('finalizes the latest scorecard under the same row lock as teammate saves', async () => {
    const current = base(); current.scorecard_json.ratings = { communication: 3 };
    const conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn().mockResolvedValueOnce([[current]]).mockResolvedValueOnce([{}]) };
    db.getConnection.mockResolvedValue(conn);
    const result = await HiringInterviewArtifact.finalizeCurrent(1, { finalizedAt: new Date() }, score => score.ratings.communication);
    expect(result.average_score).toBe(3);
    expect(result.private_notes_json['22']).toBe('Private colleague note');
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('rolls back failed persistence and releases the connection', async () => {
    const conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn().mockResolvedValueOnce([[base()]]).mockRejectedValueOnce(new Error('write failed')) };
    db.getConnection.mockResolvedValue(conn);
    await expect(saveInterviewWorkspace(1, { myNotes: 'Saved' }, actor)).rejects.toThrow('write failed');
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledOnce();
  });
});
