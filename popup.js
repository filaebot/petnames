/**
 * Petnames for Bluesky - Popup Script
 */

let petnames = {};
let handles = {}; // did -> handle cache

// Load petnames from storage
async function loadPetnames() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['petnames', 'handleCache'], (result) => {
      petnames = result.petnames || {};
      handles = result.handleCache || {};
      resolve();
    });
  });
}

// Save petnames to storage
async function savePetnames() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ petnames }, resolve);
  });
}

// Resolve DID to handle via API
async function resolveHandle(did) {
  if (handles[did]) return handles[did];

  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`);
    if (!res.ok) return did;
    const data = await res.json();
    const handle = data.handle;
    handles[did] = handle;
    // Save to cache
    chrome.storage.local.set({ handleCache: handles });
    return handle;
  } catch (e) {
    console.error('[Petnames] Failed to resolve DID:', did, e);
    return did;
  }
}

// Render petname list
async function renderList(filter = '') {
  const listEl = document.getElementById('list');
  const countEl = document.getElementById('count');
  const resolvesEl = document.getElementById('resolves');

  const dids = Object.keys(petnames);
  countEl.textContent = dids.length;
  resolvesEl.textContent = Object.keys(handles).length;

  if (dids.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">~</div>
        <div class="empty-state-text">
          No petnames yet.<br>
          Click the + button next to any handle on Bluesky to assign a personal name.
        </div>
      </div>
    `;
    return;
  }

  // Sort by petname
  const sorted = dids.sort((a, b) => {
    return petnames[a].toLowerCase().localeCompare(petnames[b].toLowerCase());
  });

  // Filter
  const filtered = filter
    ? sorted.filter(did => {
        const petname = petnames[did].toLowerCase();
        const handle = (handles[did] || '').toLowerCase();
        const q = filter.toLowerCase();
        return petname.includes(q) || handle.includes(q);
      })
    : sorted;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-text">
          No matches for "${filter}"
        </div>
      </div>
    `;
    return;
  }

  // Render items
  listEl.innerHTML = '';
  for (const did of filtered) {
    const item = document.createElement('div');
    item.className = 'petname-item';

    const handle = await resolveHandle(did);

    item.innerHTML = `
      <span class="petname-item-name">${escapeHtml(petnames[did])}</span>
      <span class="petname-item-handle">@${escapeHtml(handle)}</span>
      <span class="petname-item-remove" data-did="${did}">×</span>
    `;

    // Click to open profile
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('petname-item-remove')) {
        window.open(`https://bsky.app/profile/${handle}`, '_blank');
      }
    });

    // Remove button
    item.querySelector('.petname-item-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      const did = e.target.dataset.did;
      delete petnames[did];
      await savePetnames();
      renderList(document.getElementById('search').value);
    });

    listEl.appendChild(item);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadPetnames();
  await renderList();

  // Search
  document.getElementById('search').addEventListener('input', (e) => {
    renderList(e.target.value);
  });
});
