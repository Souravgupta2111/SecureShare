// ScreenshotDetectorModule.swift
// Location: ios/SecureShare/ScreenshotDetectorModule.swift
//
// Native iOS module for screenshot and screen recording detection
//
// SETUP INSTRUCTIONS:
// 1. Run: npx expo prebuild --platform ios
// 2. Place this file in: ios/SecureShare/
// 3. Create ScreenshotDetectorModule.m bridge file (below)
// 4. Add to Xcode project

import Foundation
import UIKit
import React

@objc(ScreenshotDetectorModule)
class ScreenshotDetectorModule: RCTEventEmitter {
    
    private var hasListeners = false
    
    override init() {
        super.init()
        setupNotificationObservers()
    }
    
    override static func moduleName() -> String! {
        return "ScreenshotDetectorModule"
    }
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String]! {
        return ["onScreenshot", "onRecording"]
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    private func setupNotificationObservers() {
        // Screenshot detection
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenshotDetected),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )
        
        // Screen recording detection (iOS 11+)
        if #available(iOS 11.0, *) {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(screenRecordingChanged),
                name: UIScreen.capturedDidChangeNotification,
                object: nil
            )
        }
    }
    
    @objc private func screenshotDetected() {
        if hasListeners {
            sendEvent(withName: "onScreenshot", body: [
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        }
    }
    
    @objc private func screenRecordingChanged() {
        if #available(iOS 11.0, *) {
            if UIScreen.main.isCaptured {
                if hasListeners {
                    sendEvent(withName: "onRecording", body: [
                        "timestamp": Date().timeIntervalSince1970 * 1000,
                        "isRecording": true
                    ])
                }
            }
        }
    }
    
    @objc func isScreenRecording(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 11.0, *) {
            resolve(UIScreen.main.isCaptured)
        } else {
            resolve(false)
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
