# cy's Stift 1.0.0-preview.1

This is an installable preview for the core local-first workflow:

Capture -> Inbox -> Canvas -> Search/Workbench -> Export and recovery.

## Downloads

- **Windows 10/11 x64:** download the NSIS `.exe` installer.
- **macOS Apple Silicon:** download the `.dmg` for Apple Silicon Macs.
- **Checksums:** use `SHA256SUMS.txt` to verify the downloaded installer or disk image.
- **Android:** not included in this preview release.

## macOS preview notice

The macOS app is ad-hoc signed for artifact integrity, but it is not notarized with an Apple Developer ID. Gatekeeper will warn on the first launch. After dragging it to Applications, use Finder's Control-click -> Open, or choose Open Anyway in System Settings > Privacy & Security. Do not disable Gatekeeper globally.

## What to test

1. Capture two short ideas in sequence, then confirm both remain in Inbox.
2. Send two Inbox cards to a canvas, undo once, and confirm the cards return.
3. Search for a card on a canvas, open it in Workbench, edit it, then return to the canvas.
4. Export data, import with Replace, inspect the checkpoint, then restore it.
5. With a configured AI provider, create a proposal, reject or apply it, and verify undo leaves no unwanted object.

Please report the operating system, app version, exact steps, what you expected, and what happened. Do not include API keys or private card content in a public issue.

## Known preview boundaries

- Data is local-first; external JSON exports redact API keys and media binary data.
- AI is optional and must be configured by the user. Preview testing does not imply a provider reliability guarantee.
- This is not the stable 1.0 release. Apple Developer signing/notarization, VoiceOver and system 200% zoom checks, real-provider quota evidence, and external user research remain stable-release gates.
