// FlagSecurePackage.kt
// Location: android/app/src/main/java/com/secureshare/FlagSecurePackage.kt
//
// React Native package to register the FlagSecureModule

package com.secureshare

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FlagSecurePackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(FlagSecureModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}

// ============================================
// REGISTRATION IN MainApplication.kt
// ============================================
// Add to getPackages() method:
//
// override fun getPackages(): List<ReactPackage> {
//     val packages = PackageList(this).packages
//     packages.add(FlagSecurePackage())
//     return packages
// }
