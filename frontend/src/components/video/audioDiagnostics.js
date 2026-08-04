/**
 * Read-only helpers for meeting audio/media diagnostics.
 * Pure functions — no Vonage SDK or Vue dependencies.
 */

function safeJsonParse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * Parse Vonage connection.data JSON into a stable identity snapshot.
 * Server tokens set `{ identity: 'user-{id}', displayName, ... }`.
 */
export function parseConnectionIdentity(connection) {
  const connectionId = String(connection?.connectionId || connection?.id || '').trim();
  const parsed = safeJsonParse(connection?.data);
  const identity = String(parsed?.identity || '').trim();
  const displayName = String(
    parsed?.displayName || parsed?.display_name || parsed?.name || ''
  ).trim();
  let userId = null;
  if (parsed?.userId != null && Number(parsed.userId) > 0) {
    userId = Number(parsed.userId);
  } else {
    const match = /^user-(\d+)$/i.exec(identity);
    if (match?.[1]) userId = Number(match[1]);
  }
  return { connectionId, identity, userId, displayName };
}

function serializeTrackSettings(track) {
  if (!track || typeof track.getSettings !== 'function') return null;
  try {
    return track.getSettings() || {};
  } catch {
    return null;
  }
}

function serializeTrackConstraints(track) {
  if (!track || typeof track.getConstraints !== 'function') return null;
  try {
    return track.getConstraints() || {};
  } catch {
    return null;
  }
}

function describeAudioTrack(track) {
  if (!track) return null;
  const settings = serializeTrackSettings(track) || {};
  return {
    label: String(track.label || ''),
    kind: String(track.kind || ''),
    id: String(track.id || ''),
    readyState: String(track.readyState || ''),
    enabled: track.enabled !== false,
    muted: !!track.muted,
    deviceId: String(settings.deviceId || track.getSettings?.()?.deviceId || ''),
    settings,
    constraints: serializeTrackConstraints(track) || {}
  };
}

function countMediaInContainers(containers, tagName) {
  const tag = String(tagName || '').toUpperCase();
  let count = 0;
  const seen = new Set();
  for (const container of containers || []) {
    if (!container) continue;
    const nodes = [];
    if (typeof container.matches === 'function' && container.matches(tag.toLowerCase())) {
      nodes.push(container);
    }
    if (typeof container.querySelectorAll === 'function') {
      nodes.push(...container.querySelectorAll(tag.toLowerCase()));
    }
    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);
      count += 1;
    }
  }
  return count;
}

/**
 * Build a JSON-serializable snapshot of the live audio/media graph.
 *
 * @param {object} state
 * @param {object|null} state.localPublisher — publisher presence / stream id
 * @param {MediaStreamTrack|null} state.localAudioTrack
 * @param {boolean} state.localPublishAudio
 * @param {boolean} state.localPublishVideo
 * @param {string} state.localConnectionId
 * @param {string} state.localIdentity
 * @param {Array<object>} state.remotes — rows with streamId, connectionId, identity, etc.
 * @param {object|null} state.screenSubscriber
 * @param {object|null} state.screenPublisher
 * @param {Array<Element>} state.containers — known media mount points
 */
export function buildAudioDiagnosticsSnapshot(state = {}) {
  const remotes = Array.isArray(state.remotes) ? state.remotes : [];
  const containers = Array.isArray(state.containers) ? state.containers.filter(Boolean) : [];
  const localTrack = describeAudioTrack(state.localAudioTrack || null);
  const duplicateIdentities = detectDuplicateIdentities(remotes);
  const orphanMedia = findOrphanMediaElements(containers);

  const cameraSubscriberCount = remotes.filter((r) => !r.isScreen).length;
  const screenFromRows = remotes.filter((r) => r.isScreen).length;
  const screenSubscriberCount = Math.max(screenFromRows, state.screenSubscriber ? 1 : 0);

  return {
    capturedAt: new Date().toISOString(),
    counts: {
      localPublishers: state.localPublisher ? 1 : 0,
      screenPublishers: state.screenPublisher ? 1 : 0,
      cameraSubscribers: cameraSubscriberCount,
      screenSubscribers: screenSubscriberCount,
      remoteRows: remotes.length,
      audioElements: countMediaInContainers(containers, 'audio')
        + orphanMedia.filter((o) => o.tagName === 'AUDIO').length,
      videoElements: countMediaInContainers(containers, 'video')
        + orphanMedia.filter((o) => o.tagName === 'VIDEO').length,
      orphanMediaElements: orphanMedia.length,
      duplicateIdentityGroups: duplicateIdentities.length
    },
    local: {
      connectionId: String(state.localConnectionId || ''),
      identity: String(state.localIdentity || ''),
      publishAudio: !!state.localPublishAudio,
      publishVideo: !!state.localPublishVideo,
      streamId: String(state.localPublisher?.streamId || state.localPublisher?.stream?.streamId || ''),
      audioTrack: localTrack
    },
    remotes: remotes.map((r) => ({
      streamId: String(r.streamId || ''),
      connectionId: String(r.connectionId || ''),
      identity: String(r.identity || ''),
      userId: r.userId ?? null,
      displayName: String(r.displayName || r.name || ''),
      hasAudio: r.hasAudio !== false,
      hasVideo: r.hasVideo !== false,
      isScreen: !!r.isScreen
    })),
    screen: {
      hasScreenSubscriber: !!state.screenSubscriber,
      hasScreenPublisher: !!state.screenPublisher,
      screenStreamId: String(
        state.screenSubscriber?.streamId
        || state.screenPublisher?.stream?.streamId
        || ''
      )
    },
    duplicateIdentities,
    orphanMedia
  };
}

/**
 * Group remotes by identity and return identities with >1 distinct connectionId.
 */
export function detectDuplicateIdentities(remoteRows = []) {
  const byIdentity = new Map();
  for (const row of remoteRows || []) {
    const identity = String(row?.identity || '').trim();
    if (!identity) continue;
    const connectionId = String(row?.connectionId || '').trim();
    const streamId = String(row?.streamId || '').trim();
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, {
        identity,
        userId: row?.userId ?? null,
        displayName: String(row?.displayName || row?.name || ''),
        connectionIds: new Set(),
        streamIds: new Set()
      });
    }
    const group = byIdentity.get(identity);
    if (connectionId) group.connectionIds.add(connectionId);
    if (streamId) group.streamIds.add(streamId);
    if (row?.userId != null && group.userId == null) group.userId = row.userId;
    if (!group.displayName && (row?.displayName || row?.name)) {
      group.displayName = String(row.displayName || row.name);
    }
  }

  const duplicates = [];
  for (const group of byIdentity.values()) {
    if (group.connectionIds.size > 1) {
      duplicates.push({
        identity: group.identity,
        userId: group.userId,
        displayName: group.displayName,
        connectionIds: [...group.connectionIds],
        streamIds: [...group.streamIds],
        connectionCount: group.connectionIds.size
      });
    }
  }
  return duplicates;
}

/**
 * Find <audio>/<video> elements that are not inside any expected container.
 */
export function findOrphanMediaElements(expectedContainers = [], rootDocument = globalThis?.document) {
  if (!rootDocument?.querySelectorAll) return [];
  const containers = (expectedContainers || []).filter(Boolean);
  const media = [...rootDocument.querySelectorAll('audio, video')];
  const orphans = [];
  for (const el of media) {
    const insideKnown = containers.some((container) => {
      try {
        if (el === container) return true;
        if (typeof container.contains === 'function' && container.contains(el)) return true;
      } catch { /* ignore */ }
      return false;
    });
    if (insideKnown) continue;
    orphans.push({
      tagName: String(el.tagName || '').toUpperCase(),
      muted: !!el.muted,
      volume: Number(el.volume ?? 1),
      paused: !!el.paused,
      srcObjectKind: el.srcObject ? 'MediaStream' : (el.src ? 'src' : 'none'),
      className: String(el.className || ''),
      id: String(el.id || '')
    });
  }
  return orphans;
}
