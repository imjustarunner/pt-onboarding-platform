import { computed, ref, watch } from 'vue';
import api from '../services/api';

const STORAGE_PREFIX = 'focusMusicPrefs:v2:';

export const FULL_LIBRARY_PLAYLIST_ID = '__full_library__';
export const MY_FOCUS_PLAYLIST_ID = 'my-focus';

function newPlaylistId() {
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function defaultPrefs() {
  return {
    version: 4,
    playlists: [{ id: MY_FOCUS_PLAYLIST_ID, name: 'My focus', memberTrackIds: [], loopTrackIds: [] }],
    activePlaylistId: FULL_LIBRARY_PLAYLIST_ID,
    loopMode: 'playlist',
    shuffleEnabled: false,
    volume: 0.85,
    currentTrackId: null
  };
}

function migratePrefs(raw) {
  if (!raw) return defaultPrefs();
  if (Array.isArray(raw.playlists) && raw.playlists.length) {
    const playlists = raw.playlists.map((p) => {
      const isMyFocus = p.id === MY_FOCUS_PLAYLIST_ID || String(p.name || '').toLowerCase() === 'my focus';
      const loopTrackIds = [...(p.loopTrackIds || [])];
      const memberTrackIds = isMyFocus
        ? (loopTrackIds.length ? loopTrackIds : [...(p.memberTrackIds || [])])
        : [...(p.memberTrackIds || [])];
      const syncedLoop = isMyFocus ? [...memberTrackIds] : loopTrackIds;
      return {
        id: isMyFocus ? MY_FOCUS_PLAYLIST_ID : String(p.id),
        name: isMyFocus ? 'My focus' : String(p.name || 'Playlist').slice(0, 80),
        memberTrackIds: isMyFocus ? syncedLoop : memberTrackIds,
        loopTrackIds: syncedLoop
      };
    });
    const hasMyFocus = playlists.some((p) => p.id === MY_FOCUS_PLAYLIST_ID);
    if (!hasMyFocus) {
      playlists.unshift({ id: MY_FOCUS_PLAYLIST_ID, name: 'My focus', memberTrackIds: [], loopTrackIds: [] });
    }
    const version = Number(raw.version) || 3;
    const activePlaylistId = version >= 4
      ? (raw.activePlaylistId === FULL_LIBRARY_PLAYLIST_ID
        ? FULL_LIBRARY_PLAYLIST_ID
        : (raw.activePlaylistId || FULL_LIBRARY_PLAYLIST_ID))
      : FULL_LIBRARY_PLAYLIST_ID;
    return {
      version: 4,
      playlists,
      activePlaylistId,
      loopMode: raw.loopMode === 'single' ? 'single' : 'playlist',
      shuffleEnabled: raw.shuffleEnabled === true,
      volume: Number.isFinite(raw.volume) ? raw.volume : 0.85,
      currentTrackId: raw.currentTrackId || null
    };
  }
  const loopTrackIds = Array.isArray(raw.enabledTrackIds) ? raw.enabledTrackIds : [];
  return {
    version: 4,
    playlists: [{
      id: MY_FOCUS_PLAYLIST_ID,
      name: 'My focus',
      memberTrackIds: loopTrackIds,
      loopTrackIds
    }],
    activePlaylistId: FULL_LIBRARY_PLAYLIST_ID,
    loopMode: raw.loopMode === 'single' ? 'single' : 'playlist',
    shuffleEnabled: false,
    volume: Number.isFinite(raw.volume) ? raw.volume : 0.85,
    currentTrackId: raw.currentTrackId || null
  };
}

function loadPrefs(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem(`focusMusicPrefs:v1:${userId}`);
    return legacy ? JSON.parse(legacy) : null;
  } catch {
    return null;
  }
}

function savePrefs(userId, prefs) {
  if (!userId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function formatTime(sec) {
  const n = Math.max(0, Number(sec) || 0);
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

let sharedAudio = null;

function getAudio() {
  if (!sharedAudio && typeof Audio !== 'undefined') {
    sharedAudio = new Audio();
    sharedAudio.preload = 'metadata';
  }
  return sharedAudio;
}

export function useFocusMusicPlayer({ userIdRef } = {}) {
  const tracks = ref([]);
  const loading = ref(false);
  const loadError = ref('');
  const modalOpen = ref(false);
  const playing = ref(false);
  const currentTrackId = ref(null);
  const currentTime = ref(0);
  const duration = ref(0);
  const playlists = ref([]);
  const activePlaylistId = ref('');
  const loopMode = ref('playlist');
  const shuffleEnabled = ref(false);
  const playOrderIds = ref([]);
  const volume = ref(0.85);
  const showLibrary = ref(false);
  const platformPlaylists = ref([]);
  const canManagePlatformPlaylists = ref(false);
  const expandedPlatformIds = ref([]);
  const managingPlatformId = ref(null);

  const isFullLibraryPlaylistId = (id) => id === FULL_LIBRARY_PLAYLIST_ID;

  const findMyFocusPlaylist = () =>
    playlists.value.find(
      (p) => p.id === MY_FOCUS_PLAYLIST_ID || String(p.name || '').toLowerCase() === 'my focus'
    ) || null;

  const isFullLibraryActive = computed(() => isFullLibraryPlaylistId(activePlaylistId.value));

  const isMyFocusActive = computed(() => {
    const pl = activePlaylist.value;
    return Boolean(pl && (pl.id === MY_FOCUS_PLAYLIST_ID || String(pl.name || '').toLowerCase() === 'my focus'));
  });

  const fullLibraryPlaylist = computed(() => ({
    id: FULL_LIBRARY_PLAYLIST_ID,
    name: 'Full Library',
    memberTrackIds: tracks.value.map((t) => t.id),
    loopTrackIds: [],
    isSystem: true
  }));

  const sidebarPlaylists = computed(() => [
    fullLibraryPlaylist.value,
    ...playlists.value
  ]);

  const userId = computed(() => {
    const raw = typeof userIdRef === 'function' ? userIdRef() : (userIdRef?.value ?? userIdRef);
    return raw ? String(raw) : '';
  });

  const trackById = computed(() => {
    const map = new Map();
    for (const t of tracks.value) map.set(t.id, t);
    return map;
  });

  const activePlaylist = computed(() => {
    if (isFullLibraryPlaylistId(activePlaylistId.value)) return fullLibraryPlaylist.value;
    return playlists.value.find((p) => p.id === activePlaylistId.value) || playlists.value[0] || null;
  });

  const myFocusLoopTrackIds = computed(() => findMyFocusPlaylist()?.loopTrackIds || []);

  const managingPlatformPlaylist = computed(() =>
    platformPlaylists.value.find((p) => p.id === managingPlatformId.value) || null
  );

  const playlistTracks = computed(() => {
    if (isFullLibraryActive.value) return tracks.value;
    const pl = activePlaylist.value;
    if (!pl) return [];
    if (pl.id === MY_FOCUS_PLAYLIST_ID || String(pl.name || '').toLowerCase() === 'my focus') {
      const hearted = new Set(pl.loopTrackIds || []);
      return tracks.value.filter((t) => hearted.has(t.id));
    }
    const memberSet = new Set(pl.memberTrackIds || []);
    return tracks.value.filter((t) => memberSet.has(t.id));
  });

  const libraryTracks = computed(() => {
    if (isFullLibraryActive.value || isMyFocusActive.value) return [];
    const pl = activePlaylist.value;
    const memberSet = new Set(pl?.memberTrackIds || []);
    return tracks.value.filter((t) => !memberSet.has(t.id));
  });

  const loopTrackIds = computed(() => {
    if (isFullLibraryActive.value || isMyFocusActive.value) return myFocusLoopTrackIds.value;
    return activePlaylist.value?.loopTrackIds || [];
  });

  const playbackPlaylistName = computed(() => {
    if (isFullLibraryActive.value || isMyFocusActive.value) return findMyFocusPlaylist()?.name || 'My focus';
    return activePlaylist.value?.name || 'Playlist';
  });

  const enabledTracks = computed(() => {
    if (isFullLibraryActive.value || isMyFocusActive.value) {
      const ids = myFocusLoopTrackIds.value;
      return ids.map((id) => trackById.value.get(id)).filter(Boolean);
    }
    const loopSet = new Set(loopTrackIds.value);
    const looped = playlistTracks.value.filter((t) => loopSet.has(t.id));
    return looped.length ? looped : playlistTracks.value;
  });

  const currentTrack = computed(() => trackById.value.get(currentTrackId.value) || null);

  const showToast = computed(() => Boolean(currentTrack.value && (playing.value || currentTime.value > 0)));

  const progressPct = computed(() => {
    if (!duration.value) return 0;
    return Math.min(100, (currentTime.value / duration.value) * 100);
  });

  const rebuildPlayOrder = () => {
    const ids = enabledTracks.value.map((t) => t.id);
    playOrderIds.value = shuffleEnabled.value ? shuffleArray(ids) : ids;
  };

  const getPlayPool = () => {
    if (!shuffleEnabled.value) return enabledTracks.value;
    return playOrderIds.value
      .map((id) => trackById.value.get(id))
      .filter(Boolean);
  };

  const sanitizePlaylists = (allIds) => {
    const valid = new Set(allIds);
    playlists.value = playlists.value.map((pl) => {
      const isMyFocus = pl.id === MY_FOCUS_PLAYLIST_ID || String(pl.name || '').toLowerCase() === 'my focus';
      const loopTrackIds = (pl.loopTrackIds || []).filter((id) => valid.has(id));
      const memberTrackIds = isMyFocus
        ? loopTrackIds
        : (pl.memberTrackIds || []).filter((id) => valid.has(id));
      return {
        ...pl,
        id: isMyFocus ? MY_FOCUS_PLAYLIST_ID : pl.id,
        name: isMyFocus ? 'My focus' : pl.name,
        memberTrackIds,
        loopTrackIds: isMyFocus ? loopTrackIds : (pl.loopTrackIds || []).filter((id) => valid.has(id))
      };
    });
    const hasMyFocus = playlists.value.some((p) => p.id === MY_FOCUS_PLAYLIST_ID);
    if (!hasMyFocus) {
      playlists.value = [
        { id: MY_FOCUS_PLAYLIST_ID, name: 'My focus', memberTrackIds: [], loopTrackIds: [] },
        ...playlists.value
      ];
    }
    if (!playlists.value.length) {
      const prefs = defaultPrefs();
      playlists.value = prefs.playlists;
      activePlaylistId.value = prefs.activePlaylistId;
    } else if (
      !isFullLibraryPlaylistId(activePlaylistId.value)
      && !playlists.value.some((p) => p.id === activePlaylistId.value)
    ) {
      activePlaylistId.value = FULL_LIBRARY_PLAYLIST_ID;
    }
    rebuildPlayOrder();
  };

  const applyPrefs = (raw) => {
    const prefs = migratePrefs(raw);
    playlists.value = prefs.playlists.map((p) => ({
      id: String(p.id),
      name: String(p.name || 'Playlist').slice(0, 80),
      memberTrackIds: [...(p.memberTrackIds || [])],
      loopTrackIds: [...(p.loopTrackIds || [])]
    }));
    activePlaylistId.value = prefs.activePlaylistId || playlists.value[0]?.id || '';
    loopMode.value = prefs.loopMode === 'single' ? 'single' : 'playlist';
    shuffleEnabled.value = prefs.shuffleEnabled === true;
    volume.value = Number.isFinite(prefs.volume) ? Math.min(1, Math.max(0, prefs.volume)) : 0.85;
    currentTrackId.value = prefs.currentTrackId || null;
    if (tracks.value.length) sanitizePlaylists(tracks.value.map((t) => t.id));
  };

  const persistPrefs = () => {
    savePrefs(userId.value, {
      version: 4,
      playlists: playlists.value.map((p) => ({
        id: p.id,
        name: p.name,
        memberTrackIds: [...p.memberTrackIds],
        loopTrackIds: [...p.loopTrackIds]
      })),
      activePlaylistId: isFullLibraryPlaylistId(activePlaylistId.value)
        ? FULL_LIBRARY_PLAYLIST_ID
        : activePlaylistId.value,
      loopMode: loopMode.value,
      shuffleEnabled: shuffleEnabled.value,
      volume: volume.value,
      currentTrackId: currentTrackId.value
    });
  };

  watch(userId, (id) => {
    applyPrefs(loadPrefs(id));
  }, { immediate: true });

  watch([playlists, activePlaylistId, loopMode, shuffleEnabled, volume, currentTrackId], persistPrefs, { deep: true });

  watch(enabledTracks, () => rebuildPlayOrder(), { deep: true });

  const attachAudioListeners = () => {
    const audio = getAudio();
    if (!audio || audio.__focusMusicBound) return;
    audio.__focusMusicBound = true;
    audio.addEventListener('timeupdate', () => {
      currentTime.value = audio.currentTime || 0;
      duration.value = Number.isFinite(audio.duration) ? audio.duration : duration.value;
    });
    audio.addEventListener('play', () => { playing.value = true; });
    audio.addEventListener('pause', () => { playing.value = false; });
    audio.addEventListener('ended', () => {
      playing.value = false;
      if (loopMode.value === 'single' && currentTrackId.value) {
        playTrack(currentTrackId.value);
        return;
      }
      playNext();
    });
    audio.addEventListener('loadedmetadata', () => {
      duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
    });
  };

  const fetchPlatformPlaylists = async () => {
    try {
      const res = await api.get('/focus-music/platform-playlists', { skipGlobalLoading: true });
      platformPlaylists.value = Array.isArray(res.data?.playlists) ? res.data.playlists : [];
      canManagePlatformPlaylists.value = Boolean(res.data?.canManage);
    } catch {
      platformPlaylists.value = [];
      canManagePlatformPlaylists.value = false;
    }
  };

  const fetchCatalog = async () => {
    loading.value = true;
    loadError.value = '';
    try {
      const res = await api.get('/focus-music/catalog', { skipGlobalLoading: true });
      const list = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
      tracks.value = list;
      canManagePlatformPlaylists.value = Boolean(res.data?.canManagePlatformPlaylists);
      applyPrefs(loadPrefs(userId.value));
      await fetchPlatformPlaylists();
    } catch (err) {
      loadError.value = err?.response?.data?.error?.message || 'Could not load focus music.';
      tracks.value = [];
    } finally {
      loading.value = false;
    }
  };

  const objectUrlByTrackId = new Map();

  const revokeObjectUrl = (trackId) => {
    const prev = objectUrlByTrackId.get(trackId);
    if (prev) {
      URL.revokeObjectURL(prev);
      objectUrlByTrackId.delete(trackId);
    }
  };

  const resolveStreamPath = (track) => {
    const raw = String(track?.streamUrl || '');
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    return raw.replace(/^\/api\//, '/');
  };

  const loadTrackSource = async (track) => {
    const path = resolveStreamPath(track);
    if (!path) return '';
    if (path.startsWith('http')) return path;
    revokeObjectUrl(track.id);
    const res = await api.get(path, { responseType: 'blob', skipGlobalLoading: true });
    const url = URL.createObjectURL(res.data);
    objectUrlByTrackId.set(track.id, url);
    return url;
  };

  const playTrack = async (trackId) => {
    const track = trackById.value.get(trackId);
    if (!track) return;
    attachAudioListeners();
    const audio = getAudio();
    if (!audio) return;
    currentTrackId.value = trackId;
    audio.volume = volume.value;
    try {
      const url = await loadTrackSource(track);
      if (audio.src !== url) audio.src = url;
      await audio.play();
      playing.value = true;
    } catch {
      playing.value = false;
    }
  };

  const togglePlay = async () => {
    attachAudioListeners();
    const audio = getAudio();
    if (!audio) return;
    if (!currentTrackId.value) {
      const pool = getPlayPool();
      if (pool[0]) await playTrack(pool[0].id);
      return;
    }
    if (playing.value) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        await playTrack(currentTrackId.value);
      }
    }
  };

  const pause = () => {
    getAudio()?.pause();
  };

  /** Fully stop playback and clear toast (prevents background streaming). */
  const endSession = () => {
    const audio = getAudio();
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* ignore */ }
      try { audio.removeAttribute('src'); audio.load(); } catch { /* ignore */ }
    }
    playing.value = false;
    currentTrackId.value = null;
    currentTime.value = 0;
    duration.value = 0;
    prefs.value = { ...prefs.value, currentTrackId: null };
    persistPrefs();
  };

  const playNext = async () => {
    const pool = getPlayPool();
    if (!pool.length) return;
    const idx = pool.findIndex((t) => t.id === currentTrackId.value);
    const next = pool[(idx + 1) % pool.length];
    await playTrack(next.id);
  };

  const playPrev = async () => {
    const pool = getPlayPool();
    if (!pool.length) return;
    const idx = pool.findIndex((t) => t.id === currentTrackId.value);
    const prev = pool[(idx - 1 + pool.length) % pool.length];
    await playTrack(prev.id);
  };

  const updateActivePlaylist = (fn) => {
    const pl = activePlaylist.value;
    if (!pl) return;
    const idx = playlists.value.findIndex((p) => p.id === pl.id);
    if (idx < 0) return;
    const next = fn({ ...playlists.value[idx] });
    playlists.value = playlists.value.map((p, i) => (i === idx ? next : p));
  };

  const updateMyFocusPlaylist = (fn) => {
    const myFocus = findMyFocusPlaylist();
    if (!myFocus) return;
    const idx = playlists.value.findIndex((p) => p.id === myFocus.id);
    if (idx < 0) return;
    const next = fn({ ...playlists.value[idx] });
    const loopTrackIds = [...(next.loopTrackIds || [])];
    playlists.value = playlists.value.map((p, i) =>
      i === idx ? { ...next, loopTrackIds, memberTrackIds: loopTrackIds } : p
    );
  };

  const toggleLoopTrack = (trackId) => {
    if (isFullLibraryActive.value || isMyFocusActive.value) {
      updateMyFocusPlaylist((pl) => {
        const set = new Set(pl.loopTrackIds || []);
        if (set.has(trackId)) set.delete(trackId);
        else set.add(trackId);
        return { ...pl, loopTrackIds: Array.from(set) };
      });
      return;
    }
    updateActivePlaylist((pl) => {
      if (!(pl.memberTrackIds || []).includes(trackId)) return pl;
      const set = new Set(pl.loopTrackIds || []);
      if (set.has(trackId)) {
        if (set.size <= 1 && (pl.loopTrackIds || []).length <= 1) return pl;
        set.delete(trackId);
      } else {
        set.add(trackId);
      }
      return { ...pl, loopTrackIds: Array.from(set) };
    });
  };

  const addTrackToPlaylist = (trackId, playlistId = activePlaylistId.value) => {
    if (isFullLibraryPlaylistId(playlistId)) {
      updateMyFocusPlaylist((pl) => {
        const set = new Set(pl.loopTrackIds || []);
        set.add(trackId);
        return { ...pl, loopTrackIds: Array.from(set) };
      });
      return;
    }
    const idx = playlists.value.findIndex((p) => p.id === playlistId);
    if (idx < 0) return;
    const pl = playlists.value[idx];
    if ((pl.memberTrackIds || []).includes(trackId)) return;
    const memberTrackIds = [...(pl.memberTrackIds || []), trackId];
    const loopTrackIds = [...(pl.loopTrackIds || []), trackId];
    playlists.value = playlists.value.map((p, i) =>
      i === idx ? { ...p, memberTrackIds, loopTrackIds } : p
    );
  };

  const addTracksToPlaylist = (trackIds, playlistId = activePlaylistId.value) => {
    for (const trackId of trackIds || []) addTrackToPlaylist(trackId, playlistId);
  };

  const removeTrackFromPlaylist = (trackId) => {
    if (isFullLibraryActive.value || isMyFocusActive.value) {
      updateMyFocusPlaylist((pl) => ({
        ...pl,
        loopTrackIds: (pl.loopTrackIds || []).filter((id) => id !== trackId)
      }));
    } else {
      updateActivePlaylist((pl) => ({
        ...pl,
        memberTrackIds: (pl.memberTrackIds || []).filter((id) => id !== trackId),
        loopTrackIds: (pl.loopTrackIds || []).filter((id) => id !== trackId)
      }));
    }
    if (currentTrackId.value === trackId) {
      currentTrackId.value = enabledTracks.value[0]?.id || null;
      getAudio()?.pause();
      playing.value = false;
    }
  };

  const selectPlaylist = (playlistId) => {
    if (isFullLibraryPlaylistId(playlistId) || playlists.value.some((p) => p.id === playlistId)) {
      activePlaylistId.value = playlistId;
      managingPlatformId.value = null;
      showLibrary.value = false;
    }
  };

  const createPlaylist = (name) => {
    let label = String(name || '').trim();
    if (!label && typeof window !== 'undefined') {
      const entered = window.prompt('Playlist name', 'New playlist');
      if (entered === null) return null;
      label = entered.trim();
    }
    const id = newPlaylistId();
    const finalName = label.slice(0, 80) || 'New playlist';
    playlists.value = [...playlists.value, { id, name: finalName, memberTrackIds: [], loopTrackIds: [] }];
    activePlaylistId.value = id;
    managingPlatformId.value = null;
    showLibrary.value = true;
    return id;
  };

  const renamePlaylist = (playlistId, name) => {
    const label = String(name || '').trim().slice(0, 80);
    if (!label) return;
    playlists.value = playlists.value.map((p) =>
      p.id === playlistId ? { ...p, name: label } : p
    );
  };

  const deletePlaylist = (playlistId) => {
    if (playlistId === MY_FOCUS_PLAYLIST_ID || isFullLibraryPlaylistId(playlistId)) return;
    if (playlists.value.length <= 1) return;
    playlists.value = playlists.value.filter((p) => p.id !== playlistId);
    if (activePlaylistId.value === playlistId) {
      activePlaylistId.value = FULL_LIBRARY_PLAYLIST_ID;
    }
  };

  const setLoopMode = (mode) => {
    loopMode.value = mode === 'single' ? 'single' : 'playlist';
  };

  const setShuffleEnabled = (enabled) => {
    shuffleEnabled.value = Boolean(enabled);
    rebuildPlayOrder();
  };

  const toggleShuffle = () => {
    setShuffleEnabled(!shuffleEnabled.value);
  };

  const setVolume = (v) => {
    volume.value = Math.min(1, Math.max(0, Number(v) || 0));
    const audio = getAudio();
    if (audio) audio.volume = volume.value;
  };

  const togglePlatformExpand = (platformId) => {
    const id = Number(platformId);
    const set = new Set(expandedPlatformIds.value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    expandedPlatformIds.value = Array.from(set);
  };

  const isPlatformExpanded = (platformId) => expandedPlatformIds.value.includes(Number(platformId));

  const importPlatformPlaylist = (platformPlaylist, { targetPlaylistId = null } = {}) => {
    const trackIds = platformPlaylist?.trackIds || platformPlaylist?.tracks?.map((t) => t.id) || [];
    if (!trackIds.length) return;
    const targetId = targetPlaylistId || (
      isFullLibraryActive.value || isMyFocusActive.value
        ? MY_FOCUS_PLAYLIST_ID
        : activePlaylistId.value
    );
    if (targetId === MY_FOCUS_PLAYLIST_ID) {
      updateMyFocusPlaylist((pl) => {
        const set = new Set([...(pl.loopTrackIds || []), ...trackIds]);
        return { ...pl, loopTrackIds: Array.from(set) };
      });
      return;
    }
    addTracksToPlaylist(trackIds, targetId);
    selectPlaylist(targetId);
  };

  const copyPlatformPlaylist = (platformPlaylist) => {
    const trackIds = platformPlaylist?.trackIds || platformPlaylist?.tracks?.map((t) => t.id) || [];
    if (!trackIds.length) return null;
    const unique = [...new Set(trackIds)];
    const id = newPlaylistId();
    const name = String(platformPlaylist?.name || 'Playlist').slice(0, 80);
    playlists.value = [
      ...playlists.value,
      { id, name, memberTrackIds: [...unique], loopTrackIds: [...unique] }
    ];
    activePlaylistId.value = id;
    managingPlatformId.value = null;
    showLibrary.value = false;
    return id;
  };

  const createPlatformPlaylist = async (name) => {
    if (!canManagePlatformPlaylists.value) return null;
    let label = String(name || '').trim();
    if (!label && typeof window !== 'undefined') {
      const entered = window.prompt('Platform playlist name', 'New platform playlist');
      if (entered === null) return null;
      label = entered.trim();
    }
    const res = await api.post('/focus-music/platform-playlists', { name: label || 'Platform playlist' });
    const pl = res.data?.playlist;
    if (pl) {
      platformPlaylists.value = [...platformPlaylists.value, pl];
      managingPlatformId.value = pl.id;
      expandedPlatformIds.value = [...expandedPlatformIds.value, pl.id];
    }
    return pl;
  };

  const renamePlatformPlaylist = async (platformId, name) => {
    if (!canManagePlatformPlaylists.value) return;
    const label = String(name || '').trim();
    if (!label) return;
    const res = await api.put(`/focus-music/platform-playlists/${platformId}`, { name: label });
    const updated = res.data?.playlist;
    if (updated) {
      platformPlaylists.value = platformPlaylists.value.map((p) => (p.id === updated.id ? updated : p));
    }
  };

  const deletePlatformPlaylist = async (platformId) => {
    if (!canManagePlatformPlaylists.value) return;
    await api.delete(`/focus-music/platform-playlists/${platformId}`);
    platformPlaylists.value = platformPlaylists.value.filter((p) => p.id !== Number(platformId));
    if (managingPlatformId.value === Number(platformId)) managingPlatformId.value = null;
    expandedPlatformIds.value = expandedPlatformIds.value.filter((id) => id !== Number(platformId));
  };

  const addTrackToPlatformPlaylist = async (platformId, trackId) => {
    if (!canManagePlatformPlaylists.value) return;
    const res = await api.post(`/focus-music/platform-playlists/${platformId}/tracks`, { trackId });
    const updated = res.data?.playlist;
    if (updated) {
      platformPlaylists.value = platformPlaylists.value.map((p) => (p.id === updated.id ? updated : p));
    }
  };

  const removeTrackFromPlatformPlaylist = async (platformId, trackId) => {
    if (!canManagePlatformPlaylists.value) return;
    const res = await api.delete(`/focus-music/platform-playlists/${platformId}/tracks/${encodeURIComponent(trackId)}`);
    const updated = res.data?.playlist;
    if (updated) {
      platformPlaylists.value = platformPlaylists.value.map((p) => (p.id === updated.id ? updated : p));
    }
  };

  const startManagingPlatform = (platformId) => {
    managingPlatformId.value = Number(platformId);
    showLibrary.value = true;
    if (!isPlatformExpanded(platformId)) togglePlatformExpand(platformId);
  };

  const stopManagingPlatform = () => {
    managingPlatformId.value = null;
  };

  const openModal = async () => {
    modalOpen.value = true;
    if (!tracks.value.length) await fetchCatalog();
    else await fetchPlatformPlaylists();
  };

  const closeModal = () => {
    modalOpen.value = false;
    showLibrary.value = false;
    managingPlatformId.value = null;
  };

  const startLooping = async () => {
    rebuildPlayOrder();
    const pool = getPlayPool();
    if (!pool[0]) return;
    await playTrack(pool[0].id);
    closeModal();
  };

  const toggleLibrary = () => {
    showLibrary.value = !showLibrary.value;
  };

  return {
    tracks,
    loading,
    loadError,
    modalOpen,
    playing,
    currentTrack,
    currentTrackId,
    currentTime,
    duration,
    playlists,
    sidebarPlaylists,
    activePlaylist,
    activePlaylistId,
    fullLibraryPlaylistId: FULL_LIBRARY_PLAYLIST_ID,
    myFocusPlaylistId: MY_FOCUS_PLAYLIST_ID,
    isFullLibraryActive,
    isMyFocusActive,
    playbackPlaylistName,
    playlistTracks,
    libraryTracks,
    loopTrackIds,
    enabledTracks,
    loopMode,
    shuffleEnabled,
    volume,
    showToast,
    showLibrary,
    platformPlaylists,
    canManagePlatformPlaylists,
    managingPlatformId,
    managingPlatformPlaylist,
    expandedPlatformIds,
    progressPct,
    formatTime,
    fetchCatalog,
    fetchPlatformPlaylists,
    openModal,
    closeModal,
    playTrack,
    togglePlay,
    pause,
    endSession,
    isPlaying: playing,
    playNext,
    playPrev,
    toggleLoopTrack,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    selectPlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    setLoopMode,
    setShuffleEnabled,
    toggleShuffle,
    setVolume,
    startLooping,
    toggleLibrary,
    togglePlatformExpand,
    isPlatformExpanded,
    importPlatformPlaylist,
    copyPlatformPlaylist,
    createPlatformPlaylist,
    renamePlatformPlaylist,
    deletePlatformPlaylist,
    addTrackToPlatformPlaylist,
    removeTrackFromPlatformPlaylist,
    startManagingPlatform,
    stopManagingPlatform
  };
}
