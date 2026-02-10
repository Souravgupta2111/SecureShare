// FlagSecureModule.kt
// Location: android/app/src/main/java/com/secureshare/FlagSecureModule.kt
//
// This native Android module enables FLAG_SECURE to prevent screenshots
// and screen recordings during secure document viewing.
//
// SETUP INSTRUCTIONS:
// 1. Create Expo Dev Client: npx expo prebuild
// 2. Place this file in: android/app/src/main/java/com/secureshare/
// 3. Create FlagSecurePackage.kt (below)
// 4. Register in MainApplication.kt

package com.secureshare

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class FlagSecureModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "FlagSecureModule"

    @ReactMethod
    fun enable(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            activity?.runOnUiThread {
                activity.window?.setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE
                )
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FLAG_SECURE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun disable(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            activity?.runOnUiThread {
                activity.window?.clearFlags(
                    WindowManager.LayoutParams.FLAG_SECURE
                )
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FLAG_SECURE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isEnabled(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            val flags = activity?.window?.attributes?.flags ?: 0
            val isSecure = (flags and WindowManager.LayoutParams.FLAG_SECURE) != 0
            promise.resolve(isSecure)
        } catch (e: Exception) {
            promise.reject("FLAG_SECURE_ERROR", e.message)
        }
    }
}


