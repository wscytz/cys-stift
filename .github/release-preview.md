# cy's Stift 1.1.0-preview.6

A preview of the local-first idea canvas: Capture -> Inbox -> Canvas -> Workbench -> Export and recovery. All data stays on your machine; the app sends nothing to a server and collects no usage telemetry.

## Downloads

- **Windows 10/11 x64:** NSIS `.exe` installer.
- **macOS Apple Silicon:** `.dmg`.
- **Checksums:** `SHA256SUMS.txt` to verify each download.
- **Android:** not in this preview.

## What's new in this preview

- **Structured canvas cards:** the canvas can be written as plain text (DSL). Cards now carry `@type` / `@tags` / `@links` / `@code` / `@quote` as structured fields — multiple code blocks and quotes per card round-trip cleanly. The canvas remains fully text-editable and diff-friendly.
- **AI (optional):** DeepSeek and Qwen work through the OpenAI-compatible path with per-endpoint thinking-mode handling; AI outlines drop summary cards onto the canvas; output truncation is detected. AI is opt-in and never required for core use.
- **Accessibility:** capture and card forms have accessible names and focus handling; modals are labeled; contrast meets AA.
- **Stability and recovery:** hard-deleted cards clean up their orphaned media; an import that would overwrite data is blocked behind a checkpoint you can restore.
- **Performance:** the relational layout solver was rewritten to scale better on large canvases.

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
6. If you configure an AI provider: create a proposal, reject or apply it, and confirm undo leaves nothing unwanted.

If you use **DeepSeek**, the model name must be `deepseek-v4-flash` or `deepseek-v4-pro` (older names are no longer accepted by the endpoint).

Please report the operating system, app version, exact steps, what you expected, and what happened. **Do not include API keys or private card content in a public issue.**

## Known preview boundaries

- Data is local-first; JSON exports redact API keys and media binary data. There is no usage telemetry, so your feedback is the only signal we have — please fill the questionnaire if you received one.
- AI is optional and user-configured; preview testing does not imply a provider reliability guarantee.
- This is not the stable release. Code signing/notarization, VoiceOver and system 200% zoom checks, real-provider quota evidence, and external user research remain stable-release gates.
