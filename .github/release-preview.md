# cy's Stift <VERSION>

A preview of the local-first idea canvas: Capture -> Inbox -> Canvas -> Workbench -> Export and recovery. All data stays on your machine; the app sends nothing to a server and collects no usage telemetry.

This is a follow-up to 1.3.0-preview.2. After that release we ran three rounds of adversarial testing (13 dimensions, ~120 scenarios: storage, import/export, AI, privacy, settings, conversations, DSL parsing, archive, large datasets, multi-canvas, quota exhaustion, AI streaming), with every confirmed finding reproduced in a real browser before fixing. This release ships all of the fixes with regression tests.

## Downloads

- **Windows 10/11 x64:** NSIS `.exe` installer.
- **macOS Apple Silicon:** `.dmg`.
- **Checksums:** `SHA256SUMS.txt` to verify each download.
- **Android:** not in this preview.
- **Web:** https://wscytz.com/cys-stift/app/ (same version, data stays in your browser).

## What's new in this preview

- **Crash fix — corrupted dates:** a corrupted `capturedAt`/`updatedAt` in local storage no longer crashes the Timeline / Archive / Search / Trash views (bad values fall back to epoch, sorting stays stable, a bad `deletedAt` is treated as not-deleted so the card returns to Inbox).
- **Crash fix — malformed AI conversation state:** a corrupted `dslBlocks` field no longer breaks the `/ask` view and the canvas companion panel.
- **Data fix — concurrent edits in two tabs:** editing different fields of the same card in two tabs no longer overwrites each other (the edit baseline is frozen when the editor opens).
- **Import:** imports now reject arrays with duplicate card ids instead of violating uniqueness on write.
- **Archive index hardening:** a corrupted archive index no longer causes unhandled rejections at boot or silently fails release archiving.
- **Settings salvage:** a partially corrupted settings file is now salvaged field-by-field (shortcuts / theme / locale kept, invalid AI profiles dropped or repaired) instead of being reset to defaults. Invalid `temperature`/`maxTokens` values are validated against the form contract.
- **AI error classification:** deterministic failures (401/403 auth, 429 rate limit, 404 model, timeouts) are no longer retried three times as if they were transient network errors. Each now maps to an actionable message (check your key / rate limit / model name) instead of a misleading "check your network".
- **Canvas deletion cleanup:** deleting a canvas now also clears its conversation history and view state, so no orphan entries remain in exports.
- **Boundary hardening:** freeform geometry validation, ghost-image filtering, empty tag chips, double-submit guards on capture, and safe markdown link handling for protocol-relative URLs.
- **Test infrastructure:** the e2e suites now run against the static production build instead of a dev server, and a one-command web deploy script (build -> backup -> upload -> HTTPS verify) was added.

See 1.3.0-preview.2 notes below for the deep-review fixes, and 1.3.0-preview.1 notes for the broader polish round (accessibility, canvas feel, search, import/export, storage awareness).

## Windows notice (no code signing)

The Windows installer is **not** signed with an Authenticode certificate. Windows SmartScreen may show "Windows protected your PC" on first launch. Choose **More info -> Run anyway**. This is expected for an unsigned preview; a code-signed build is a later stable-release goal.

## macOS notice (ad-hoc signed, not notarized)

The macOS app is ad-hoc signed for artifact integrity but not notarized with an Apple Developer ID. Gatekeeper will warn on first launch. After dragging it to Applications, use Finder's Control-click -> Open, or **System Settings > Privacy & Security -> Open Anyway**. Do not disable Gatekeeper globally.

## What to test

1. Capture two short ideas, tag them, and confirm both land in Inbox.
2. Send Inbox cards to a canvas, connect them with arrows, undo once — confirm the cards return.
3. Try the DSL: paste a small DSL into the canvas (or `/dev/dsl-playground`) and confirm cards + layout render; edit the text and watch the canvas update.
4. Open a card in Workbench, edit Markdown (code, math, footnotes), and return to the canvas.
5. Export data, import with Replace, inspect the checkpoint, then restore it.
6. If you configure an AI provider: create a proposal, reject or apply it, and confirm undo leaves nothing unwanted. With a wrong API key, the error should say authentication failed (and retry only once), not "check your network".

If you use **DeepSeek**, the model name must be `deepseek-v4-flash` or `deepseek-v4-pro` (older names are no longer accepted by the endpoint).

Please report the operating system, app version, exact steps, what you expected, and what happened. **Do not include API keys or private card content in a public issue.**

## Known preview boundaries

- Data is local-first; JSON exports redact API keys and media binary data. There is no usage telemetry, so your feedback is the only signal we have.
- AI is optional and user-configured; preview testing does not imply a provider reliability guarantee.
- This is not the stable release. Code signing/notarization, VoiceOver and system 200% zoom checks, real-provider quota evidence, and external user research remain stable-release gates.
