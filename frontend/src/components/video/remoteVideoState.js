/**
 * Apply one authoritative remote-camera state update.
 *
 * Vonage can echo videoEnabled/videoDisabled after subscribeToVideo(). Returning
 * changed=false for an identical echo is what prevents event -> subscribe ->
 * event feedback loops in the room component.
 */
export function updateRemoteVideoState(remotes, { streamId = '', connectionId = '', hasVideo }) {
  const sid = String(streamId || '').trim();
  const cid = String(connectionId || '').trim();
  const on = !!hasVideo;
  let matched = false;
  let changed = false;
  const next = (Array.isArray(remotes) ? remotes : []).map((remote) => {
    const hit = (sid && remote.streamId === sid) || (cid && remote.connectionId === cid);
    if (!hit) return remote;
    matched = true;
    if (remote.hasVideo === on) return remote;
    changed = true;
    return { ...remote, hasVideo: on };
  });
  return { remotes: next, matched, changed, hasVideo: on, streamId: sid, connectionId: cid };
}
