# Android Voice & Notifications Setup

This app supports native voice recognition, text-to-speech (TTS), and local notifications via Capacitor plugins. If you see errors like "plugin is not implemented on android", follow these steps.

## Required Plugins

Install these packages in the project (web) and bridge them into the Android app:

- Speech Recognition: @capacitor-community/speech-recognition
- Text To Speech: @capacitor-community/text-to-speech
- Local Notifications: @capacitor/local-notifications

## Installation Steps

1) Install NPM packages

```powershell
npm i @capacitor-community/speech-recognition @capacitor-community/text-to-speech @capacitor/local-notifications
```

2) Sync native projects

```powershell
npx cap sync android
```

3) Open Android project and rebuild

```powershell
npx cap open android
# Build/Run from Android Studio on a device/emulator
```

If you already had Android Studio open, click "Sync Project with Gradle Files".

## Android Permissions

Ensure the following permissions are present (Gradle/plugin adds them automatically in most cases, but verify in AndroidManifest.xml after syncing):

- RECORD_AUDIO (speech recognition)
- POST_NOTIFICATIONS (Android 13+ notifications)

## Runtime Permissions

- The app requests microphone permission at runtime via the SpeechRecognition plugin when available.
- For notifications on Android 13+, the app requests notification permission via LocalNotifications.requestPermissions().

## Common Issues

- plugin is not implemented on android
  - Cause: Native plugin not bridged. Fix: run `npx cap sync android` and rebuild.
- Speech Synthesis not available (WebView)
  - Some WebViews don’t provide the Web Speech API. The app falls back to toasts.
- InvalidStateError: recognition has already started
  - Browser quirk when starting recognition twice. The app now guards these starts; if you still see it, try tapping mic once and wait for the listening indicator.

## Dev Server vs Native APK

- When running in a mobile browser or a WebView pointed at the dev server, native plugins are not available. Build and run the native APK for full voice/TTS/notifications.

## Verification Checklist

- Open the app on Android (native build).
- Tap the floating mic; listening indicator should appear. Speak a simple command (e.g., "Show device status").
- App speaks a response via Android TTS or Capacitor TTS.
- Trigger a bulk action; app asks for confirmation; saying "yes" proceeds.
- Change a role permission; a local notification appears (Android 13+ requires permission first).

If problems persist, capture logcat output and share the console logs from the app for analysis.