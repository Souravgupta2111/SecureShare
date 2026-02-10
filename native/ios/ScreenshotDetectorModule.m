// ScreenshotDetectorModule.m
// Location: ios/SecureShare/ScreenshotDetectorModule.m
//
// Objective-C bridge for the Swift ScreenshotDetectorModule
// Required for React Native to find the Swift module

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (ScreenshotDetectorModule, RCTEventEmitter)

RCT_EXTERN_METHOD(isScreenRecording : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)

@end