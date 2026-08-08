# Privacy

Ollama Cloud Usage does not collect, sell, transmit, or share personal data.

The extension sends a request only to `https://ollama.com/settings`, using the Ollama login session already managed by Chrome. It parses the returned page locally inside the extension popup. It stores only the latest parsed display values—username, email, subscription tier, usage percentages, reset timestamps, model names, request counts, and fetch time—in Chrome extension-local storage as a fallback. Cache entries older than 24 hours are ignored and removed when the popup next opens. It does not read or store the Ollama session cookie or password.

No analytics, advertising, telemetry, or third-party services are included.
