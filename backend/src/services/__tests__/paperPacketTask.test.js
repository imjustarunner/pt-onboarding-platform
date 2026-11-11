import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: {} }));
vi.mock('../../models/Task.model.js', () => ({ default: {} }));
import { ensurePaperPacketTask, completePaperPacketTask, listPaperPacketTasks } from '../paperPacketTask.service.js';
const draft = { status:'submitted',created_client_id:55,initials:'SynChi',id: 20, agency_id: 450, organization_id: 451, phi_document_id: 30, uploaded_by_user_id: 40 };
let saved, conn, db, tasks;
beforeEach(() => {
  saved = null;
  conn = { release: vi.fn(), execute: vi.fn(async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : sql.startsWith('SELECT id') ? [[...(saved ? [saved] : [])]] : [[]]) };
  db = { getConnection: vi.fn(async () => conn), execute: vi.fn(async sql => sql.startsWith('SELECT role') ? [[{ role: 'school_staff' }]] : sql.includes('FROM client_phi_documents') ? [[{original_name:'Synthetic paper.pdf',school_name:'QA School',initials:'SynChi'}]] : [[]]) };
  tasks = { create: vi.fn(async data => { saved = { id: 90, ...data }; return saved; }) };
});
it('creates one agency Support task only after attaching the saved child and reuses it', async () => {
  expect(await ensurePaperPacketTask({ draft }, { db, tasks })).toBe(90);
  expect(saved).toMatchObject({ assignedToRole: 'support', assignedToAgencyId: 450, sourceRefId: '20', metadata: { documentId: 30, clientId: 55, packetFilename:'Synthetic paper.pdf' } });
  expect(await ensurePaperPacketTask({ draft, clientId: 55 }, { db, tasks })).toBe(90);
  expect(tasks.create).toHaveBeenCalledOnce();
  expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('JSON_MERGE_PATCH'),expect.arrayContaining([90,450]));
  expect(saved.title).toContain('SynChi · #55 · Synthetic paper.pdf');
  expect(conn.release).toHaveBeenCalledTimes(2);
});
it('does not add an unsolicited task for a Support upload or an unsaved file', async () => {
  db.execute.mockResolvedValue([[{ role: 'support' }]]);
  expect(await ensurePaperPacketTask({ draft }, { db, tasks })).toBeNull();
  expect(await ensurePaperPacketTask({ draft: { ...draft, phi_document_id: null } }, { db, tasks })).toBeNull();
  expect(tasks.create).not.toHaveBeenCalled();
});
it('does not duplicate a task after a competing request obtains its lock', async () => {
  conn.execute.mockResolvedValueOnce([[{ acquired: 0 }]]);
  await expect(ensurePaperPacketTask({ draft }, { db, tasks })).rejects.toThrow('Refresh');
  expect(tasks.create).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledOnce();
});
it('releases the task lock after a failed insert so recovery can retry', async () => {
  tasks.create.mockRejectedValueOnce(new Error('unavailable'));
  await expect(ensurePaperPacketTask({ draft }, { db, tasks })).rejects.toThrow('unavailable');
  expect(conn.release).toHaveBeenCalledOnce();
  expect(await ensurePaperPacketTask({ draft }, { db, tasks })).toBe(90);
});
it.each(['queued', 'unknown', 'failed', 'blocked', undefined])('keeps the task pending while one guardian delivery is %s', async status => {
  const state = { processedAt: '2026-11-09', documentId: 30, guardian1Id: 61, guardian2Id: 62, invitations: { 61: { status: 'sent' }, 62: { status } } };
  expect(await completePaperPacketTask({ clientId: 55, state }, db)).toBe(false);
  expect(db.execute).not.toHaveBeenCalled();
});
it('completes only the matching client and packet after processing and both deliveries', async () => {
  const state = { processedAt: '2026-11-09', documentId: 30, guardian1Id: 61, guardian2Id: 62, invitations: { 61: { status: 'sent' }, 62: { status: 'redirected' } } };
  expect(await completePaperPacketTask({ clientId: 55, state }, db)).toBe(true);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('t.completed_at=NOW()'), [55, 30]);
  expect(db.execute.mock.calls[0][0]).toContain('t.assigned_to_agency_id=d.agency_id');
});

it('recovers a missing Support notice without duplicating the task or an existing notice', async () => {
  const notifications = { create: vi.fn(async () => ({ id: 91 })) };
  db.execute.mockImplementation(async sql => sql.startsWith('SELECT role') ? [[{ role: 'school_staff' }]] : [[{ id: 7 }]]);
  let noticeExists = false;
  conn.execute.mockImplementation(async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : sql.includes('FROM notifications') ? [[...(noticeExists ? [{ id: 91 }] : [])]] : sql.includes('FROM tasks') ? [[...(saved ? [saved] : [])]] : [[]]);
  notifications.create.mockImplementation(async () => { noticeExists = true; return { id: 91 }; });
  await ensurePaperPacketTask({ draft }, { db, tasks, notifications });
  await ensurePaperPacketTask({ draft }, { db, tasks, notifications });
  expect(tasks.create).toHaveBeenCalledOnce(); expect(notifications.create).toHaveBeenCalledOnce();
  expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, agencyId: 450, relatedEntityType: 'paper_packet_task', relatedEntityId: 90 }));
});

it('does not create an actionable Support task for an unfinished school upload',async()=>{
 expect(await ensurePaperPacketTask({draft:{...draft,status:'draft',created_client_id:null}}, {db,tasks})).toBeNull();
 expect(tasks.create).not.toHaveBeenCalled();expect(db.getConnection).not.toHaveBeenCalled();
});
it('requires the document to be attached to the same saved child before creating its task',async()=>{
 db.execute.mockImplementation(async sql=>sql.startsWith('SELECT role')?[[{role:'school_staff'}]]:[[]]);
 await expect(ensurePaperPacketTask({draft},{db,tasks})).rejects.toThrow('finish attaching');
 expect(tasks.create).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalledOnce();
});

it('finds an existing draft task through the saved child even when its old metadata has no clientId',async()=>{
 db.execute.mockResolvedValue([[{id:2457,draft_id:214,document_id:4312,packet_filename:'Synthetic.pdf'}]]);
 expect(await listPaperPacketTasks({clientId:2483,agencyId:450},db)).toEqual([expect.objectContaining({id:2457,document_id:4312})]);
 const [sql,params]=db.execute.mock.calls[0];expect(params).toEqual([2483,450]);expect(sql).toContain('t.assigned_to_agency_id=d.agency_id');expect(sql).toContain("d.status='submitted'");expect(sql).toContain('COALESCE(t.is_private,0)=0');
 expect(sql).not.toContain("JSON_EXTRACT(t.metadata, '$.clientId')");
});
