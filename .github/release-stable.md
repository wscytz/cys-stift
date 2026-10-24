# cy's Stift {{VERSION}}

cy's Stift {{VERSION}} is a stable release of the local-first idea canvas. Capture -> Inbox -> Canvas -> Workbench -> Export: capture, organizing, deep editing, and recovery all stay fully on your machine. The app sends nothing to a server and collects no usage telemetry.

The 1.4.x stable line carries the 1.3.0 feature core plus the **Swiss Editorial redesign** (design system v0.2: warm paper / surgical red / ink / petrol blue, zero radius, 1px line hierarchy, 280/64/48 editorial grid) and the full **motion pass**, followed by successive hardening batches — font wiring, segmented-hydration root fix, DSL round-trip truncation guard, the seven-field AI confirm gate, desktop single-instance, and import/media hardening. Per-version details live in [`docs/changelog.md`](https://github.com/wscytz/cys-stift/blob/main/docs/changelog.md). Release baseline re-verified at tagging: lint clean, full test suite green, web build exit 0, docs link check passing.

## Downloads

- **Windows 10/11 x64:** NSIS `.exe` installer.
- **macOS Apple Silicon:** `.dmg`.
- **Checksums:** `SHA256SUMS.txt` to verify each download.
- **Android:** not in this release.

## Highlights

- **Swiss Editorial UI:** editorial sidebar with 64px collapsed icon rail (hover/focus overlay expand, pin to keep), editorial home (topbar crumb + sync dot, large date anchor, section numbering), re-skinned toolbar / modals / lists / settings, and a consistent motion system driven by shared timing tokens mirrored across three sources.
- **Structured canvas cards:** the canvas can be written as plain text (DSL). Cards carry `@type` / `@tags` / `@links` / `@code` / `@quote` as structured fields — multiple code blocks and quotes per card round-trip cleanly. The canvas stays fully text-editable and diff-friendly.
- **Capture -> Inbox -> Canvas:** quick capture, reversible batch actions, an infinite canvas with arrows, freeform, and outline/minimap.
- **Workbench:** Source / Split / Preview Markdown (code highlighting, math, footnotes).
- **AI (optional):** OpenAI / Anthropic / Ollama providers; DeepSeek and Qwen via the OpenAI-compatible path with per-endpoint thinking-mode handling; AI outlines and edits go through a plan / confirm / apply boundary with undo. AI is opt-in and never required for core use.
- **Local-first and recoverable:** JSON import/export with replace/merge previews, transaction rollback, and a device-local recovery checkpoint before imports. Exports redact API keys and media binary data.

## Windows notice (no code signing)

The Windows installer is **not** signed with an Authenticode certificate. Windows SmartScreen may show "Windows protected your PC" on first launch. Choose **More info -> Run anyway**. Verify the checksum before running it.

## macOS notice (ad-hoc signed, not notarized)

The macOS app is ad-hoc signed for artifact integrity but not notarized with an Apple Developer ID. Gatekeeper will warn on first launch. After dragging it to Applications, use Finder's Control-click -> Open, or **System Settings > Privacy & Security > Open Anyway**. Do not disable Gatekeeper globally.

## Known limitations

- **Desktop installer icons are still the previous generation** (app-internal icons and web assets are new); refreshing installer/icon assets is post-release work.
- **View-transition click window:** on engines that support same-document View Transitions, clicks within ~300ms of a navigation start can land during the browser's transition freeze window (generic browser behavior, documented tradeoff).
- **Canvas object creation is pointer-only** (double-click / toolbar). Keyboard and screen-reader users can navigate, edit, move, and delete existing canvas objects, but creating new cards / text / shapes currently requires a mouse. VoiceOver real-device verification is still pending.
- AI is optional and user-configured; this release does not imply a provider reliability guarantee.
- Manual on-device walkthroughs (T4/T7/T9 scenarios) are still pending; they do not affect the shipped feature surface.

## Stable scope

"Stable" means the data format (1.1-compatible), core workflow, cys-dsl v8 contract, recovery behavior, automated test baseline, and release build pipeline are frozen for compatible maintenance. It does not claim platform certification or third-party AI reliability.

- macOS Developer ID signing/notarization and Windows Authenticode signing are not present.
- VoiceOver, real operating-system 200% scaling, installation upgrades on a representative device matrix, and real-provider quota/refusal testing remain post-release hardening work.
- AI is optional. Provider requests leave the device only after the user configures and invokes a provider.

Please report the operating system, app version, exact steps, what you expected, and what happened. **Do not include API keys or private card content in a public issue.**
