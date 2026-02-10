# Native Security Modules Setup

This document explains how to enable native security features for SecureShare.

## Overview

SecureShare includes native modules for:
- **Android FLAG_SECURE** - Blocks screenshots and screen recordings
- **iOS Screenshot Detection** - Detects and logs screenshot attempts

These require **Expo Dev Client** (not Expo Go).

---

## Quick Setup

### 1. Install Expo Dev Client

```bash
npx expo install expo-dev-client
```

### 2. Prebuild Native Projects

```bash
# For both platforms
npx expo prebuild

# Or for specific platform
npx expo prebuild --platform android
npx expo prebuild --platform ios
```

### 3. Copy Native Module Files

**Android** (after prebuild):
```bash
cp native/android/FlagSecureModule.kt android/app/src/main/java/com/secureshare/
cp native/android/FlagSecurePackage.kt android/app/src/main/java/com/secureshare/
```

**iOS** (after prebuild):
```bash
cp native/ios/ScreenshotDetectorModule.swift ios/SecureShare/
cp native/ios/ScreenshotDetectorModule.m ios/SecureShare/
```

### 4. Register Android Package

Edit `android/app/src/main/java/com/secureshare/MainApplication.kt`:

```kotlin
override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages
    packages.add(FlagSecurePackage())  // Add this line
    return packages
}
```

### 5. Build Dev Client

```bash
# Android
npx expo run:android

# iOS
npx expo run:ios
```

---

## How It Works

### Android (FLAG_SECURE)
When the viewer opens:
1. `SecurityBridge.enableSecureMode()` is called
2. Native module sets `FLAG_SECURE` on the Activity window
3. Screenshots/recordings show black screen
4. When viewer closes, flag is removed

### iOS (Detection)
When the viewer opens:
1. `SecurityBridge.startScreenshotDetection()` is called
2. Native module listens for `userDidTakeScreenshotNotification`
3. On screenshot: event emitted → content blurred → alert shown → logged
4. Screen recording is also detected via `capturedDidChangeNotification`

---

## Testing

### In Expo Go (Limited)
- Watermarks work ✅
- Analytics work ✅
- FLAG_SECURE unavailable ❌
- Screenshot detection limited ❌

### In Dev Client (Full)
- All features work ✅
- FLAG_SECURE blocks captures ✅
- Screenshot detection with blur ✅

---

## Troubleshooting

**"FlagSecureModule is null"**
- You're in Expo Go, not Dev Client
- Run `npx expo run:android` instead

**"ScreenshotDetectorModule is null"**
- You're in Expo Go, not Dev Client
- Run `npx expo run:ios` instead

**Build fails after copying files**
- Check package name matches `com.secureshare`
- Ensure bridging header exists for iOS

---

## Files Reference

```
native/
├── SecurityBridge.js          # JS interface
├── android/
│   ├── FlagSecureModule.kt    # FLAG_SECURE implementation
│   └── FlagSecurePackage.kt   # React Native package
└── ios/
    ├── ScreenshotDetectorModule.swift  # Screenshot detection
    └── ScreenshotDetectorModule.m      # ObjC bridge

plugins/
└── withSecurityModules.js     # Expo config plugin (auto-setup)
```
