import { describe, expect, it } from 'vitest';
import { filterClinicalNoteDrafts, groupClinicalNoteDrafts } from '../clinicalNoteLibrary.js';
import { parseNoteAidTodoList } from '../noteAidWorkQueue.js';
import {
  DOC_STATUS,
  NOTE_CONNECTION,
  buildLeftLibraryRows,
  filterLeftLibraryRows,
  filterWorkQueueForRightPanel,
  groupLeftLibraryRows,
  deriveDraftDocStatus,
  deriveWorkQueueDocStatus,
  deriveNoteConnection
} from '../noteAidDocumentationStatus.js';

describe('clinicalNoteLibrary search/group', () => {
  const drafts = [
    {
      id: 1,
      initials: 'FRA ESC',
      client_full_name: 'Frankie Eschberger',
      agency_name: 'Next Level Up',
      client_type: 'clinical',
      service_code: '90837',
      date_of_service: '2026-08-01',
      created_at: '2026-08-25T17:00:00Z'
    },
    {
      id: 2,
      initials: 'SB',
      client_full_name: 'She Bar',
      agency_name: 'ITSCO',
      client_type: 'school',
      service_code: '90837',
      date_of_service: '2026-08-20',
      created_at: '2026-08-20T12:00:00Z'
    }
  ];

  it('finds Frankie by Fra substring', () => {
    const hits = filterClinicalNoteDrafts(drafts, { tab: 'active', search: 'Fra' });
    expect(hits.map((d) => d.id)).toEqual([1]);
  });

  it('groups by client and can invert date order', () => {
    const groups = groupClinicalNoteDrafts(drafts, { groupBy: 'client', dateOrder: 'oldest' });
    expect(groups.length).toBe(2);
    expect(groups.some((g) => /Frankie/i.test(g.label))).toBe(true);
  });
});

describe('parseNoteAidTodoList', () => {
  it('skips consultations and keeps progress/intake/plan', () => {
    const text = `4/9/26
She Bar
Create a Progress Note for Therapy Session (90837) on 4/9 at 12 PM.

4/9/26
Trevor Reynolds
Create a Consultation Note for Consultation (99415) on 4/9 at 1 PM.

8/20/26
Eri Rua
Create an Intake Note for Therapy Intake (90791) on 8/20 at 2 PM.

6/17/26
She Bar
Create a new Treatment Plan since the most recent Treatment Plan is more than 90 days old.`;
    const { items, skipped } = parseNoteAidTodoList(text);
    expect(skipped.length).toBe(1);
    expect(items.length).toBe(3);
    expect(items.map((i) => i.noteKind).sort()).toEqual(['intake', 'progress', 'treatment_plan'].sort());
  });

  it('parses single-line day list rows', () => {
    const text = `4/9/26 Sheldon Baron Create a Progress Note for Therapy Session (90837) on 4/9 at 12 pm.
4/9/26 Trevor Reynolds Create a Consultation Note for Consultation (99415) on 4/9 at 1 pm.
4/9/26 Alex Smith Create a Progress Note for Therapy Session (90837) on 4/9 at 2 pm.`;
    const { items, skipped } = parseNoteAidTodoList(text);
    expect(skipped.length).toBe(1);
    expect(items.length).toBe(2);
    expect(items[0].clientName).toBe('Sheldon Baron');
    expect(items[0].serviceCode).toBe('90837');
    expect(items[0].timeLabel).toBe('12 PM');
    expect(items[1].clientName).toBe('Alex Smith');
  });
});

describe('noteAidDocumentationStatus panels', () => {
  it('keeps not_started on right only; started on both', () => {
    const queue = [
      { id: 'a', status: 'not_started', clientName: 'A' },
      { id: 'b', status: 'started', clientName: 'B' },
      { id: 'c', status: 'completed', clientName: 'C' },
      { id: 'd', status: 'signed', clientName: 'D' }
    ];
    const right = filterWorkQueueForRightPanel(queue);
    expect(right.map((i) => i.id)).toEqual(['a', 'b']);

    const left = buildLeftLibraryRows({ drafts: [], workQueueItems: queue });
    expect(left.map((r) => r.workQueueId).sort()).toEqual(['b', 'c', 'd']);
  });

  it('collapses duplicate drafts and work-queue shells for the same session', () => {
    const left = buildLeftLibraryRows({
      drafts: [
        {
          id: 11,
          input_text: 'note a',
          client_id: 5,
          date_of_service: '2026-06-11',
          service_code: '90832 / 90834 / 90837',
          client_full_name: 'MACDOW'
        },
        {
          id: 12,
          input_text: 'note b',
          client_id: 5,
          date_of_service: '2026-06-11',
          service_code: '90837',
          client_full_name: 'MACDOW',
          created_at: '2026-08-31T21:00:00Z'
        }
      ],
      workQueueItems: [
        {
          id: 'q1',
          status: 'started',
          clientId: 5,
          date: '2026-06-11',
          serviceCode: '90837',
          clientName: 'Mac Downing'
        }
      ]
    });
    expect(left).toHaveLength(1);
    expect(left[0].source).toBe('draft');
    expect(left[0].workQueueId).toBe('q1');
  });

  it('stamps work-queue id onto a draft already linked by draftId', () => {
    const left = buildLeftLibraryRows({
      drafts: [
        {
          id: 44,
          input_text: 'existing',
          client_id: 9,
          date_of_service: '2026-08-01',
          service_code: '90791'
        }
      ],
      workQueueItems: [
        {
          id: 'q-intake',
          status: 'started',
          draftId: 44,
          clientId: 9,
          date: '2026-08-01',
          serviceCode: '90791',
          noteKind: 'intake'
        }
      ]
    });
    expect(left).toHaveLength(1);
    expect(left[0].draftId).toBe(44);
    expect(left[0].workQueueId).toBe('q-intake');
  });

  it('filters left tabs by status', () => {
    const rows = buildLeftLibraryRows({
      drafts: [
        { id: 1, input_text: 'hi', client_full_name: 'Started Draft' },
        { id: 2, output_json: '{}', client_full_name: 'Completed Draft' }
      ],
      workQueueItems: [{ id: 's1', status: 'signed', clientName: 'Signed One' }]
    });
    expect(filterLeftLibraryRows(rows, { tab: DOC_STATUS.STARTED }).length).toBeGreaterThan(0);
    expect(
      filterLeftLibraryRows(rows, { tab: DOC_STATUS.COMPLETED }).every(
        (r) => r.docStatus === DOC_STATUS.COMPLETED
      )
    ).toBe(true);
    expect(filterLeftLibraryRows(rows, { tab: DOC_STATUS.SIGNED }).map((r) => r.workQueueId)).toEqual([
      's1'
    ]);
  });

  it('maps legacy active/done statuses', () => {
    expect(deriveWorkQueueDocStatus({ status: 'active' })).toBe(DOC_STATUS.STARTED);
    expect(deriveWorkQueueDocStatus({ status: 'done' })).toBe(DOC_STATUS.COMPLETED);
    expect(deriveDraftDocStatus({ output_json: '{"a":1}' })).toBe(DOC_STATUS.COMPLETED);
  });

  it('classifies unlinked / client / session connections', () => {
    expect(deriveNoteConnection({ initials: 'ABC' })).toBe(NOTE_CONNECTION.UNLINKED);
    expect(deriveNoteConnection({ client_id: 12 })).toBe(NOTE_CONNECTION.CLIENT);
    expect(deriveNoteConnection({ clientId: 12, officeEventId: 99 })).toBe(NOTE_CONNECTION.SESSION);
    expect(deriveNoteConnection({ clinical_session_id: 5 })).toBe(NOTE_CONNECTION.SESSION);

    const rows = buildLeftLibraryRows({
      drafts: [
        { id: 1, input_text: 'x', initials: 'AAA' },
        { id: 2, input_text: 'x', client_id: 7, client_full_name: 'Client' },
        { id: 3, input_text: 'x', client_id: 8, office_event_id: 44, client_full_name: 'Sess' }
      ],
      workQueueItems: []
    });
    const byConn = Object.fromEntries(rows.map((r) => [r.draftId, r.connection]));
    expect(byConn[1]).toBe(NOTE_CONNECTION.UNLINKED);
    expect(byConn[2]).toBe(NOTE_CONNECTION.CLIENT);
    expect(byConn[3]).toBe(NOTE_CONNECTION.SESSION);

    const grouped = groupLeftLibraryRows(rows, { groupBy: 'connection' });
    expect(grouped.map((g) => g.connection)).toEqual([
      NOTE_CONNECTION.UNLINKED,
      NOTE_CONNECTION.CLIENT,
      NOTE_CONNECTION.SESSION
    ]);
  });

  it('groups left library by created date vs service date', () => {
    const rows = buildLeftLibraryRows({
      drafts: [
        {
          id: 1,
          input_text: 'a',
          initials: 'A',
          date_of_service: '2026-08-01',
          created_at: '2026-08-25T17:00:00Z'
        },
        {
          id: 2,
          input_text: 'b',
          initials: 'B',
          date_of_service: '2026-08-01',
          created_at: '2026-08-20T12:00:00Z'
        }
      ],
      workQueueItems: []
    });
    const byCreated = groupLeftLibraryRows(rows, { groupBy: 'date', dateOrder: 'newest' });
    expect(byCreated.map((g) => g.label)).toEqual(['2026-08-25', '2026-08-20']);
    const byDos = groupLeftLibraryRows(rows, { groupBy: 'service_date', dateOrder: 'newest' });
    expect(byDos).toHaveLength(1);
    expect(byDos[0].label).toBe('2026-08-01');
    expect(byDos[0].drafts).toHaveLength(2);
  });
});
