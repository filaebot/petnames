/**
 * Petnames for Bluesky - Content Script
 *
 * Scans the page for user handles, resolves them to DIDs,
 * and injects personal petname badges.
 */

// Cache: handle -> DID
const didCache = new Map();
// Cache: DID -> petname (loaded from storage)
let petnames = {};
// Current menu element
let activeMenu = null;

// Load petnames from storage
async function loadPetnames() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['petnames'], (result) => {
      petnames = result.petnames || {};
      resolve(petnames);
    });
  });
}

// Save petnames to storage
async function savePetnames() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ petnames }, resolve);
  });
}

// Resolve handle to DID via Bluesky API
async function resolveDID(handle) {
  if (didCache.has(handle)) {
    return didCache.get(handle);
  }

  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const did = data.did;
    didCache.set(handle, did);
    return did;
  } catch (e) {
    console.error('[Petnames] Failed to resolve handle:', handle, e);
    return null;
  }
}

// Create petname badge element
function createBadge(did, petname, handle) {
  const badge = document.createElement('span');
  badge.className = 'petname-badge';
  badge.textContent = petname;
  badge.dataset.did = did;
  badge.dataset.original = '@' + handle;
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(did, handle, badge);
  });
  return badge;
}

// Create "add petname" button
function createAddButton(did, handle) {
  const btn = document.createElement('span');
  btn.className = 'petname-add-btn';
  btn.textContent = '+';
  btn.title = 'Add petname';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(did, handle, btn);
  });
  return btn;
}

// Show context menu for assigning petname
function showMenu(did, handle, anchor) {
  closeMenu();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'petname-menu';

  const currentPetname = petnames[did] || '';

  menu.innerHTML = `
    <div class="petname-menu-header">Assign Petname</div>
    <div class="petname-menu-handle">@${handle}</div>
    <div class="petname-menu-did">${did}</div>
    <input type="text" class="petname-menu-input" placeholder="Enter your name for this person..." value="${currentPetname}">
    <div class="petname-menu-actions">
      <button class="petname-menu-btn petname-menu-btn-cancel">Cancel</button>
      <button class="petname-menu-btn petname-menu-btn-save">Save</button>
    </div>
    ${currentPetname ? '<button class="petname-menu-btn petname-menu-btn-remove">Remove Petname</button>' : ''}
  `;

  // Position menu
  menu.style.top = rect.bottom + 8 + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';

  document.body.appendChild(menu);
  activeMenu = menu;

  const input = menu.querySelector('.petname-menu-input');
  input.focus();
  input.select();

  // Event handlers
  menu.querySelector('.petname-menu-btn-cancel').addEventListener('click', closeMenu);

  menu.querySelector('.petname-menu-btn-save').addEventListener('click', async () => {
    const newPetname = input.value.trim();
    if (newPetname) {
      petnames[did] = newPetname;
      await savePetnames();
      closeMenu();
      scanPage(); // Re-scan to update badges
    }
  });

  const removeBtn = menu.querySelector('.petname-menu-btn-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      delete petnames[did];
      await savePetnames();
      closeMenu();
      scanPage(); // Re-scan to remove badges
    });
  }

  // Enter to save
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      menu.querySelector('.petname-menu-btn-save').click();
    } else if (e.key === 'Escape') {
      closeMenu();
    }
  });

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

function handleClickOutside(e) {
  if (activeMenu && !activeMenu.contains(e.target)) {
    closeMenu();
  }
}

function closeMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('click', handleClickOutside);
  }
}

// Find handle elements on the page
function findHandleElements() {
  // Bluesky uses various elements for handles
  // Profile links typically have href like /profile/handle.tld
  const elements = [];

  // Profile links
  document.querySelectorAll('a[href^="/profile/"]').forEach(link => {
    const href = link.getAttribute('href');
    const match = href.match(/^\/profile\/([^/?]+)/);
    if (match && match[1]) {
      const handle = match[1];
      // Skip if already processed or is a DID
      if (!link.dataset.petnameDid && !handle.startsWith('did:')) {
        elements.push({ element: link, handle });
      }
    }
  });

  // Handle text that starts with @
  document.querySelectorAll('span, div').forEach(el => {
    if (el.dataset.petnameDid) return; // Already processed
    const text = el.textContent?.trim();
    if (text?.startsWith('@') && text.length > 1 && !text.includes(' ')) {
      const handle = text.slice(1);
      // Validate it looks like a handle
      if (handle.includes('.') && !handle.startsWith('did:')) {
        elements.push({ element: el, handle });
      }
    }
  });

  return elements;
}

// Scan page and inject petname badges
async function scanPage() {
  await loadPetnames();

  // Remove old badges and buttons
  document.querySelectorAll('.petname-badge, .petname-add-btn').forEach(el => el.remove());
  // Clear processed markers
  document.querySelectorAll('[data-petname-did]').forEach(el => {
    delete el.dataset.petnameDid;
    delete el.dataset.petnameTarget;
  });

  const handleElements = findHandleElements();

  for (const { element, handle } of handleElements) {
    const did = await resolveDID(handle);
    if (!did) continue;

    element.dataset.petnameDid = did;
    element.dataset.petnameTarget = 'true';

    if (petnames[did]) {
      // Has petname - show badge
      const badge = createBadge(did, petnames[did], handle);
      element.after(badge);
    } else {
      // No petname - show add button on hover
      const addBtn = createAddButton(did, handle);
      element.after(addBtn);
    }
  }
}

// Debounced scan
let scanTimeout = null;
function debouncedScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(scanPage, 300);
}

// Watch for DOM changes (Bluesky is a SPA)
const observer = new MutationObserver((mutations) => {
  // Check if new content was added
  let shouldScan = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldScan = true;
      break;
    }
  }
  if (shouldScan) {
    debouncedScan();
  }
});

// Initialize
async function init() {
  console.log('[Petnames] Initializing...');
  await loadPetnames();
  console.log('[Petnames] Loaded', Object.keys(petnames).length, 'petnames');

  // Initial scan
  await scanPage();

  // Watch for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[Petnames] Ready');
}

// Start when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
