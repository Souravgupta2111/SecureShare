# Screen-Capture Security

SecureShare protects documents in the viewer using [`expo-screen-capture`](https://docs.expo.dev/versions/latest/sdk/screen-capture/),
which ships prebuilt native code. There is **no custom native module to copy or
wire up** and **no config plugin required** — it works in any EAS Dev Client or
store build automatically via autolinking.

## What it does

| Platform | Screenshots | Screen recording | Recent-apps preview |
| -------- | ----------- | ---------------- | ------------------- |
| Android  | Blocked (FLAG_SECURE → black frame) | Blocked | Blanked |
| iOS      | Detected (listener → blur/log/notify) | Blocked (iOS 11+) | — |

> iOS cannot technically *prevent* screenshots; the OS only allows detection.
> This is an Apple platform limitation, documented in `THREAT_MODEL.md`.

## How it's used

- `screens/ViewerScreen.js` calls `usePreventScreenCapture()` at the component
  level, so protection is active for the entire lifetime of the secure viewer.
- `native/SecurityBridge.js` wraps `expo-screen-capture` behind a small,
  stable API (`enableSecureMode`, `disableSecureMode`,
  `startScreenshotDetection`, `stopScreenshotDetection`,
  `checkSecurityCapabilities`, `getSecurityStatusMessage`) so screens don't
  depend on the library directly.

## Building

No extra steps. Because `expo-screen-capture` is a normal dependency, a standard
build picks it up:

```bash
npx expo prebuild --clean   # regenerates native projects
npx expo run:android        # or run:ios
# or, for store builds:
eas build --profile production
```

## Notes

- The forensic **LSB image watermarking** native module lives separately in
  `modules/secure-watermark/` (a local Expo module) and is unrelated to screen
  capture.
- Inside **Expo Go**, some screen-capture APIs are no-ops; use a Dev Client for
  full functionality.
