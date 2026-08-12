# Ollama Cloud Usage for Chrome

A native Manifest V3 toolbar popup for Ollama Cloud usage. It reads the authenticated, server-rendered usage page from `ollama.com` using the Ollama session already in Chrome.

**Project site:** https://staffordlumsden.github.io/ollama-cloud-usage-extension/

The popup shows:

- Ollama username and email
- Subscription tier
- Session usage and time until its five-hour reset
- Weekly usage and time until its reset
- Models used during the weekly window, with request counts

There is no iframe, hosted dashboard, analytics, or external backend. The extension only talks to `https://ollama.com/settings`. It never asks for a password or copies the Ollama session cookie into extension storage.

## Install locally

1. Sign in at [ollama.com](https://ollama.com/signin) in Chrome.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this `ollama-cloud-usage-extension` folder.
6. Pin **Ollama Cloud Usage** to the toolbar and click it.

## Development

No build step or npm install is required.

```sh
npm test
```

After editing, click the extension's reload button on `chrome://extensions` and reopen the popup.

## Permissions

- `https://ollama.com/*`: fetches the signed-in account usage page and opens Ollama sign-in/settings links.
- `storage`: keeps the most recent parsed usage snapshot for up to 24 hours, so a temporary network failure can show a clearly marked stale result.

## Data behavior

Ollama currently exposes account usage as HTML on its Settings → Usage page rather than through a public JSON usage API. The parser is isolated in `lib/ollama-parser.js` and has fixture-based tests so markup changes are straightforward to update.
