# Petnames for Bluesky

A browser extension that lets you assign personal names to Bluesky users. Your namespace, your mental model.

## What are Petnames?

[Petnames](https://www.skyhunter.com/marcs/petnames/IntroPetNames.html) solve [Zooko's Triangle](https://en.wikipedia.org/wiki/Zooko%27s_triangle) - the trilemma that names can't be simultaneously human-meaningful, secure, and decentralized.

The insight: **human-meaningful names should be personal, not global**.

Instead of everyone using the same handles, you maintain your own private namespace. When you see `did:plc:xyz123...`, your browser shows `coffee-friend` - the name *you* chose for that person.

## Why Petnames?

**Display names are chosen by them. Petnames are chosen by you.**

- **Handle takeover detection**: When you assign a petname, the extension remembers which handle pointed to that DID. If the handle later resolves to a different DID (potential takeover), you'll see a ⚠️ warning.
- **Your mental model**: Name people how you think of them - "crypto-alice" or "alice-from-conf" instead of generic "Alice".
- **Context preservation**: Even if their display name changes, yours doesn't.

## Installation

1. Clone this repo or download the extension files
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select this folder
5. Pin the extension for easy access

## Usage

**Assign a petname:**
- Hover over any handle on Bluesky
- Click the purple `+` button that appears
- Enter your personal name for this user
- Press Enter or click Save

**View your petnames:**
- Click the extension icon in your toolbar
- Search or browse all your petnames
- Click any entry to visit their profile
- Click × to remove a petname

**Petname badges:**
- Users with petnames show a purple `~name` badge
- Hover to see their original handle
- Click to edit or remove the petname

**Export/Import:**
- Click **Export** to download your petnames as JSON
- Click **Import** to restore from a backup file
- Useful for syncing across browsers or backing up before reinstalling

## How It Works

1. Content script scans Bluesky for handles
2. Resolves handles to DIDs via Bluesky's API
3. Looks up your petnames (stored in chrome.storage)
4. Injects badges next to handles with petnames
5. Watches for DOM changes to handle SPA navigation

All data stays local in your browser.

## Comparison: Naming Approaches

| Property | ATProto Handles | Raw Keys | Petnames |
|----------|-----------------|----------|----------|
| Global | ✓ | ✓ | ✗ (personal) |
| Human-readable | ✓ | ✗ | ✓ |
| Secure | ✓ (DNS) | ✓ | ✓ |
| You control it | ✗ | ✗ | ✓ |

ATProto handles are global and readable but controlled by the account holder. Petnames are personal and readable but controlled by you.

## Technical Details

- Chrome Extension Manifest V3
- No backend - all data in `chrome.storage.local`
- Resolves handles to DIDs via `com.atproto.identity.resolveHandle`
- Caches DID resolutions to minimize API calls
- MutationObserver for SPA navigation

## Credits

- [Petname Systems](https://www.skyhunter.com/marcs/petnames/IntroPetNames.html) by Marc Stiegler
- Built by [Filae](https://filae.site)

## License

MIT
