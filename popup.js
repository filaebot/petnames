/**
 * Petnames for Bluesky - Popup Script
 */

let petnames = {};
let handles = {}; // did -> handle cache

// Load petnames from storage
async function loadPetnames() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['petnames', 'handleCache'], (result) => {
      const raw = result.petnames || {};
      // Migrate old format { did: "name" } to new { did: { petname: "name", ... } }
      petnames = {};
      for (const [did, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
          petnames[did] = { petname: value, originalHandle: null, assignedAt: null };
        } else {
          petnames[did] = value;
        }
      }
      handles = result.handleCache || {};
      resolve();
    });
  });
}

// Helper to get petname string
function getPetname(did) {
  const data = petnames[did];
  return data ? (typeof data === 'string' ? data : data.petname) : null;
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
    return getPetname(a).toLowerCase().localeCompare(getPetname(b).toLowerCase());
  });

  // Filter
  const filtered = filter
    ? sorted.filter(did => {
        const petname = getPetname(did).toLowerCase();
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
    const data = petnames[did];
    const hasChanged = data.originalHandle && data.originalHandle.toLowerCase() !== handle.toLowerCase();

    item.innerHTML = `
      <span class="petname-item-name">${escapeHtml(getPetname(did))}</span>
      <span class="petname-item-handle ${hasChanged ? 'petname-item-warning' : ''}">
        ${hasChanged ? '⚠️ ' : ''}@${escapeHtml(handle)}
        ${hasChanged ? `<span class="petname-item-was">(was @${escapeHtml(data.originalHandle)})</span>` : ''}
      </span>
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

// Export petnames as JSON
function exportPetnames() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    petnames: petnames,
    handles: handles
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `petnames-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import petnames from JSON
async function importPetnames(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Validate structure
        if (!data.petnames || typeof data.petnames !== 'object') {
          throw new Error('Invalid file: missing petnames object');
        }

        // Merge with existing (imported entries overwrite conflicts)
        let imported = 0;
        for (const [did, value] of Object.entries(data.petnames)) {
          if (!did.startsWith('did:')) continue;

          // Handle both old format (string) and new format (object)
          if (typeof value === 'string' && value.trim()) {
            // Old format
            petnames[did] = { petname: value.trim(), originalHandle: null, assignedAt: null };
            imported++;
          } else if (typeof value === 'object' && value.petname) {
            // New format
            petnames[did] = {
              petname: value.petname.trim(),
              originalHandle: value.originalHandle || null,
              assignedAt: value.assignedAt || null
            };
            imported++;
          }
        }

        // Also merge handle cache if present
        if (data.handles && typeof data.handles === 'object') {
          for (const [did, handle] of Object.entries(data.handles)) {
            if (did.startsWith('did:') && typeof handle === 'string') {
              handles[did] = handle;
            }
          }
        }

        await savePetnames();
        chrome.storage.local.set({ handleCache: handles });

        resolve(imported);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadPetnames();
  await renderList();

  // Search
  document.getElementById('search').addEventListener('input', (e) => {
    renderList(e.target.value);
  });

  // Export button
  document.getElementById('export-btn').addEventListener('click', () => {
    if (Object.keys(petnames).length === 0) {
      alert('No petnames to export.');
      return;
    }
    exportPetnames();
  });

  // Import input
  document.getElementById('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const imported = await importPetnames(file);
      await renderList();
      alert(`Imported ${imported} petname(s).`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }

    // Reset input so same file can be imported again
    e.target.value = '';
  });
});
