# cy's Stift 1.3.0-preview.1

A preview of the local-first idea canvas: Capture -> Inbox -> Canvas -> Workbench -> Export and recovery. All data stays on your machine; the app sends nothing to a server and collects no usage telemetry.

This preview collects a round of experience polish since 1.2.0 — accessibility, canvas feel, search, import/export, and storage awareness — guided by the default-user perspective.

## Downloads

- **Windows 10/11 x64:** NSIS `.exe` installer.
- **macOS Apple Silicon:** `.dmg`.
- **Checksums:** `SHA256SUMS.txt` to verify each download.
- **Android:** not in this preview.

## What's new in this preview

- **Accessibility (keyboard reachability):** the graph view and canvas card creation are operable by keyboard; focus management and Esc-to-cancel are consistent; tool overlays no longer cover their targets.
- **Canvas feel:** card creation is undoable; the text tool can place text inside a frame; the eraser no longer shows a misleading "mode mismatch" notice on empty clicks; wheel/trackpad zoom follows the actual scroll amount; double-clicking empty space while an arrow is selected still creates a card.
- **Find (⌘K):** full keyboard navigation with match highlighting; linked-card titles are indexed; filters no longer mislead.
- **Import/export + storage awareness:** controllable pre-import recovery points, clear export feedback, drag-back guidance, readable errors. **Import boundary:** when there is not enough space to write the full snapshot, the import proceeds and reports "no recovery point created" (the smaller new state may still fit); rollback is guaranteed by an independent snapshot, not the recovery point. Fixed lossy rebuilding when editing `@links` (URL-unchanged links keep their title/preview/fetched-at). Storage usage is computed against the real quota, with clear cleanup paths, large-file hints, and a visible data location.
- **Relations / deep editing / cross-page consistency:** creating a connection sets its type; bidirectional links have a consistent direction; deletions are announced. The workbench preserves rich fields (`@code`/`@quote`/`@links`) when switching cards; IME composition no longer misfires; detail actions, tag gestures, and save feedback are consistent across pages; confirmation gates, shortcut conflicts, and Esc stacking are unified.

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

- Data is local-first; JSON exports redact API keys and media binary data. There is no usage telemetry, so your feedback is the only signal we have.
- AI is optional and user-configured; preview testing does not imply a provider reliability guarantee.
- This is not the stable release. Code signing/notarization, VoiceOver and system 200% zoom checks, real-provider quota evidence, and external user research remain stable-release gates.
