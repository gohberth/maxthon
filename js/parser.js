/**
 * parser.js - M3U/M3U8 playlist parser
 * StreamVault IPTV Player
 */

const Parser = (() => {

  /**
   * Parse M3U text content into an array of channel objects
   */
  function parseM3U(text) {
    const channels = [];
    const lines = text.split(/\r?\n/);

    if (!lines[0].trim().startsWith('#EXTM3U')) {
      // Try to just treat each line as a URL
      for (const line of lines) {
        const url = line.trim();
        if (url && !url.startsWith('#') && isValidUrl(url)) {
          channels.push(makeChannel({ url }));
        }
      }
      return channels;
    }

    let currentMeta = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentMeta = parseExtInf(line);
      } else if (line.startsWith('#KODIPROP:')) {
        if (!currentMeta) currentMeta = { drm: {} };
        if (!currentMeta.drm) currentMeta.drm = {};
        
        const prop = line.replace('#KODIPROP:', '');
        const [key, val] = prop.split('=');
        if (key && val) {
          if (key.includes('license_type')) currentMeta.drm.licenseType = val;
          if (key.includes('license_key'))  currentMeta.drm.licenseKey  = val;
        }
      } else if (line.startsWith('#') ) {
        continue;
      } else if (line && (isValidUrl(line) || isLocalPath(line))) {
        const channel = makeChannel({ url: line, ...currentMeta });
        channels.push(channel);
        currentMeta = null;
      }
    }

    return channels;
  }

  /**
   * Parse an #EXTINF line into metadata
   * Example: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
   */
  function parseExtInf(line) {
    const meta = {};

    // Duration
    const durationMatch = line.match(/^#EXTINF:(-?\d+(?:\.\d+)?)/);
    if (durationMatch) meta.duration = parseFloat(durationMatch[1]);

    // Name (after the last comma)
    const commaIdx = line.lastIndexOf(',');
    if (commaIdx >= 0) {
      meta.name = line.slice(commaIdx + 1).trim();
    }

    // tvg-id
    meta.tvgId = extractAttr(line, 'tvg-id');

    // tvg-name (can override if name is empty)
    const tvgName = extractAttr(line, 'tvg-name');
    if (tvgName && !meta.name) meta.name = tvgName;
    if (!meta.name && tvgName) meta.name = tvgName;

    // tvg-logo
    meta.logo = extractAttr(line, 'tvg-logo') || extractAttr(line, 'logo') || '';

    // group-title
    meta.group = extractAttr(line, 'group-title') || extractAttr(line, 'group') || 'Uncategorized';

    // tvg-language
    meta.language = extractAttr(line, 'tvg-language') || '';

    // tvg-country
    meta.country = extractAttr(line, 'tvg-country') || '';

    return meta;
  }

  /**
   * Extract a quoted or unquoted attribute from a string
   */
  function extractAttr(str, attr) {
    // Try quoted value
    const quotedRx = new RegExp(`${attr}="([^"]*)"`, 'i');
    const quotedMatch = str.match(quotedRx);
    if (quotedMatch) return quotedMatch[1].trim();

    // Try unquoted value
    const unquotedRx = new RegExp(`${attr}=([^\\s,]+)`, 'i');
    const unquotedMatch = str.match(unquotedRx);
    if (unquotedMatch) return unquotedMatch[1].trim();

    return '';
  }

  /**
   * Normalize and create a channel object
   */
  function makeChannel({ url, name, logo, group, duration, tvgId, language, country, drm }) {
    const id = generateId(url);
    return {
      id,
      url:      url || '',
      name:     name || extractNameFromUrl(url) || 'Unknown Channel',
      logo:     logo || '',
      group:    group || 'Uncategorized',
      duration: duration || -1,
      tvgId:    tvgId || '',
      language: language || '',
      country:  country || '',
      type:     detectStreamType(url),
      drm:      drm || null,
    };
  }

  /**
   * Detect the stream type from a URL
   */
  function detectStreamType(url) {
    if (!url) return 'unknown';
    const u = url.toLowerCase().split('?')[0];
    if (u.endsWith('.m3u8') || u.includes('.m3u8')) return 'hls';
    if (u.endsWith('.mpd')  || u.includes('.mpd'))  return 'dash';
    if (u.endsWith('.mp4'))  return 'mp4';
    if (u.endsWith('.mkv'))  return 'mkv';
    if (u.endsWith('.webm')) return 'webm';
    if (u.endsWith('.avi'))  return 'avi';
    if (u.endsWith('.ts'))   return 'ts';
    if (u.endsWith('.m3u'))  return 'hls'; // treat as HLS
    // Check if URL contains stream indicators
    if (u.includes('/live/') || u.includes('/stream/') || u.includes(':8080') || u.includes(':1935')) return 'hls';
    return 'hls'; // default fallback for unknown URLs
  }

  /**
   * Extract unique categories/groups from channels
   */
  function getGroups(channels) {
    const groups = [...new Set(channels.map(c => c.group || 'Uncategorized'))];
    return groups.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Filter channels by query and optionally group
   */
  function filterChannels(channels, query = '', group = 'all') {
    let result = channels;

    if (group && group !== 'all') {
      result = result.filter(c => c.group === group);
    }

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.group && c.group.toLowerCase().includes(q)) ||
        (c.tvgId && c.tvgId.toLowerCase().includes(q))
      );
    }

    return result;
  }

  // --- Helpers ---

  function isValidUrl(str) {
    try { new URL(str); return true; } catch { return false; }
  }

  function isLocalPath(str) {
    return /^[a-zA-Z]:\\/.test(str) || str.startsWith('/');
  }

  function extractNameFromUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      return last.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') || u.hostname;
    } catch {
      return url.split('/').pop().replace(/\.[^.]+$/, '') || url;
    }
  }

  function generateId(url) {
    let hash = 0;
    const str = (url || '') + Date.now().toString(36);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Fetch M3U from a remote URL (with CORS handling)
   * Handles Dropbox, Google Drive, and generic URLs
   */
  async function fetchPlaylist(url) {
    // Convert Dropbox share links to direct CDN download links (better CORS)
    const directUrl = transformToDirectUrl(url);

    // Build a list of URLs to try in order
    const urlsToTry = directUrl !== url
      ? [directUrl, url]  // try CDN version first for Dropbox
      : [url];

    // Build CORS proxy list for each URL to try.
    // The local server /proxy endpoint is tried first — it has no CORS restrictions.
    const attempts = [];
    for (const u of urlsToTry) {
      attempts.push({ label: 'local-proxy',   url: `/proxy?url=${encodeURIComponent(u)}` });
      attempts.push({ label: 'direct',        url: u });
      attempts.push({ label: 'corsproxy.io',  url: `https://corsproxy.io/?${encodeURIComponent(u)}` });
      attempts.push({ label: 'allorigins',    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` });
      attempts.push({ label: 'thingproxy',    url: `https://thingproxy.freeboard.io/fetch/${u}` });
    }

    for (const attempt of attempts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const res = await fetch(attempt.url, {
          signal: controller.signal,
          headers: {
            'Accept': 'text/plain,application/octet-stream,*/*',
          },
        });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const text = await res.text();

        // Validate it looks like an M3U playlist or plain text lines
        if (text && (text.includes('#EXTM3U') || text.includes('#EXTINF') || text.trim().length > 10)) {
          console.log(`[Parser] Fetched via: ${attempt.label} — ${text.split('\n').length} lines`);
          return text;
        }
      } catch (e) {
        // timeout or network error — try next
        continue;
      }
    }

    throw new Error(`Could not fetch playlist. Make sure the server.py is running, or download the file and import it directly.`);
  }

  /**
   * Transform Dropbox / Google Drive share URLs into direct download URLs
   */
  function transformToDirectUrl(url) {
    try {
      const u = new URL(url);

      // Dropbox: www.dropbox.com → dl.dropboxusercontent.com
      if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
        // Force dl=1 (direct download) and switch to CDN domain
        u.searchParams.set('dl', '1');
        return url
          .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
          .replace('dropbox.com', 'dl.dropboxusercontent.com');
      }

      // Google Drive share links → direct download
      const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      if (gdMatch) {
        return `https://drive.google.com/uc?export=download&id=${gdMatch[1]}`;
      }

      return url;
    } catch {
      return url;
    }
  }

  return {
    parseM3U,
    detectStreamType,
    getGroups,
    filterChannels,
    fetchPlaylist,
    makeChannel,
  };
})();
