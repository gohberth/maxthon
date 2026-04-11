/**
 * storage.js - LocalStorage persistence manager
 * StreamVault IPTV Player
 */

const Storage = (() => {
  const KEYS = {
    PLAYLISTS:   'sv_playlists',
    FAVORITES:   'sv_favorites',
    RECENT:      'sv_recent',
    SETTINGS:    'sv_settings',
    LOCAL_FILES: 'sv_local_files',
  };

  const MAX_RECENT = 30;

  // --- Generic helpers ---
  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('Storage write failed:', e); return false; }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  // --- Playlists ---
  function getPlaylists() {
    return get(KEYS.PLAYLISTS, []);
  }

  function savePlaylist(playlist) {
    // playlist = { id, name, channels: [], addedAt, source }
    const playlists = getPlaylists();
    const idx = playlists.findIndex(p => p.id === playlist.id);
    if (idx >= 0) playlists[idx] = playlist;
    else playlists.push(playlist);
    set(KEYS.PLAYLISTS, playlists);
  }

  function deletePlaylist(id) {
    const playlists = getPlaylists().filter(p => p.id !== id);
    set(KEYS.PLAYLISTS, playlists);
  }

  function clearPlaylists() { remove(KEYS.PLAYLISTS); }

  // --- Favorites ---
  function getFavorites() { return get(KEYS.FAVORITES, []); }

  function addFavorite(channel) {
    const favs = getFavorites();
    if (!favs.find(f => f.url === channel.url)) {
      favs.unshift({ ...channel, favoritedAt: Date.now() });
      set(KEYS.FAVORITES, favs);
    }
  }

  function removeFavorite(url) {
    set(KEYS.FAVORITES, getFavorites().filter(f => f.url !== url));
  }

  function isFavorite(url) {
    return getFavorites().some(f => f.url === url);
  }

  function clearFavorites() { remove(KEYS.FAVORITES); }

  // --- Recent ---
  function getRecent() { return get(KEYS.RECENT, []); }

  function addRecent(channel) {
    let recent = getRecent().filter(r => r.url !== channel.url);
    recent.unshift({ ...channel, watchedAt: Date.now() });
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    set(KEYS.RECENT, recent);
  }

  function clearRecent() { remove(KEYS.RECENT); }

  // --- Settings ---
  const DEFAULT_SETTINGS = {
    autoPlay:        true,
    rememberVolume:  true,
    volume:          1.0,
    quality:         'auto',
    showNumbers:     false,
    viewMode:        'list', // 'list' | 'grid'
    proxyBaseUrl:    'https://akxel001-iptv-proxy.hf.space',     // Default production proxy URL
  };

  function getSettings() {
    return { ...DEFAULT_SETTINGS, ...get(KEYS.SETTINGS, {}) };
  }

  function saveSetting(key, value) {
    const s = getSettings();
    s[key] = value;
    set(KEYS.SETTINGS, s);
  }

  function clearAll() {
    Object.values(KEYS).forEach(k => remove(k));
  }

  return {
    getPlaylists, savePlaylist, deletePlaylist, clearPlaylists,
    getFavorites, addFavorite, removeFavorite, isFavorite, clearFavorites,
    getRecent, addRecent, clearRecent,
    getSettings, saveSetting, clearAll,
  };
})();
