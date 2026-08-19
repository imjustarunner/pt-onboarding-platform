import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInboundStatusDraftSources,
  buildManualDraftSources,
  mergeMetadataDraftSources,
  parseDraftSourcesFromMetadata
} from '../schoolSupportDraftSources.shared.js';

describe('schoolSupportDraftSources.shared', () => {
  it('builds manual draft sources from ticket context', () => {
    const sources = buildManualDraftSources({
      ticket: { id: 42, subject: 'Status?', school_organization_id: 4, school_name: 'Rudy' },
      client: {
        id: 10,
        initials: 'EmaWar',
        client_status_label: 'Ready to Schedule',
        provider_name: 'Nicole Porter',
        service_day: 'Wednesday'
      },
      libraryMatches: [{ id: 5, title: 'ROI pending', intentKey: 'school_status_request', intentLabel: 'Client status update' }],
      intentKey: 'school_status_request'
    });
    assert.ok(sources.some((s) => s.type === 'ticket' && s.id === 42));
    assert.ok(sources.some((s) => s.type === 'client' && s.id === 10));
    assert.ok(sources.some((s) => s.type === 'reply_library' && s.id === 5));
    assert.ok(sources.some((s) => s.type === 'school'));
  });

  it('builds inbound status draft sources with checklist items', () => {
    const sources = buildInboundStatusDraftSources({
      schoolName: 'Ashley',
      schoolOrganizationId: 36,
      client: { id: 99, initials: 'SamOve', client_status_label: 'Confirmation Pending' },
      checklistItems: [{ label: 'ROI', isNeeded: true }],
      attachmentCount: 1
    });
    assert.ok(sources.some((s) => s.type === 'checklist_item' && /ROI/.test(s.label)));
    assert.ok(sources.some((s) => s.type === 'attachment'));
  });

  it('merges draft sources into metadata', () => {
    const merged = mergeMetadataDraftSources(
      { policyMode: 'draft_known_contacts_only' },
      [{ type: 'client', id: 1, label: 'Client: Sam' }]
    );
    assert.equal(merged.policyMode, 'draft_known_contacts_only');
    assert.equal(merged.draftSources.length, 1);
    assert.ok(merged.draftSourcesUpdatedAt);
  });

  it('parses draft sources from metadata', () => {
    const sources = parseDraftSourcesFromMetadata({
      draftSources: [{ type: 'intent', label: 'Intent: school status request' }]
    });
    assert.equal(sources.length, 1);
  });
});
