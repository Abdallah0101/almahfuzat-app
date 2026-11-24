# Mahfuzat Android

Mahfuzat is an Arabic RTL app built with Ionic 9, Angular 22, and Capacitor 8. It stores public poems and personal progress in SQLite. Recordings remain in app-private storage and are never uploaded with the public content.

## Install

Download the verified APK from the [latest release](https://github.com/Abdallah0101/almahfuzat-app/releases/latest). Install it over an existing version without uninstalling to preserve recordings and progress. Create a ZIP backup before upgrading.

The app reads public content from:

```text
https://abdallah0101.github.io/almahfuzat-content
```

No GitHub account, API token, backend, or audio subscription is required.

## Working features

- Arabic library search, science filters, memorization statistics, adjustable font size, bottom navigation, a visual progress dashboard, bundled Noto Sans Arabic typography, and a persistent dark theme.
- Stable `(poem_id, verse_id)` identity for recordings and memorization state.
- AAC/M4A recording per verse, preview, replacement, and optional recording history.
- Media3 playlists with verse/group repeats, silence gaps, speed control, audio focus, and background playback.
- WAV export using decoded PCM samples rather than binary file concatenation. Exported audio is saved in the public `Download/AlMahfuzat` folder and shared through an Android content URI with read permission.
- Daily review goals and simple spaced repetition.
- Saved custom playlists and offline playback/export.
- ZIP backup and non-destructive restore with per-file SHA-256 verification.

Native Android code lives in `android/app/src/main/java/org/mahfuzat/app/`:

- `AudioPlugin.java`: recording and playback plugin bridge.
- `PlaybackService.java`: Media3/ExoPlayer and MediaSessionService.
- `WavExporter.java`: streaming MediaCodec decode and PCM WAV output.
- `BackupPlugin.java`: streaming ZIP creation and verified restore.

## Content editing

The content repository is [Abdallah0101/almahfuzat-content](https://github.com/Abdallah0101/almahfuzat-content). The owner edits through the personal assistant on Telegram or directly in VS Code, runs validation, and pushes to `main`. GitHub Actions publishes the catalog.

The standalone Telegram bridge is removed and is not part of this app. Do not restore it unless the owner explicitly requests it.

## Development

Requirements: Node.js 24.15+ (or 22.22.3+), JDK 21, and Android SDK 36.

```sh
npm ci
npm test
npm run build
npx cap sync android
```

For browser UI development, run `npm start`. Web SQLite uses `jeep-sqlite` and `sql.js`; native recording, Media3, WAV export, and backup require Android.

## Build and install an APK

Set `ANDROID_HOME` to the Android SDK and `JAVA_HOME` to JDK 21, then run:

```sh
npm run android:apk
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install through ADB:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Debug builds use the local Android debug signing key. Production distribution requires a private release keystore; never commit it or its passwords.

## Synchronization and data safety

The app checks `manifest.json` at startup, on resume, and every 15 minutes while visible. When `catalog_version` changes, it downloads only changed poems, validates schemas and SHA-256 hashes, and applies updates in a transaction. Failed downloads leave existing data intact.

Changing a verse marks its recording with `text_changed`. Removing a verse archives its recording instead of deleting it. Personal data is linked by stable IDs, never by verse number alone.

See [TESTING.md](TESTING.md) for verification commands and results.
