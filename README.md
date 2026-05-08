<p align="center">
  <img src="assets/readme-header.png" alt="OpenVoice README header" width="100%">
</p>

# OpenVoice

Free, open-source AI voice dictation for Windows. Speak naturally, get polished text anywhere on your desktop.

[![Release](https://github.com/arash-san/openvoice/actions/workflows/release.yml/badge.svg)](https://github.com/arash-san/openvoice/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

OpenVoice is a lightweight Electron app that uses your own Google Gemini API key for speech transcription and optional AI formatting. It stays out of the way in your tray, listens through global shortcuts, and types the final text into whichever app you are using.

## Features

- System-wide dictation shortcut for typing into any Windows app
- Command mode for voice-driven edits to selected text
- Gemini 3.1 Flash-Lite by default, with filtered model selection for dictation-safe text output models
- Personal dictionary for names, technical terms, and custom vocabulary
- Voice snippets that expand spoken trigger phrases into reusable text
- Floating recording overlay and a quick microphone test panel
- Local retry storage for recordings that fail to process
- In-app update checks backed by GitHub Releases

## Download

Installers are published from tagged releases at [github.com/arash-san/openvoice/releases](https://github.com/arash-san/openvoice/releases).

Packaged builds can check for updates from **Settings -> About -> Updates**. When a release is available, OpenVoice can download it and restart into the new version.

## Requirements

- Windows 10 or newer
- Node.js 18+ for development
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Development

```bash
git clone https://github.com/arash-san/openvoice.git
cd openvoice
npm install
npm start
```

Useful scripts:

```bash
npm run dev       # Start Electron in development mode
npm run build     # Build the Windows installer locally
npm run package   # Build the Windows x64 package
npm run release   # Build and publish to GitHub Releases when GH_TOKEN is set
```

## CI/CD And Updates

The release pipeline lives in `.github/workflows/release.yml`.

1. Bump `package.json` with `npm version patch`, `npm version minor`, or `npm version major`.
2. Push the commit and tag:

   ```bash
   git push origin main --follow-tags
   ```

3. GitHub Actions builds the Windows installer with `electron-builder`.
4. The workflow publishes the installer, blockmap, and `latest.yml` to GitHub Releases.
5. Installed OpenVoice builds use `electron-updater` to check that release feed.

Manual release builds also work from GitHub Actions through **Run workflow**.

## Project Layout

```text
assets/                 App icon and README header
src/main/               Electron main process and updater integration
src/renderer/           App UI, styling, and renderer logic
.github/workflows/      Release automation
```

## Privacy

OpenVoice stores settings locally with `electron-store`. Your Gemini API key stays on your machine and is sent only to Google's Gemini API when you transcribe or format audio.

## License

MIT, see [LICENSE](LICENSE).
