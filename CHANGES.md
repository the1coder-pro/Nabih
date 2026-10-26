# نبيه | Nabih — Mailbox preview fix

All files are drop-in replacements for the files with the same name in your extension folder.
Two brand-new files must be added: `mailRender.js` and `mail-view.css`.

## Why the mailbox was broken

| # | Root cause | Effect |
|---|------------|--------|
| 1 | `popup.js` put the message into a `<pre>` as **text**: `pre.textContent = full.html` | The user saw raw HTML source (`<div>`, `<table>`…) instead of the email |
| 2 | `.slice(0, 4000)` + `max-height: 220px` | Message was cut off — “doesn’t show fully” |
| 3 | `innerHTML` with unescaped `subject` / `intro` / `html` | Email markup broke the popup layout and could inject code |
| 4 | `manifest.json` had **two** `host_permissions` keys — the 2nd (`virustotal`) overwrites the 1st (`api.mail.tm`) | The service worker had no permission for `api.mail.tm`, so inbox/read could fail |
| 5 | `inbox()` fetched page 1 only (30 messages) and returned `full: true` | Older messages never appeared |
| 6 | mail.tm token expires → every request returns 401 | Inbox suddenly empty / errors, no recovery |
| 7 | `tempMailPopUp.js` treated the inbox result as an array (`list.length`, `list.filter`) | Test popup showed nothing |
| 8 | No sanitising at all: remote images/pixels, `<script>`, `javascript:` links, `position:fixed` banners | Tracking, broken layout |
| 9 | Popup width 350px, tooltip 275px | Emails unreadable |

## What was changed

### NEW `mailRender.js` (shared renderer)
* `sanitizeHtml()` — removes `script/iframe/object/form/svg/…`, all `on*` attributes, `javascript:`/`data:` URLs, `srcdoc`, `srcset`; strips `@import` and `position:fixed`; forces `target="_blank" rel="noopener noreferrer nofollow"` on links.
* `createView()` — renders the **complete** email (no truncation) inside a sandboxed iframe
  (`sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, **no** `allow-scripts`), with its own CSP meta (`default-src 'none'`), auto-height fitting, and a plain-div fallback if a page CSP blocks frames.
* Toolbar inside every message: **HTML | نص** (plain text), **🖼 الصور** (images hidden by default → no tracking pixels), **⤢ توسيع**, **📋 نسخ النص**, **🗑 حذف**.
* Big click-to-copy OTP block, link rows (copy / open), and attachment rows.

### NEW `mail-view.css`
Styles for the viewer; linked from `popup.html` and added to `content_scripts` in the manifest.

### `tempMail.js` (background)
* `authRequest()` — on **401** it mints a fresh token from the stored password and retries (no more dead inbox).
* `inbox()` — pages through all results (up to 5 pages), de-duplicates, sorts newest-first, returns `{items, total, complete}`.
* `read()` — returns the full `html`/`text`, attachments, marks the message as seen server-side, better OTP extraction (also `123 456` / `123-456`, ignores digits that are part of a link).
* `remove()` — properly reports success.

### `popup.js`
* Rows are built with DOM text nodes (no `innerHTML`) → subject/intro can’t break the UI.
* Click = expand/collapse the message; auto-opens the verification link **once** and only when there is no OTP code.
* Correct `n من total` counter, delete button, no 4000-char cut.

### `popup.html`
* Loads `mailRender.js` + `mail-view.css`.

### `popup.css`
* Popup width `350px → 420px`, message list height 220 → 340, 2-line clamped intro.

### `content.js` (inline tooltip / sidebar)
* Uses the same shared viewer, escaped rows, expand/collapse, delete.

### `style.css`
* Tooltip width `275px → 360px` (+ matching positioning math in `content.js`), list height 150 → 260, intro clamp.

### `manifest.json`
* Merged both `host_permissions` into one array (`api.mail.tm` + `virustotal`), added `mailRender.js` and `mail-view.css` to the content script.

### `tempMailPopUp.js`
* Fixed the array/object bug and uses the shared viewer.

## Install
1. Unzip into your extension folder (overwrite same-named files, keep `Lock.png` etc.).
2. `chrome://extensions` → reload the extension.
3. If the mailbox still looks empty: remove and recreate the temp address once (old tokens/passwords before this fix were not stored properly).
