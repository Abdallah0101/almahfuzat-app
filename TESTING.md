# Mahfuzat testing

## Local checks

```sh
npm test
npm run build
npx cap sync android
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
```

With an Android device or emulator connected:

```sh
adb devices
./gradlew :app:connectedDebugAndroidTest
```

Playback and export tests can run with airplane mode enabled to verify offline behavior. Restore network connectivity afterward.

## Automated coverage

- Content schema validation and Arabic search normalization.
- Incremental poem additions without duplicate verses.
- Text changes that preserve recordings and set `text_changed`.
- Middle insertion that preserves stable verse IDs and recording links.
- SHA-256 mismatch rejection without damaging the previous catalog.
- Recording replacement with and without history retention.
- Backup restore into a fresh database, idempotency, and conflict handling.
- Native AAC recording, sequential Media3 playback, repeats, background/screen-off playback, WAV export, and ZIP restore.

## Verified results on 2026-11-23

- All 14 app unit/integration tests passed.
- All 5 content repository tests passed.
- Three Android instrumentation tests passed on Pixel 4 API 34 with airplane mode and Wi-Fi disabled.
- Library and poem screens were opened on Android, including hemistichs and recording controls.
- The Save crash was reproduced in 1.0.1: `FilesystemPlugin.mkdir` failed with `NoClassDefFoundError` for Kotlin `SpillingKt` because the build forced Kotlin 1.8.22.
- The dependency fix preserves Kotlin 2.2.20. The complete record, stop, and Save flow was repeated successfully in 1.0.2: directory creation, file rename, and transactional SQLite insert completed without closing the app.

## Manual checks before production distribution

- Test the physical-device microphone, lock-screen notification, Bluetooth headset controls, and audio focus during calls or other media.
- Share WAV and ZIP files through Telegram or another Android app.
- Restore a ZIP backup on a fresh installation.
- Exercise large playlists and long exports. WAV is uncompressed and the exporter rejects output beyond the RIFF size limit instead of producing a corrupt file.
- Verify that content pushes publish successfully through GitHub Actions and appear after app synchronization.
