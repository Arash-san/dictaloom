<p align="center">
  <img src="assets/readme-header.png" alt="Dictaloom README header" width="100%">
</p>

# Dictaloom

Free, open-source AI voice dictation for Windows. Speak naturally, get polished text anywhere on your desktop.

<p>
  <a href="https://github.com/Arash-san/dictaloom/releases/latest">
    <img alt="Download for Windows" src="https://img.shields.io/badge/Download_for_Windows-Dictaloom_Setup-16866e?style=for-the-badge">
  </a>
  <a href="https://github.com/Arash-san/dictaloom/releases">
    <img alt="View releases" src="https://img.shields.io/badge/View_All_Releases-GitHub-c56d2d?style=for-the-badge">
  </a>
</p>

[![Release](https://github.com/Arash-san/dictaloom/actions/workflows/release.yml/badge.svg)](https://github.com/Arash-san/dictaloom/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Dictaloom is a lightweight Electron app that uses your own Google Gemini API key for speech transcription and optional AI formatting. It stays out of the way in your tray, listens through global shortcuts, and types the final text into whichever app you are using.

## Download

Use the **Download for Windows** button above, or open the [latest release](https://github.com/Arash-san/dictaloom/releases/latest).

On the release page, download the file named `Dictaloom-Setup-...exe` from **Assets**. You do not need the source code zip unless you want to build the app yourself.

After installing, Dictaloom can check for updates from **Settings -> About -> Updates** and install new GitHub Releases when they are available.

## Features

- System-wide dictation shortcut for typing into any Windows app
- Command mode for voice-driven edits to selected text
- Gemini 3.1 Flash-Lite by default, with filtered model selection for dictation-safe text output models
- Personal dictionary for names, technical terms, and custom vocabulary
- Voice snippets that expand spoken trigger phrases into reusable text
- One-click copy buttons for saved history entries
- Light and dark themes that follow Windows by default
- Floating recording overlay and a quick microphone test panel
- Local retry storage for recordings that fail to process
- In-app update checks backed by GitHub Releases

## Requirements

- Windows 10 or newer
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

Node.js 18+ is only needed for development.

## First Run

1. Install Dictaloom from the latest GitHub Release.
2. Launch the app and paste your Gemini API key.
3. Choose a Gemini model or keep the default.
4. Use `Ctrl+Shift+Space` to dictate into the active app.
5. Use `Ctrl+Shift+Alt+Space` for command mode when text is selected.

## Development

```bash
git clone https://github.com/arash-san/dictaloom.git
cd dictaloom
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
5. Installed Dictaloom builds use `electron-updater` to check that release feed.

Manual release builds also work from GitHub Actions through **Run workflow**.

## Update Behavior

Dictaloom uses `electron-updater` with GitHub Releases. The release workflow uploads the Windows installer, blockmap, and `latest.yml`; installed builds use that metadata to find and download updates.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes, including the rename from OpenVoice to Dictaloom.

## Project Layout

```text
assets/                 App icon, installer images, and README header
src/main/               Electron main process and updater integration
src/renderer/           App UI, styling, and renderer logic
.github/workflows/      Release automation
```

## Privacy

Dictaloom stores settings locally with `electron-store`. Your Gemini API key stays on your machine and is sent only to Google's Gemini API when you transcribe or format audio.

## License

MIT, see [LICENSE](LICENSE).
