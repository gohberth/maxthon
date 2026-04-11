/**
 * ui.js - UI Manager: Sidebar, Modals, Toast, Channel rendering
 * StreamVault IPTV Player
 */

const UI = (() => {

  /* ─────────────────────────────────────────────
     Toast Notifications
  ───────────────────────────────────────────── */
  const toastContainer = document.getElementById('toastContainer');

  const ICONS = {
    success: 'check-circle-2',
    error:   'x-circle',
    info:    'info',
    warning: 'alert-triangle',
  };

  function toast(message, type = 'info', duration = 3500) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;

    const iconName = ICONS[type] || 'info';
    el.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(el);
    lucide.createIcons({ nodes: el.querySelectorAll('[data-lucide]') });

    setTimeout(() => {
      el.classList.add('toast-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);

    return el;
  }

  /* ─────────────────────────────────────────────
     Modals
  ───────────────────────────────────────────── */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('hidden');
      modal.querySelector('.modal')?.classList.remove('hidden');
    }
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
  }

  function initModalClose() {
    // Close on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    });

    // Close buttons
    document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-modal') || btn.closest('.modal-overlay')?.id;
        if (id) closeModal(id);
      });
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
          m.classList.add('hidden');
        });
      }
    });
  }

  /* ─────────────────────────────────────────────
     Modal Tabs
  ───────────────────────────────────────────── */
  function initModalTabs() {
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const modal = tab.closest('.modal');
        const tabName = tab.getAttribute('data-mtab');

        modal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.modal-tab-content').forEach(c => c.classList.add('hidden'));

        tab.classList.add('active');
        const content = modal.querySelector(`[data-mtab-content="${tabName}"]`);
        if (content) content.classList.remove('hidden');
      });
    });
  }

  /* ─────────────────────────────────────────────
     Sidebar
  ───────────────────────────────────────────── */
  let currentTab = 'all';
  let currentView = 'list'; // 'list' | 'grid'

  function initSidebar() {
    const sidebar    = document.getElementById('sidebar');
    const toggleBtn  = document.getElementById('sidebarToggleBtn');

    toggleBtn.addEventListener('click', () => {
      const isMobile = window.innerWidth <= 700;
      if (isMobile) {
        sidebar.classList.toggle('mobile-open');
      } else {
        sidebar.classList.toggle('collapsed');
      }
    });

    // Click outside sidebar on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 700 && sidebar.classList.contains('mobile-open')) {
        if (!sidebar.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
        }
      }
    });

    // Restore view mode
    const settings = Storage.getSettings();
    currentView = settings.viewMode || 'list';
    applyViewMode(currentView);
  }

  function setTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.sidebar-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
  }

  function applyViewMode(mode) {
    currentView = mode;
    const list = document.getElementById('channelList');
    if (mode === 'grid') {
      list.classList.add('view-grid');
    } else {
      list.classList.remove('view-grid');
    }
  }

  /* ─────────────────────────────────────────────
     Channel Rendering
  ───────────────────────────────────────────── */
  function renderChannels(channels, activeUrl = null, showNumbers = false) {
    const list = document.getElementById('channelList');
    const empty = document.getElementById('emptyState');

    list.innerHTML = '';

    if (!channels || channels.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    const favorites = new Set(Storage.getFavorites().map(f => f.url));

    // Use DocumentFragment for performance
    const fragment = document.createDocumentFragment();

    channels.forEach((ch, idx) => {
      const card = createChannelCard(ch, {
        index:  idx + 1,
        isActive: ch.url === activeUrl,
        isFav: favorites.has(ch.url),
        showNumbers,
      });
      fragment.appendChild(card);
    });

    list.appendChild(fragment);
    lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });
  }

  function createChannelCard(channel, { index, isActive, isFav, showNumbers }) {
    const card = document.createElement('div');
    card.className = 'channel-card' + (isActive ? ' active' : '');
    card.setAttribute('data-url', channel.url);
    card.setAttribute('data-id', channel.id);

    const logoHtml = channel.logo
      ? `<img src="${escapeHtml(channel.logo)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'channel-logo-placeholder\\'>${getInitials(channel.name)}</div>'" />`
      : `<div class="channel-logo-placeholder">${getInitials(channel.name)}</div>`;

    card.innerHTML = `
      ${showNumbers ? `<span class="channel-number">${index}</span>` : ''}
      <div class="channel-logo-wrap">${logoHtml}</div>
      <div class="channel-text">
        <span class="channel-name">${escapeHtml(channel.name)}</span>
        <span class="channel-group">${escapeHtml(channel.group || '')}</span>
      </div>
      ${channel.duration === -1 ? '<div class="channel-live-badge" title="Live"></div>' : ''}
      ${isFav ? '<div class="channel-fav-badge"><i data-lucide="star" style="fill:currentColor"></i></div>' : ''}
    `;

    return card;
  }

  function renderCategories(groups, activeGroup = 'all') {
    const list = document.getElementById('categoryList');
    list.innerHTML = '';

    const all = document.createElement('button');
    all.className = 'category-chip' + (activeGroup === 'all' ? ' active' : '');
    all.setAttribute('data-cat', 'all');
    all.textContent = 'All';
    list.appendChild(all);

    groups.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'category-chip' + (activeGroup === g ? ' active' : '');
      btn.setAttribute('data-cat', g);
      btn.textContent = g;
      list.appendChild(btn);
    });
  }

  function setActiveChannel(url) {
    document.querySelectorAll('.channel-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-url') === url);
    });
    // Scroll active card into view
    const active = document.querySelector('.channel-card.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ─────────────────────────────────────────────
     Info Panel
  ───────────────────────────────────────────── */
  function updateInfoPanel(channel, isFav) {
    const empty   = document.getElementById('infoEmpty');
    const details = document.getElementById('infoDetails');

    if (!channel) {
      empty.classList.remove('hidden');
      details.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    details.classList.remove('hidden');

    const infoLogo  = document.getElementById('infoChannelLogo');
    const infoName  = document.getElementById('infoChannelName');
    const infoGroup = document.getElementById('infoGroupBadge');
    const infoType  = document.getElementById('infoTypeBadge');
    const infoUrl   = document.getElementById('infoUrl');
    const infoFmt   = document.getElementById('infoFormat');
    const infoFavBtn = document.getElementById('infoFavBtn');

    if (channel.logo) {
      infoLogo.src = channel.logo;
      infoLogo.classList.remove('hidden');
      infoLogo.onerror = () => infoLogo.classList.add('hidden');
    } else {
      infoLogo.classList.add('hidden');
    }

    infoName.textContent  = channel.name || 'Unknown';
    infoGroup.textContent = channel.group || 'Uncategorized';
    infoUrl.textContent   = channel.url || '-';
    infoUrl.title         = channel.url || '';
    infoFmt.textContent   = (channel.type || 'auto').toUpperCase();

    // Update fav button state
    if (infoFavBtn) {
      infoFavBtn.innerHTML = `<i data-lucide="star" style="${isFav ? 'fill:#f59e0b;color:#f59e0b' : ''}"></i> ${isFav ? 'Unfavorite' : 'Favorite'}`;
      lucide.createIcons({ nodes: infoFavBtn.querySelectorAll('[data-lucide]') });
    }

    lucide.createIcons({ nodes: details.querySelectorAll('[data-lucide]') });
  }

  /* ─────────────────────────────────────────────
     Context Menu
  ───────────────────────────────────────────── */
  const contextMenu = document.getElementById('contextMenu');
  let contextTarget = null;

  function showContextMenu(x, y, channel) {
    contextTarget = channel;
    contextMenu.style.left = x + 'px';
    contextMenu.style.top  = y + 'px';
    contextMenu.classList.remove('hidden');

    const isFav = Storage.isFavorite(channel.url);
    const favBtn = document.getElementById('ctxFavorite');
    if (favBtn) {
      favBtn.innerHTML = `<i data-lucide="${isFav ? 'star-off' : 'star'}"></i> ${isFav ? 'Remove Favorite' : 'Add to Favorites'}`;
      lucide.createIcons({ nodes: [favBtn.querySelector('[data-lucide]')] });
    }

    // Adjust if off-screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth)  contextMenu.style.left = (x - rect.width)  + 'px';
    if (rect.bottom > window.innerHeight) contextMenu.style.top = (y - rect.height) + 'px';
  }

  function hideContextMenu() {
    contextMenu.classList.add('hidden');
    contextTarget = null;
  }

  function getContextTarget() { return contextTarget; }

  function initContextMenuClose() {
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('contextmenu', hideContextMenu);
  }

  /* ─────────────────────────────────────────────
     Settings panel toggles (view mode)
  ───────────────────────────────────────────── */
  function initViewToggle() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-view');
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyViewMode(mode);
        Storage.saveSetting('viewMode', mode);
      });
    });

    // Set initial active state
    const mode = currentView;
    const btn = document.querySelector(`[data-view="${mode}"]`);
    if (btn) {
      document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  /* ─────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────── */
  function getInitials(name = '') {
    return name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  function init() {
    initModalClose();
    initModalTabs();
    initSidebar();
    initContextMenuClose();
    initViewToggle();
  }

  return {
    init,
    toast,
    openModal, closeModal,
    renderChannels, renderCategories,
    setActiveChannel, setTab,
    updateInfoPanel,
    showContextMenu, hideContextMenu, getContextTarget,
    applyViewMode,
    escapeHtml,
  };
})();
