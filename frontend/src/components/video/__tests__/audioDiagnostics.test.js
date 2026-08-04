import { describe, expect, it } from 'vitest';
import {
  parseConnectionIdentity,
  buildAudioDiagnosticsSnapshot,
  detectDuplicateIdentities,
  findOrphanMediaElements
} from '../audioDiagnostics.js';

describe('parseConnectionIdentity', () => {
  it('parses connection.data JSON with user-{id} identity', () => {
    const result = parseConnectionIdentity({
      connectionId: 'conn-a',
      data: JSON.stringify({
        identity: 'user-42',
        displayName: 'Ada Lovelace'
      })
    });
    expect(result).toEqual({
      connectionId: 'conn-a',
      identity: 'user-42',
      userId: 42,
      displayName: 'Ada Lovelace'
    });
  });

  it('falls back gracefully on missing or invalid data', () => {
    expect(parseConnectionIdentity(null)).toEqual({
      connectionId: '',
      identity: '',
      userId: null,
      displayName: ''
    });
    expect(parseConnectionIdentity({ connectionId: 'c1', data: 'not-json' })).toEqual({
      connectionId: 'c1',
      identity: '',
      userId: null,
      displayName: ''
    });
  });

  it('accepts already-parsed connection.data objects', () => {
    const result = parseConnectionIdentity({
      id: 'conn-b',
      data: { identity: 'guest-xyz', display_name: 'Guest' }
    });
    expect(result.connectionId).toBe('conn-b');
    expect(result.identity).toBe('guest-xyz');
    expect(result.userId).toBeNull();
    expect(result.displayName).toBe('Guest');
  });
});

describe('detectDuplicateIdentities', () => {
  it('returns identities with more than one distinct connectionId', () => {
    const dupes = detectDuplicateIdentities([
      { identity: 'user-1', connectionId: 'c1', streamId: 's1', displayName: 'A' },
      { identity: 'user-1', connectionId: 'c2', streamId: 's2', displayName: 'A' },
      { identity: 'user-2', connectionId: 'c3', streamId: 's3', displayName: 'B' }
    ]);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].identity).toBe('user-1');
    expect(dupes[0].connectionCount).toBe(2);
    expect(dupes[0].connectionIds.sort()).toEqual(['c1', 'c2']);
    expect(dupes[0].streamIds.sort()).toEqual(['s1', 's2']);
  });

  it('ignores blank identities and single-connection rows', () => {
    expect(detectDuplicateIdentities([
      { identity: '', connectionId: 'c1', streamId: 's1' },
      { identity: 'user-9', connectionId: 'c9', streamId: 's9' },
      { identity: 'user-9', connectionId: 'c9', streamId: 's9b' }
    ])).toEqual([]);
  });
});

describe('findOrphanMediaElements', () => {
  it('reports media elements outside known containers', () => {
    const host = document.createElement('div');
    const knownVideo = document.createElement('video');
    host.appendChild(knownVideo);
    document.body.appendChild(host);

    const orphanAudio = document.createElement('audio');
    orphanAudio.muted = false;
    orphanAudio.volume = 0.8;
    document.body.appendChild(orphanAudio);

    try {
      const orphans = findOrphanMediaElements([host], document);
      expect(orphans).toHaveLength(1);
      expect(orphans[0].tagName).toBe('AUDIO');
      expect(orphans[0].muted).toBe(false);
      expect(orphans[0].volume).toBe(0.8);
    } finally {
      host.remove();
      orphanAudio.remove();
    }
  });

  it('returns empty when every media node is inside a known container', () => {
    const host = document.createElement('div');
    host.appendChild(document.createElement('video'));
    host.appendChild(document.createElement('audio'));
    document.body.appendChild(host);
    try {
      expect(findOrphanMediaElements([host], document)).toEqual([]);
    } finally {
      host.remove();
    }
  });
});

describe('buildAudioDiagnosticsSnapshot', () => {
  it('serializes local track settings and remote rows with counts', () => {
    const track = {
      label: 'MacBook Pro Microphone',
      kind: 'audio',
      id: 'track-1',
      readyState: 'live',
      enabled: true,
      muted: false,
      getSettings: () => ({
        deviceId: 'dev-mic',
        echoCancellation: true,
        noiseSuppression: true,
        voiceIsolation: 'off'
      }),
      getConstraints: () => ({ echoCancellation: true })
    };
    const host = document.createElement('div');
    host.appendChild(document.createElement('video'));
    document.body.appendChild(host);

    try {
      const snapshot = buildAudioDiagnosticsSnapshot({
        localPublisher: { streamId: 'local-stream' },
        localAudioTrack: track,
        localPublishAudio: true,
        localPublishVideo: true,
        localConnectionId: 'local-conn',
        localIdentity: 'user-7',
        remotes: [
          {
            streamId: 'r1',
            connectionId: 'c1',
            identity: 'user-1',
            displayName: 'Remote One',
            hasAudio: true,
            hasVideo: false
          },
          {
            streamId: 'r2',
            connectionId: 'c2',
            identity: 'user-1',
            displayName: 'Remote One',
            hasAudio: true,
            hasVideo: true
          }
        ],
        screenSubscriber: null,
        screenPublisher: null,
        containers: [host]
      });

      expect(snapshot.counts.localPublishers).toBe(1);
      expect(snapshot.counts.cameraSubscribers).toBe(2);
      expect(snapshot.counts.duplicateIdentityGroups).toBe(1);
      expect(snapshot.local.audioTrack.deviceId).toBe('dev-mic');
      expect(snapshot.local.audioTrack.settings.echoCancellation).toBe(true);
      expect(snapshot.local.audioTrack.settings.voiceIsolation).toBe('off');
      expect(snapshot.remotes).toHaveLength(2);
      expect(snapshot.duplicateIdentities[0].identity).toBe('user-1');
    } finally {
      host.remove();
    }
  });
});
