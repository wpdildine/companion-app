#import "AtlasNativeMicModule.h"
#import <AVFoundation/AVFoundation.h>
#import <React/RCTLog.h>

@interface AtlasNativeMicModule () <AVAudioRecorderDelegate>
@property (nonatomic, strong) AVAudioRecorder *recorder;
@property (nonatomic, copy) NSString *activeSessionId;
@property (nonatomic, copy) NSString *recordingPath;
@property (nonatomic, assign) BOOL isStopping;
@property (nonatomic, assign) BOOL captureActive;
@property (nonatomic, copy) NSString *lastTerminalSessionId;
@property (nonatomic, assign) BOOL lastTerminalWasFinalize;
@property (nonatomic, assign) BOOL isTornDown;
@end

@implementation AtlasNativeMicModule

RCT_EXPORT_MODULE(AtlasNativeMic);

- (void)deactivateAudioSessionIfNeeded {
  NSError *deactivateErr = nil;
  [[AVAudioSession sharedInstance] setActive:NO
                                 withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                       error:&deactivateErr];
  if (deactivateErr) {
    RCTLogWarn(@"[AtlasNativeMic][E_AUDIO] setActive:NO cleanup failed: %@", deactivateErr);
  }
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"mic_capture_started",
    @"mic_capture_stopping",
    @"mic_capture_finalized",
    @"mic_interruption",
    @"mic_failure",
  ];
}

RCT_EXPORT_METHOD(addListener : (NSString *)eventName) {
}

RCT_EXPORT_METHOD(removeListeners : (NSInteger)count) {
}

- (void)sendMicEvent:(NSString *)type
          sessionId:(NSString *)sessionId
              phase:(NSString *)phase
             extras:(NSDictionary *)extras {
  NSMutableDictionary *body = [@{
    @"sessionId" : sessionId ?: @"",
    @"phase" : phase ?: @"idle",
  } mutableCopy];
  if (extras) {
    [body addEntriesFromDictionary:extras];
  }
  [self sendEventWithName:type body:body];
}

RCT_EXPORT_METHOD(init : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  if (self.isTornDown) {
    reject(@"E_TORN_DOWN", @"AtlasNativeMic torn down", nil);
    return;
  }
  RCTLogInfo(@"[AtlasNativeMic] init");
  resolve(nil);
}

RCT_EXPORT_METHOD(startCapture
                  : (NSString *)sessionId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  if (self.isTornDown) {
    reject(@"E_TORN_DOWN", @"AtlasNativeMic torn down", nil);
    return;
  }
  if (sessionId.length == 0) {
    reject(@"E_INVALID", @"sessionId required", nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.captureActive) {
      if ([self.activeSessionId isEqualToString:sessionId]) {
        RCTLogInfo(@"[AtlasNativeMic][E_DUPLICATE] startCapture no-op same session");
        resolve(nil);
        return;
      }
      reject(@"E_SESSION_ACTIVE", @"Another capture session is active", nil);
      return;
    }

    AVAudioSession *session = [AVAudioSession sharedInstance];
    __block BOOL sessionActivated = NO;
    [session requestRecordPermission:^(BOOL granted) {
      if (!granted) {
        RCTLogError(@"[AtlasNativeMic][E_PERMISSION] denied");
        reject(@"E_PERMISSION", @"Microphone permission denied", nil);
        return;
      }

    NSError *err = nil;
    [session setCategory:AVAudioSessionCategoryPlayAndRecord
             withOptions:AVAudioSessionCategoryOptionAllowBluetooth |
                         AVAudioSessionCategoryOptionDefaultToSpeaker
                   error:&err];
    if (err) {
      RCTLogError(@"[AtlasNativeMic][E_AUDIO] setCategory: %@", err);
      reject(@"E_AUDIO", err.localizedDescription, err);
      return;
    }
    [session setActive:YES withOptions:0 error:&err];
    if (err) {
      RCTLogError(@"[AtlasNativeMic][E_AUDIO] setActive: %@", err);
      reject(@"E_AUDIO", err.localizedDescription, err);
      return;
    }
    sessionActivated = YES;

    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:
                                                 [NSString stringWithFormat:@"atlas_mic_%@.m4a",
                                                                            sessionId]];
    self.recordingPath = path;
    NSURL *url = [NSURL fileURLWithPath:path];

    NSDictionary *settings = @{
      AVFormatIDKey : @(kAudioFormatMPEG4AAC),
      AVSampleRateKey : @44100,
      AVNumberOfChannelsKey : @1,
      AVEncoderAudioQualityKey : @(AVAudioQualityHigh),
    };

    self.recorder = [[AVAudioRecorder alloc] initWithURL:url settings:settings error:&err];
    if (err || !self.recorder) {
      RCTLogError(@"[AtlasNativeMic][E_AUDIO] recorder init: %@", err);
      if (sessionActivated) {
        [self deactivateAudioSessionIfNeeded];
      }
      reject(@"E_AUDIO", err ? err.localizedDescription : @"Recorder init failed", err);
      return;
    }
    self.recorder.delegate = self;
    if (![self.recorder prepareToRecord]) {
      if (sessionActivated) {
        [self deactivateAudioSessionIfNeeded];
      }
      reject(@"E_AUDIO", @"prepareToRecord failed", nil);
      return;
    }
    if (![self.recorder record]) {
      if (sessionActivated) {
        [self deactivateAudioSessionIfNeeded];
      }
      reject(@"E_AUDIO", @"record failed", nil);
      return;
    }

    self.activeSessionId = sessionId;
    self.captureActive = YES;
    self.lastTerminalSessionId = nil;
    self.lastTerminalWasFinalize = NO;

    [self sendMicEvent:@"mic_capture_started"
             sessionId:sessionId
                 phase:@"capturing"
                extras:nil];
    RCTLogInfo(@"[AtlasNativeMic] capture started %@", sessionId);
    resolve(nil);
    }];
  });
}

RCT_EXPORT_METHOD(stopFinalize
                  : (NSString *)sessionId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  if (self.isTornDown) {
    reject(@"E_TORN_DOWN", @"AtlasNativeMic torn down", nil);
    return;
  }
  if (sessionId.length == 0) {
    reject(@"E_INVALID", @"sessionId required", nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.captureActive) {
      if ([self.lastTerminalSessionId isEqualToString:sessionId] && self.lastTerminalWasFinalize) {
        RCTLogInfo(@"[AtlasNativeMic] stopFinalize duplicate silent no-op");
        resolve(@{@"uri" : @"", @"durationMillis" : @0, @"duplicate" : @YES});
        return;
      }
      reject(@"E_NO_SESSION", @"No active capture for sessionId", nil);
      return;
    }
    if (![self.activeSessionId isEqualToString:sessionId]) {
      reject(@"E_NO_SESSION", @"sessionId mismatch", nil);
      return;
    }

    self.isStopping = YES;
    [self sendMicEvent:@"mic_capture_stopping"
             sessionId:sessionId
                 phase:@"stopping"
                extras:nil];

    NSTimeInterval seconds = self.recorder.currentTime;
    [self.recorder stop];
    self.recorder = nil;
    self.captureActive = NO;
    self.activeSessionId = nil;
    self.isStopping = NO;

    NSError *err = nil;
    [[AVAudioSession sharedInstance] setActive:NO
                                   withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                         error:&err];

    long ms = (long)lround(seconds * 1000.0);
    NSString *uri = self.recordingPath ?: @"";
    self.recordingPath = nil;

    self.lastTerminalSessionId = sessionId;
    self.lastTerminalWasFinalize = YES;

    [self sendMicEvent:@"mic_capture_finalized"
             sessionId:sessionId
                 phase:@"finalized"
                extras:nil];

    RCTLogInfo(@"[AtlasNativeMic] capture finalized %@ ms=%ld", sessionId, (long)ms);
    resolve(@{
      @"uri" : uri,
      @"durationMillis" : @(ms),
      @"duplicate" : @NO,
    });
  });
}

RCT_EXPORT_METHOD(cancel
                  : (NSString *)sessionId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  if (self.isTornDown) {
    RCTLogInfo(@"[AtlasNativeMic] cancel duplicate silent no-op (torn down)");
    resolve(nil);
    return;
  }
  if (sessionId.length == 0) {
    reject(@"E_INVALID", @"sessionId required", nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.captureActive) {
      if ([self.lastTerminalSessionId isEqualToString:sessionId]) {
        RCTLogInfo(@"[AtlasNativeMic] cancel duplicate silent no-op");
        resolve(nil);
        return;
      }
      reject(@"E_NO_SESSION", @"No active capture for sessionId", nil);
      return;
    }
    if (![self.activeSessionId isEqualToString:sessionId]) {
      reject(@"E_NO_SESSION", @"sessionId mismatch", nil);
      return;
    }

    [self.recorder stop];
    self.recorder = nil;
    self.captureActive = NO;
    self.activeSessionId = nil;
    NSString *path = self.recordingPath;
    self.recordingPath = nil;
    if (path.length) {
      [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
    }

    NSError *err = nil;
    [[AVAudioSession sharedInstance] setActive:NO
                                   withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                         error:&err];

    self.lastTerminalSessionId = sessionId;
    self.lastTerminalWasFinalize = NO;

    [self sendMicEvent:@"mic_failure"
             sessionId:sessionId
                 phase:@"cancelled"
                extras:@{
                  @"code" : @"E_CANCELLED",
                  @"classification" : @"hardware_session",
                }];
    RCTLogInfo(@"[AtlasNativeMic] capture cancelled %@", sessionId);
    resolve(nil);
  });
}

RCT_EXPORT_METHOD(teardown : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.recorder != nil) {
      [self.recorder stop];
      self.recorder = nil;
    }
    self.captureActive = NO;
    self.activeSessionId = nil;
    if (self.recordingPath.length) {
      [[NSFileManager defaultManager] removeItemAtPath:self.recordingPath error:nil];
    }
    self.recordingPath = nil;
    self.isTornDown = YES;
    [[AVAudioSession sharedInstance] setActive:NO
                                   withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                         error:nil];
    RCTLogInfo(@"[AtlasNativeMic] teardown");
    resolve(nil);
  });
}

RCT_EXPORT_METHOD(getDebugInfo : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  NSString *s = [NSString stringWithFormat:
                              @"AtlasNativeMic iOS captureActive=%d activeSession=%@ tornDown=%d",
                              self.captureActive,
                              self.activeSessionId ?: @"(nil)",
                              self.isTornDown];
  resolve(s);
}

@end
