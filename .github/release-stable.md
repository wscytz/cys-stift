# cy's Stift {{VERSION}}

cy's Stift {{VERSION}} is the stable release of the local-first idea canvas. Capture -> Inbox -> Canvas -> Workbench -> Export and recovery stays fully on your machine; the app sends nothing to a server and collects no usage telemetry.

{{VERSION}} = the 1.3.0 feature core plus the **Swiss Editorial redesign** (design system v0.2: warm paper / surgical red / ink / petrol blue, zero radius, 1px line hierarchy, 280/64/48 editorial grid; complete visual rebuild of the component library and app shell) and a full **motion pass** (same-document View Transitions routing on supporting engines with an editorial page-enter fallback elsewhere, per-session home choreography, play-once list entrances, graph node fade-in, a shared-element canvas-name transition, unified press feedback, and tactile flash on filters). The change surface is UI-only: domain / db / desktop logic and the data format are untouched, and saved user settings survive (legacy palette names are frozen as aliases). Rule-driven review sweeps ran over the whole branch (first round: tokenization fix; second round: 1 P2 + 1 P3 + minor cleanups, all fixed with regression tests). Release baseline re-verified at tagging: lint clean, full test suite green (domain 87 + canvas-engine 586 + cys-dsl 405 + db 8 + web 1848), web build exit 0 with zero warnings, browser-level motion assertions 17/17, docs link check passing, deployed web build verified over HTTPS on 12 routes.

## Downloads

- **Windows 10/11 x64:** NSIS `.exe` installer.
- **macOS Apple Silicon:** `.dmg`.
- **Checksums:** `SHA256SUMS.txt` to verify each download.
- **Android:** not in this release.

## Highlights

- **Swiss Editorial UI (new in {{VERSION}}):** editorial sidebar with 64px collapsed icon rail (hover/focus overlay expand, pin to keep), editorial home (topbar crumb + sync dot, large date anchor, section numbering), re-skinned toolbar / modals / lists / settings, and a consistent motion system driven by shared timing tokens mirrored across three sources.
- **Structured canvas cards:** the canvas can be written as plain text (DSL). Cards carry `@type` / `@tags` / `@links` / `@code` / `@quote` as structured fields — multiple code blocks and quotes per card round-trip cleanly. The canvas stays fully text-editable and diff-friendly.
- **Capture -> Inbox -> Canvas:** quick capture, reversible batch actions, an infinite canvas with arrows, freeform, and outline/minimap.
- **Workbench:** Source / Split / Preview Markdown (code highlighting, math, footnotes).
- **AI (optional):** OpenAI / Anthropic / Ollama providers; DeepSeek and Qwen via the OpenAI-compatible path with per-endpoint thinking-mode handling; AI outlines and edits go through a plan / confirm / apply boundary with undo. AI is opt-in and never required for core use.
- **Local-first and recoverable:** JSON import/export with replace/merge previews, transaction rollback, and a device-local recovery checkpoint before imports. Exports redact API keys and media binary data.
- **Hardening carried from 1.3.0:** poisoned-storage guards, field-level settings recovery, dual-tab edit conflict protection, canvas-deletion orphan cleanup, and AI failure classification.
- **Web test build:** one-command deploy with backup and HTTPS route verification (`deploy:web`), driven by the same static export as this release.

## Windows notice (no code signing)

The Windows installer is **not** signed with an Authenticode certificate. Windows SmartScreen may show "Windows protected your PC" on first launch. Choose **More info -> Run anyway**. Verify the checksum before running it.

## macOS notice (ad-hoc signed, not notarized)

The macOS app is ad-hoc signed for artifact integrity but not notarized with an Apple Developer ID. Gatekeeper will warn on first launch. After dragging it to Applications, use Finder's Control-click -> Open, or **System Settings > Privacy & Security > Open Anyway**. Do not disable Gatekeeper globally.

## Known limitations

- **Desktop installer icons are still the previous generation** (app-internal icons and web assets are new); refreshing installer/icon assets is post-release work.
- **View-transition click window:** on engines that support same-document View Transitions, clicks within ~300ms of a navigation start can land during the browser's transition freeze window (generic browser behavior, documented tradeoff).
- **Canvas object creation is pointer-only** (double-click / toolbar). Keyboard and screen-reader users can navigate, edit, move, and delete existing canvas objects, but creating new cards / text / shapes currently requires a mouse. VoiceOver real-device verification is still pending.
- Settings/vault/network PRD-specific layouts intentionally ship on the shared pattern for now.
- AI is optional and user-configured; this release does not imply a provider reliability guarantee.
- Manual on-device walkthroughs (T4/T7/T9 scenarios) are still pending; they do not affect the shipped feature surface.

## Stable scope

"Stable" means the data format (1.1-compatible), core workflow, cys-dsl v8 contract, recovery behavior, automated test baseline, and release build pipeline are frozen for compatible maintenance. It does not claim platform certification or third-party AI reliability.

- macOS Developer ID signing/notarization and Windows Authenticode signing are not present.
- VoiceOver, real operating-system 200% scaling, installation upgrades on a representative device matrix, and real-provider quota/refusal testing remain post-release hardening work.
- AI is optional. Provider requests leave the device only after the user configures and invokes a provider.

Please report the operating system, app version, exact steps, what you expected, and what happened. **Do not include API keys or private card content in a public issue.**
