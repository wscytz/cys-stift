# cy's Stift 1.0.0

cy's Stift 1.0.0 is the first stable release of the local-first idea canvas. It freezes the core Capture -> Inbox -> Canvas -> Search/Workbench -> Export and recovery workflow, cys-dsl v4, and the review-before-apply contract for AI-assisted changes.

## Downloads

- **Windows 10/11 x64:** download the NSIS `.exe` installer.
- **macOS Apple Silicon:** download the `.dmg` for Apple Silicon Macs.
- **Checksums:** place the installer or disk image beside `SHA256SUMS.txt`, then verify it before installation.
- **Android:** not included in 1.0.0.

## Highlights

- Capture ideas quickly, keep them in Inbox, and place them on an infinite canvas with reversible batch actions.
- Search and return to a card's canvas context, then continue editing in Workbench.
- Read, edit, preview, copy, and paste cys-dsl v4 through the same plan/confirm/apply boundary.
- Review AI proposals as explicit changes guarded by a base revision; reject, apply, or undo without silent canvas mutation.
- Export and import local data with replace/merge previews, transaction rollback, and a device-local recovery checkpoint.
- Keep card content local by default; external exports redact API keys and media binary data.

## Installation notices

The macOS build is ad-hoc signed for artifact integrity but is not notarized with an Apple Developer ID. Gatekeeper will warn on first launch. After dragging it to Applications, use Finder's Control-click -> Open, or choose Open Anyway in System Settings > Privacy & Security. Do not disable Gatekeeper globally.

The Windows installer is not Authenticode-signed. Microsoft Defender SmartScreen may show an unknown-publisher warning. Verify the checksum before choosing to run it.

## Stable scope and remaining evidence

“Stable” means the 1.0 data format, core workflow, DSL v4 contract, recovery behavior, automated test baseline, and release build pipeline are frozen for compatible maintenance. It does not claim platform certification or third-party AI reliability.

- No external 5-8 person user study was completed before release; this was an explicit release decision, not a passed research gate.
- VoiceOver, real operating-system 200% scaling, installation upgrades on a representative device matrix, and real-provider quota/refusal testing remain post-release hardening work.
- macOS Developer ID signing/notarization and Windows Authenticode signing are not present in 1.0.0.
- AI is optional. Provider requests leave the device only after the user configures and invokes a provider.
