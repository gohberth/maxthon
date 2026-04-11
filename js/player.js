/**
 * player.js - Video Player Engine
 * Supports HLS (hls.js), DASH (dash.js), and native HTML5
 * StreamVault IPTV Player
 */

const Player = (() => {
  const video   = document.getElementById('videoPlayer');
  let hlsInstance  = null;
  let dashInstance = null;
  let currentChannel = null;
  let hideControlsTimer = null;
  let isDraggingProgress = false;
  let isSeeking = false;

  const els = {
    videoWrapper:      document.getElementById('videoWrapper'),
    playerWelcome:     document.getElementById('playerWelcome'),
    bufferingSpinner:  document.getElementById('bufferingSpinner'),
    playerError:       document.getElementById('playerError'),
    playerErrorMsg:    document.getElementById('playerErrorMsg'),
    playerRetryBtn:    document.getElementById('playerRetryBtn'),
    controlsOverlay:   document.getElementById('controlsOverlay'),
    playPauseBtn:      document.getElementById('playPauseBtn'),
    muteBtn:           document.getElementById('muteBtn'),
    fullscreenBtn:     document.getElementById('fullscreenBtn'),
    pipBtn:            document.getElementById('pipBtn'),
    prevChannelBtn:    document.getElementById('prevChannelBtn'),
    nextChannelBtn:    document.getElementById('nextChannelBtn'),
    volumeSlider:      document.getElementById('volumeSlider'),
    progressBar:       document.getElementById('progressBar'),
    progressPlayed:    document.getElementById('progressPlayed'),
    progressBuffered:  document.getElementById('progressBuffered'),
    progressThumb:     document.getElementById('progressThumb'),
    progressContainer: document.getElementById('progressContainer'),
    currentTime:       document.getElementById('currentTime'),
    totalTime:         document.getElementById('totalTime'),
    nowPlayingTitle:   document.getElementById('nowPlayingTitle'),
    nowPlayingGroup:   document.getElementById('nowPlayingGroup'),
    channelLogoSmall:  document.getElementById('channelLogoSmall'),
    favoriteBtn:       document.getElementById('favoriteBtn'),
    qualityBtn:        document.getElementById('qualityBtn'),
    subtitleBtn:       document.getElementById('subtitleBtn'),
    pipBtn:            document.getElementById('pipBtn'),
    audioOnlyIndicator: document.getElementById('audioOnlyIndicator'),
    unmuteOverlay:     document.getElementById('unmuteOverlay'),
  };

  // External callbacks
  let onNext   = () => {};
  let onPrev   = () => {};
  let onToggleFav = () => {};

  function setCallbacks({ next, prev, toggleFav }) {
    if (next) onNext = next;
    if (prev) onPrev = prev;
    if (toggleFav) onToggleFav = toggleFav;
  }

  /* ─────────────────────────────────────────────
     Load a channel / stream
  ───────────────────────────────────────────── */
  function load(channel) {
    currentChannel = channel;
    const { url, type, name, logo, group } = channel;

    // Reset error state
    hideError();
    showBuffering(true);

    // Destroy previous instances
    destroyHls();
    destroyDash();

    // Update UI
    els.nowPlayingTitle.textContent = name || 'Unknown';
    els.nowPlayingGroup.textContent = group || '';

    if (logo) {
      els.channelLogoSmall.src = logo;
      els.channelLogoSmall.classList.remove('hidden');
      els.channelLogoSmall.onerror = () => els.channelLogoSmall.classList.add('hidden');
    } else {
      els.channelLogoSmall.classList.add('hidden');
    }

    // Update favorite button
    updateFavBtn(Storage.isFavorite(url));

    // Show video wrapper, hide welcome
    els.playerWelcome.classList.add('hidden');
    els.videoWrapper.classList.remove('hidden');

    // Determine how to play
    const t = type || Parser.detectStreamType(url);

    if (t === 'hls' || url.includes('.m3u8') || url.includes('m3u8')) {
      loadHLS(url);
    } else if (t === 'dash' || url.endsWith('.mpd')) {
      loadDASH(url);
    } else {
      // Native HTML5 playback (mp4, webm, mkv, avi, ts, blob:)
      loadNative(url, t);
    }
  }

  function loadHLS(url) {
    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        populateQualityLevels();
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // If it's a network error and not already proxied, try proxying
              if (!url.includes('/proxy?url=')) {
                console.warn('[Player] HLS Network error, retrying with proxy...');
                destroyHls();
                setTimeout(() => loadHLS(getProxiedUrl(url)), 500);
                return;
              }

              // If manifest fails to parse, it might be a direct media stream (AAC, MP3, MP4, TS)
              if (data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
                  data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                console.warn('[Player] HLS manifest error, attempting native fallback...', data.details);
                destroyHls();
                setTimeout(() => {
                  loadNative(url, 'fallback');
                }, 100);
              } else {
                hlsInstance.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              showError('Stream could not be loaded. Check the URL and try again.');
              break;
          }
        }
      });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      loadNative(url, 'hls');
    } else {
      showError('HLS is not supported in your browser.');
    }
  }

  function loadDASH(url) {
    if (typeof dashjs !== 'undefined') {
      dashInstance = dashjs.MediaPlayer().create();

      // Configure ClearKey if metadata is present (Movies Now, etc)
      if (currentChannel && currentChannel.drm && currentChannel.drm.licenseType === 'org.w3.clearkey') {
        const licenseKey = currentChannel.drm.licenseKey;
        if (licenseKey && licenseKey.includes(':')) {
          const [kid, key] = licenseKey.split(':').map(s => s.trim());
          dashInstance.setProtectionData({
            "org.w3.clearkey": {
              "clearkeys": { [kid]: key }
            }
          });
          console.log('[Player] Configured ClearKey DRM for:', currentChannel.name);
        }
      }

      dashInstance.initialize(video, url, true);
      dashInstance.updateSettings({
        streaming: { abr: { autoSwitchBitrate: { video: true } } }
      });
    } else {
      // Fallback to native
      loadNative(url, 'dash');
    }
  }

  function loadNative(url, type) {
    // Show spinner
    showBuffering(true);
    hideAudioOnly();
    hideUnmuteOverlay();

    // Clean up any existing blob URL from MSE
    video.removeAttribute('src');
    video.load();

    // For local file blob URLs or direct MP4/WebM/AAC
    video.src = url;
    video.load();

    // Try to play
    video.play().then(() => {
      // Autoplay worked
      checkAudioOnly();
    }).catch(e => {
      console.warn('[Player] Native play failed/blocked:', e);
      // If blocked, shows the unmute overlay if it's not already playing
      if (video.paused) {
        showUnmuteOverlay();
      }
    });

    // Explicitly unmute if setting says so
    const s = Storage.getSettings();
    if (s.rememberVolume) {
      video.muted = false;
      if (s.volume) video.volume = s.volume;
    }

    // MKV warning (may not be supported)
    if (type === 'mkv') {
      UI.toast('MKV support depends on your browser. Chrome usually handles it.', 'info');
    }
  }

  function loadLocalFile(file) {
    const url = URL.createObjectURL(file);
    const channel = Parser.makeChannel({
      url,
      name: file.name.replace(/\.[^.]+$/, ''),
      group: 'Local Files',
      type: 'local',
    });
    channel.isLocal = true;
    channel.mimeType = file.type;
    load(channel);
  }

  /* ─────────────────────────────────────────────
     Quality Levels
  ───────────────────────────────────────────── */
  function populateQualityLevels() {
    if (!hlsInstance) return;
    const levels = hlsInstance.levels || [];
    if (levels.length > 1) {
      els.qualityBtn.querySelector('span').textContent = 'AUTO';
    }
  }

  /* ─────────────────────────────────────────────
     Video Event Listeners
  ───────────────────────────────────────────── */
  function initVideoEvents() {
    video.addEventListener('play',     () => updatePlayButton(true));
    video.addEventListener('pause',    () => updatePlayButton(false));
    video.addEventListener('ended',    onEnded);
    video.addEventListener('waiting',  () => showBuffering(true));
    video.addEventListener('playing', () => {
      showBuffering(false);
      hideError();
      checkAudioOnly();
    });

    video.addEventListener('loadedmetadata', () => {
      checkAudioOnly();
    });

    video.addEventListener('canplay',  () => showBuffering(false));
    video.addEventListener('error',    onVideoError);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress',   onBufferUpdate);
    video.addEventListener('durationchange', () => {
      if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
        els.totalTime.textContent = formatTime(video.duration);
      } else {
        els.totalTime.textContent = 'Live';
      }
    });
    video.addEventListener('volumechange', onVolumeChange);
  }

  /* ─────────────────────────────────────────────
     Audio-only & Unmute Logic
  ───────────────────────────────────────────── */
  function checkAudioOnly() {
    // If it's a direct audio stream (AAC, MP3) it often has no video track 
    // or videoHeight/Width is 0. 
    if (video.readyState >= 1) { // METADATA_LOADED
      const isAudio = video.videoHeight === 0 || video.videoWidth === 0;
      if (isAudio && video.src && !video.src.includes('blob:')) {
        showAudioOnly();
      } else {
        hideAudioOnly();
      }
    }
  }

  function showAudioOnly() {
    if (els.audioOnlyIndicator) els.audioOnlyIndicator.classList.remove('hidden');
  }

  function hideAudioOnly() {
    if (els.audioOnlyIndicator) els.audioOnlyIndicator.classList.add('hidden');
  }

  function showUnmuteOverlay() {
    if (els.unmuteOverlay) {
      els.unmuteOverlay.classList.remove('hidden');
      const btn = els.unmuteOverlay.querySelector('.btn-unmute');
      if (btn) {
        btn.onclick = (e) => {
          e.stopPropagation();
          video.muted = false;
          video.play().catch(() => {});
          hideUnmuteOverlay();
        };
      }
    }
  }

  function hideUnmuteOverlay() {
    if (els.unmuteOverlay) els.unmuteOverlay.classList.add('hidden');
  }

  function onEnded() {
    updatePlayButton(false);
    onNext();
  }

  function onVideoError() {
    const code = video.error ? video.error.code : 0;
    const msgs = {
      1: 'Playback aborted.',
      2: 'Network error while loading.',
      3: 'Decoding error. Format may not be supported.',
      4: 'Format not supported by your browser.',
    };
    
    // Auto-retry with proxy on network error if not already proxied
    if (code === 2 && currentChannel && !currentChannel.url.includes('/proxy?url=')) {
      console.warn('[Player] Native network error, retrying with proxy...');
      const proxiedChannel = { ...currentChannel, url: getProxiedUrl(currentChannel.url) };
      setTimeout(() => load(proxiedChannel), 1000);
      return;
    }

    showError(msgs[code] || 'An unknown playback error occurred.');
  }

  function onTimeUpdate() {
    if (isDraggingProgress) return;
    const dur = video.duration;
    const cur = video.currentTime;

    els.currentTime.textContent = formatTime(cur);

    if (dur && !isNaN(dur) && isFinite(dur)) {
      const pct = (cur / dur) * 100;
      els.progressPlayed.style.width = pct + '%';
      els.progressThumb.style.left   = pct + '%';
    }
  }

  function onBufferUpdate() {
    const dur = video.duration;
    if (!dur || !isFinite(dur)) return;
    const buffered = video.buffered;
    if (buffered.length > 0) {
      const pct = (buffered.end(buffered.length - 1) / dur) * 100;
      els.progressBuffered.style.width = pct + '%';
    }
  }

  function onVolumeChange() {
    const muted = video.muted || video.volume === 0;
    const icon = muted ? 'volume-x' : (video.volume < 0.5 ? 'volume-1' : 'volume-2');
    updateIconBtn(els.muteBtn, icon);
    els.volumeSlider.value = Math.round((video.muted ? 0 : video.volume) * 100);

    if (Storage.getSettings().rememberVolume) {
      Storage.saveSetting('volume', video.volume);
    }
  }

  /* ─────────────────────────────────────────────
     Controls
  ───────────────────────────────────────────── */
  function initControls() {
    // Play/Pause button
    els.playPauseBtn.addEventListener('click', togglePlay);

    // Mute
    els.muteBtn.addEventListener('click', toggleMute);

    // Volume Slider
    els.volumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value) / 100;
      video.volume = val;
      video.muted = val === 0;
    });

    // Fullscreen
    els.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // PiP
    els.pipBtn.addEventListener('click', togglePiP);

    // Prev / Next
    els.prevChannelBtn.addEventListener('click', onPrev);
    els.nextChannelBtn.addEventListener('click', onNext);

    // Favorite
    els.favoriteBtn.addEventListener('click', () => {
      if (currentChannel) onToggleFav(currentChannel);
    });

    // Progress bar click/drag
    els.progressContainer.addEventListener('mousedown', (e) => {
      isDraggingProgress = true;
      seekTo(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (isDraggingProgress) seekTo(e);
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingProgress) isDraggingProgress = false;
    });

    // Touch support for progress bar
    els.progressContainer.addEventListener('touchstart', (e) => {
      isDraggingProgress = true;
      seekTouch(e);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (isDraggingProgress) seekTouch(e);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      isDraggingProgress = false;
    });

    // Retry button
    els.playerRetryBtn.addEventListener('click', () => {
      if (currentChannel) load(currentChannel);
    });

    // Auto-hide controls
    els.videoWrapper.addEventListener('mousemove', resetHideControlsTimer);
    els.videoWrapper.addEventListener('mouseenter', resetHideControlsTimer);
    els.videoWrapper.addEventListener('mouseleave', () => {
      clearTimeout(hideControlsTimer);
      if (!video.paused) {
        els.controlsOverlay.style.opacity = '0';
        els.controlsOverlay.style.pointerEvents = 'none';
        els.videoWrapper.style.cursor = 'none';
      }
    });

    // Support touch devices to wake up controls
    els.videoWrapper.addEventListener('touchstart', resetHideControlsTimer, { passive: true });

    // Double-click to fullscreen
    video.addEventListener('dblclick', toggleFullscreen);
    video.addEventListener('click', togglePlay);

    // Fullscreen change
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't interfere when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!currentChannel && !videoWrapped()) return;

      switch(e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(-0.1);
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          onNext();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          onPrev();
          break;
      }
    });
  }

  function videoWrapped() {
    return !els.videoWrapper.classList.contains('hidden');
  }

  function togglePlay() {
    if (!video.src && !hlsInstance && !dashInstance) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showControlsBriefly();
  }

  function toggleMute() {
    video.muted = !video.muted;
  }

  function toggleFullscreen() {
    const container = document.getElementById('playerContainer');
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function togglePiP() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (document.pictureInPictureEnabled) {
      video.requestPictureInPicture().catch(() => {
        UI.toast('PiP not available for this stream', 'warning');
      });
    } else {
      UI.toast('Picture-in-Picture not supported in your browser', 'warning');
    }
  }

  function seek(seconds) {
    if (!isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    showControlsBriefly();
  }

  function seekTo(e) {
    const rect = els.progressBar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (isFinite(video.duration)) {
      video.currentTime = pct * video.duration;
    }
  }

  function seekTouch(e) {
    const touch = e.touches[0];
    seekTo(touch);
  }

  function changeVolume(delta) {
    const newVol = Math.max(0, Math.min(1, video.volume + delta));
    video.volume = newVol;
    video.muted = newVol === 0;
    showControlsBriefly();
  }

  function onFullscreenChange() {
    const isFS = !!document.fullscreenElement;
    updateIconBtn(els.fullscreenBtn, isFS ? 'minimize' : 'maximize');
  }

  /* ─────────────────────────────────────────────
     UI Helpers
  ───────────────────────────────────────────── */
  function updatePlayButton(playing) {
    updateIconBtn(els.playPauseBtn, playing ? 'pause' : 'play');
  }

  function showBuffering(show) {
    els.bufferingSpinner.classList.toggle('hidden', !show);
  }

  function showError(msg) {
    showBuffering(false);
    els.playerError.classList.remove('hidden');
    els.playerErrorMsg.textContent = msg;
  }

  function hideError() {
    els.playerError.classList.add('hidden');
  }

  function resetHideControlsTimer() {
    clearTimeout(hideControlsTimer);
    els.controlsOverlay.style.opacity = '1';
    els.controlsOverlay.style.pointerEvents = 'all';
    els.videoWrapper.style.cursor = 'default';

    hideControlsTimer = setTimeout(() => {
      if (!video.paused) {
        els.controlsOverlay.style.opacity = '0';
        els.controlsOverlay.style.pointerEvents = 'none';
        els.videoWrapper.style.cursor = 'none';
      }
    }, 3000);
  }

  function showControlsBriefly() {
    els.controlsOverlay.style.opacity = '1';
    els.controlsOverlay.style.pointerEvents = 'all';
    resetHideControlsTimer();
  }

  function updateFavBtn(isFav) {
    if (isFav) {
      els.favoriteBtn.style.color = '#f59e0b';
      updateIconBtn(els.favoriteBtn, 'star', true);
    } else {
      els.favoriteBtn.style.color = '';
      updateIconBtn(els.favoriteBtn, 'star', false);
    }
  }

  function updateIconBtn(btn, iconName, filled = false) {
    if (!btn) return;
    btn.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', iconName);
    if (filled) i.style.fill = 'currentColor';
    btn.appendChild(i);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [i] });
  }

  /* ─────────────────────────────────────────────
     Cleanup
  ───────────────────────────────────────────── */
  function destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  function destroyDash() {
    if (dashInstance) {
      dashInstance.reset();
      dashInstance = null;
    }
  }

  function destroy() {
    destroyHls();
    destroyDash();
    video.src = '';
    video.load();
  }

  /* ─────────────────────────────────────────────
     Utility
  ───────────────────────────────────────────── */
  function getProxiedUrl(url) {
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url;
    if (url.includes('localhost') || url.includes('127.0.0.1')) return url;
    if (url.includes('/proxy?url=')) return url;

    const settings = Storage.getSettings();
    const base = settings.proxyBaseUrl || 'https://akxel001-iptv-proxy.hf.space';
    
    // If we are on a remote site (like GitHub Pages) and no proxy base is set,
    // we default to the Hugging Face proxy.
    const proxyBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${proxyBase}/proxy?url=${encodeURIComponent(url)}`;
  }

  function formatTime(secs) {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function getCurrentChannel() { return currentChannel; }

  function setVolume(v) {
    video.volume = Math.max(0, Math.min(1, v));
    els.volumeSlider.value = Math.round(v * 100);
  }

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  function init() {
    initVideoEvents();
    initControls();
    initKeyboardShortcuts();

    // Restore volume
    const s = Storage.getSettings();
    if (s.rememberVolume && s.volume != null) {
      setVolume(s.volume);
    }

    // PiP not supported → hide btn
    if (!document.pictureInPictureEnabled) {
      els.pipBtn.style.display = 'none';
    }
  }

  return {
    init,
    load,
    loadLocalFile,
    destroy,
    setCallbacks,
    updateFavBtn,
    getCurrentChannel,
    setVolume,
  };
})();
