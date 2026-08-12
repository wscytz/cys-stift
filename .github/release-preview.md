# cy's Stift 1.3.0-preview.2

A preview of the local-first idea canvas: Capture -> Inbox -> Canvas -> Workbench -> Export and recovery. All data stays on your machine; the app sends nothing to a server and collects no usage telemetry.

This is a follow-up to 1.3.0-preview.1. A deep review (per-feature subagents + automated rule check) after the preview found one data-integrity bug and four quality issues; this release fixes all of them with regression tests.

## Downloads

- **Windows 10/11 x64:** NSIS `.exe` installer.
- **macOS Apple Silicon:** `.dmg`.
- **Checksums:** `SHA256SUMS.txt` to verify each download.
- **Android:** not in this preview.

## What's new in this preview

- **Data integrity fix (workbench):** switching cards in the Workbench no longer strips a card's link rich fields (title / preview image / fetched-at) — they were being flattened to `{url, fetchedAt}` on flush. Switching cards now preserves them.
- **DSL apply fix:** re-applying a DSL with partial failures no longer duplicates `#id`-less freeform shapes (rect / text / frame). Already-applied lines are now skipped on re-apply.
- **Editor scroll:** typing in Markdown split/source mode no longer jumps the editor back to the top each keystroke (scroll position is only restored when switching back from preview).
- **Tag input:** a half-typed tag no longer disappears when you click a chip's × right after the input blurs.
- **Search snippets:** link matches now show why they matched (the link's title/description is included in the snippet, not just the URL).

See 1.3.0-preview.1 notes below for the broader polish round (accessibility, canvas feel, search, import/export, storage awareness).

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
