#import "PiperTtsModule.h"
#import <AVFoundation/AVFoundation.h>
#import <React/RCTLog.h>
#if __has_include("PiperTts/PiperTts.h")
#import "PiperTts/PiperTts.h"
#endif

#import "piper_engine.h"
#include <string>
#include <vector>

@interface PiperTtsModule ()
@property (nonatomic, strong) AVAudioEngine *playbackEngine;
@property (nonatomic, strong) AVAudioPlayerNode *playbackPlayer;
/* Last playback buffer/format diagnostics (bubbled to JS via getDebugInfo). */
@property (nonatomic) NSUInteger lastAudioSampleCount;
@property (nonatomic) NSUInteger lastSampleRate;
@property (nonatomic) double lastExpectedDurationSec;
@property (nonatomic) NSUInteger lastPcmBytes;
@property (nonatomic) NSUInteger lastPcmLength;
@property (nonatomic) double lastEngineOutputSampleRate;
@property (nonatomic) double lastFormatSampleRate;
@property (nonatomic) uint32_t lastBufferFrameLength;
@property (nonatomic) double lastBufferFormatSampleRate;
@end

@implementation PiperTtsModule

#if __has_include("PiperTts/PiperTts.h")
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativePiperTtsSpecJSI>(params);
}
#endif

+ (NSString *)piperModelPathInBundle:(NSBundle *)bundle {
  NSString *path = [bundle pathForResource:@"model" ofType:@"onnx"];
  if (path.length) {
    RCTLogInfo(@"[PiperTts] model.onnx found at %@", path);
    return path;
  }
  path = [bundle pathForResource:@"model" ofType:@"onnx" inDirectory:@"piper"];
  if (path.length) {
    RCTLogInfo(@"[PiperTts] model.onnx found in piper/ at %@", path);
    return path;
  }
  path = [bundle pathForResource:@"model" ofType:@"onnx" inDirectory:@"Resources/piper"];
  if (path.length) RCTLogInfo(@"[PiperTts] model.onnx found in Resources/piper");
  if (!path.length) RCTLogWarn(@"[PiperTts] model.onnx not found in bundle %@", bundle.bundlePath);
  return path ?: @"";
}

+ (NSString *)piperConfigPathInBundle:(NSBundle *)bundle {
  NSString *path = [bundle pathForResource:@"model.onnx" ofType:@"json"];
  if (path.length) return path;
  path = [bundle pathForResource:@"model.onnx" ofType:@"json" inDirectory:@"piper"];
  if (path.length) return path;
  path = [bundle pathForResource:@"model.onnx" ofType:@"json" inDirectory:@"Resources/piper"];
  return path ?: @"";
}

// Directory containing espeak-ng data (lang/, voices/; phontab if present). Run scripts/download-espeak-ng-data.sh.
// CocoaPods may place resources under full paths, so we search the bundle for a dir named "espeak-ng-data".
+ (NSString *)espeakDataPathInBundle:(NSBundle *)bundle {
  NSString *dir = nil;
  // 1) Standard locations (flat or under Resources/)
  NSString *file = [bundle pathForResource:@"phontab" ofType:nil inDirectory:@"espeak-ng-data"];
  if (file.length) dir = [file stringByDeletingLastPathComponent];
  if (!dir.length) {
    file = [bundle pathForResource:@"phontab" ofType:nil inDirectory:@"Resources/espeak-ng-data"];
    if (file.length) dir = [file stringByDeletingLastPathComponent];
  }
  if (!dir.length) {
    NSString *res = [bundle resourcePath];
    if (res.length) {
      NSString *candidate = [res stringByAppendingPathComponent:@"espeak-ng-data"];
      if ([[NSFileManager defaultManager] fileExistsAtPath:candidate]) dir = candidate;
      if (!dir.length) {
        candidate = [res stringByAppendingPathComponent:@"ios/Resources/espeak-ng-data"];
        if ([[NSFileManager defaultManager] fileExistsAtPath:candidate]) dir = candidate;
      }
    }
  }
  if (!dir.length) {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSString *res = [bundle resourcePath];
    NSDirectoryEnumerator *enumerator = [fm enumeratorAtPath:res];
    NSString *subpath;
    while ((subpath = [enumerator nextObject]) != nil) {
      if ([[subpath lastPathComponent] isEqualToString:@"espeak-ng-data"]) {
        NSString *candidate = [res stringByAppendingPathComponent:subpath];
        BOOL isDir = NO;
        if ([fm fileExistsAtPath:candidate isDirectory:&isDir] && isDir) {
          dir = candidate;
          break;
        }
      }
    }
  }
  if (dir.length) {
    RCTLogInfo(@"[PiperTts] espeak-ng-data found at %@", dir);
  } else {
    RCTLogWarn(@"[PiperTts] espeak-ng-data not found in bundle %@", bundle.bundlePath);
  }
  return dir ?: @"";
}

RCT_EXPORT_MODULE(PiperTts)

// Selectors must match TurboModule spec: resolve:/reject: (not resolver:/rejecter:)
RCT_EXPORT_METHOD(speak:(NSString *)text
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  if (!text || text.length == 0) {
    RCTLogWarn(@"[PiperTts][E_INVALID] Text is empty");
    reject(@"E_INVALID", @"Text is empty", nil);
    return;
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    [self speakOffMain:text resolver:resolve rejecter:reject];
  });
}

- (void)speakOffMain:(NSString *)text
            resolver:(RCTPromiseResolveBlock)resolve
            rejecter:(RCTPromiseRejectBlock)reject
{
  NSBundle *appBundle = [NSBundle mainBundle];
  RCTLogInfo(@"[PiperTts] speak: checking bundle %@", appBundle.bundlePath);
  NSString *modelPath = [PiperTtsModule piperModelPathInBundle:appBundle];
  NSString *configPath = [PiperTtsModule piperConfigPathInBundle:appBundle];
  NSString *espeakDataPath = [PiperTtsModule espeakDataPathInBundle:appBundle];

  if (!modelPath.length || !configPath.length) {
    RCTLogError(@"[PiperTts][E_NO_MODEL] model or config missing: model=%d config=%d", (int)modelPath.length, (int)configPath.length);
    reject(@"E_NO_MODEL", @"Piper model not found. Run scripts/download-piper-voice.sh", nil);
    return;
  }
  if (!espeakDataPath.length) {
    RCTLogError(@"[PiperTts][E_NO_ESPEAK_DATA] espeak-ng-data not found. Run scripts/download-espeak-ng-data.sh");
    reject(@"E_NO_ESPEAK_DATA", @"espeak-ng-data not found. Run scripts/download-espeak-ng-data.sh", nil);
    return;
  }

  RCTLogInfo(@"[PiperTts] synthesizing (length %lu) via C++ pipeline", (unsigned long)text.length);

  std::string model_path([modelPath UTF8String]);
  std::string config_path([configPath UTF8String]);
  std::string espeak_path([espeakDataPath UTF8String]);
  std::string text_utf8([text UTF8String]);
  std::vector<int16_t> pcm;
  int sample_rate = 0;
  piper::SynthesizeError synthError = piper::SynthesizeError::kNone;

  bool ok = piper::synthesize(model_path, config_path, espeak_path, text_utf8, pcm, sample_rate, &synthError);
  if (!ok || pcm.empty() || sample_rate <= 0) {
    NSString *message = nil;
    switch (synthError) {
      case piper::SynthesizeError::kEspeakNotLinked:
        message = @"Piper was built without espeak-ng. Run: PIPER_USE_ESPEAK=1 pod install, then rebuild.";
        break;
      case piper::SynthesizeError::kEspeakInitFailed:
        message = @"espeak-ng init failed. Run scripts/download-espeak-ng-data.sh (with cmake) to build phontab/phondata, then rebuild the app.";
        break;
      case piper::SynthesizeError::kEspeakSetVoiceFailed:
        message = @"espeak-ng set voice failed. Check that espeak-ng-data includes the voice (e.g. en-us).";
        break;
      case piper::SynthesizeError::kPhonemeIdsEmpty:
        message = @"Phonemization produced no phoneme ids. Check espeak-ng-data and config phoneme_id_map.";
        break;
      case piper::SynthesizeError::kOrtCreateSessionFailed:
        message = @"ONNX session creation failed. Check model path and onnxruntime.";
        break;
      case piper::SynthesizeError::kOrtRunInferenceFailed:
        message = @"ONNX inference returned no audio. Check model and phoneme ids.";
        break;
      case piper::SynthesizeError::kConfigOpenFailed:
        message = @"Piper config file could not be opened.";
        break;
      case piper::SynthesizeError::kConfigParseFailed:
        message = @"Piper config file is invalid JSON.";
        break;
      case piper::SynthesizeError::kInvalidArgs:
        message = @"Synthesis invalid arguments (model/config/text path or text empty).";
        break;
      default:
        message = @"Synthesis failed. Run scripts/download-espeak-ng-data.sh with cmake, then rebuild.";
        break;
    }
    RCTLogError(@"[PiperTts][E_SYNTHESIS] %@", message);
    reject(@"E_SYNTHESIS", message, nil);
    return;
  }

  NSUInteger sampleCount = pcm.size();
  NSData *pcmData = [NSData dataWithBytes:pcm.data() length:sampleCount * sizeof(int16_t)];
  double expectedDurationSec = (double)sampleCount / (double)sample_rate;

  self.lastAudioSampleCount = sampleCount;
  self.lastSampleRate = (NSUInteger)sample_rate;
  self.lastExpectedDurationSec = expectedDurationSec;
  self.lastPcmBytes = sampleCount * 2;
  self.lastPcmLength = pcmData.length;
  self.lastEngineOutputSampleRate = 0; /* set in playPcm */

  NSData *pcmCopy = [pcmData copy];
  dispatch_async(dispatch_get_main_queue(), ^{
    [self playPcm:pcmCopy sampleRate:(unsigned)sample_rate resolver:resolve rejecter:reject];
  });
}

// Reusable engine/player; resample to ACTUAL engine output sample rate (no hardcoded 48k).
- (void)playPcm:(NSData *)pcm
     sampleRate:(unsigned)sampleRate
       resolver:(RCTPromiseResolveBlock)resolve
       rejecter:(RCTPromiseRejectBlock)reject
{
  if (!pcm.length || sampleRate == 0) {
    reject(@"E_AUDIO", @"Invalid PCM or sampleRate", nil);
    return;
  }
  if (sampleRate < 8000 || sampleRate > 192000) {
    reject(@"E_AUDIO", [NSString stringWithFormat:@"Sample rate %u out of range", sampleRate], nil);
    return;
  }

  NSError *err = nil;

  // 1) Audio session
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayback
                  mode:AVAudioSessionModeDefault
               options:0
                 error:&err];
  if (err) { reject(@"E_AUDIO", err.localizedDescription ?: @"setCategory failed", err); return; }

  err = nil;
  [session setPreferredSampleRate:48000.0 error:&err];

  err = nil;
  [session setActive:YES
         withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
               error:&err];
  if (err) { reject(@"E_AUDIO", err.localizedDescription ?: @"setActive failed", err); return; }

  // 2) Ensure engine/player exist and are attached
  if (!self.playbackEngine) {
    self.playbackEngine = [[AVAudioEngine alloc] init];
  }
  if (!self.playbackPlayer) {
    self.playbackPlayer = [[AVAudioPlayerNode alloc] init];
    [self.playbackEngine attachNode:self.playbackPlayer];
  } else {
    if (![self.playbackEngine.attachedNodes containsObject:self.playbackPlayer]) {
      [self.playbackEngine attachNode:self.playbackPlayer];
    }
  }

  AVAudioEngine *engine = self.playbackEngine;
  AVAudioPlayerNode *player = self.playbackPlayer;
  AVAudioMixerNode *mixer = engine.mainMixerNode;

  // 3) Stop engine before reconnecting graph (avoids crash when changing format)
  if (engine.isRunning) {
    [player stop];
    [engine stop];
  }

  // 4) Connect player to mixer; we'll feed float32 @ 48k so connect with that
  const double kPlaybackRate = 48000.0;
  AVAudioFormat *playbackFormat =
    [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                     sampleRate:kPlaybackRate
                                       channels:1
                                    interleaved:NO];
  if (!playbackFormat) { reject(@"E_AUDIO", @"Invalid playback format", nil); return; }
  [engine disconnectNodeOutput:player];
  [engine connect:player to:mixer format:playbackFormat];

  // 5) Start engine
  err = nil;
  if (![engine startAndReturnError:&err]) {
    reject(@"E_AUDIO", err.localizedDescription ?: @"Engine start failed", err);
    return;
  }

  // 6) Build SOURCE buffer (Piper PCM): int16 mono at sampleRate (non-interleaved for reliable channelData[0])
  const NSUInteger srcFramesU = pcm.length / sizeof(int16_t);
  if (srcFramesU == 0 || srcFramesU > 0x7FFFFFFF) {
    reject(@"E_AUDIO", @"Invalid PCM frame count", nil);
    return;
  }
  const AVAudioFrameCount srcFrames = (AVAudioFrameCount)srcFramesU;

  AVAudioFormat *srcFormat =
    [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16
                                     sampleRate:(double)sampleRate
                                       channels:1
                                    interleaved:NO];
  if (!srcFormat) { reject(@"E_AUDIO", @"Invalid source format", nil); return; }

  AVAudioPCMBuffer *srcBuffer =
    [[AVAudioPCMBuffer alloc] initWithPCMFormat:srcFormat frameCapacity:srcFrames];
  if (!srcBuffer) {
    reject(@"E_AUDIO", @"Source buffer alloc failed", nil);
    return;
  }
  int16_t *channel0 = srcBuffer.int16ChannelData[0];
  if (!channel0) {
    reject(@"E_AUDIO", @"Source buffer channel data nil", nil);
    return;
  }
  srcBuffer.frameLength = srcFrames;
  memcpy(channel0, pcm.bytes, pcm.length);

  // 7) Convert Piper PCM (int16 @ sampleRate) -> float32 @ 48k to match connected format
  AVAudioPCMBuffer *toPlay = nil;

  {
    AVAudioConverter *converter = [[AVAudioConverter alloc] initFromFormat:srcFormat toFormat:playbackFormat];
    if (!converter) { reject(@"E_AUDIO", @"AVAudioConverter init failed", nil); return; }

    const double ratio = playbackFormat.sampleRate / srcFormat.sampleRate;
    const AVAudioFrameCount dstCap = (AVAudioFrameCount)ceil((double)srcFrames * ratio) + 256;

    AVAudioPCMBuffer *dstBuffer =
      [[AVAudioPCMBuffer alloc] initWithPCMFormat:playbackFormat frameCapacity:dstCap];
    if (!dstBuffer || !dstBuffer.floatChannelData[0]) {
      reject(@"E_AUDIO", @"Destination buffer alloc failed", nil);
      return;
    }

    __block BOOL inputProvided = NO;
    AVAudioConverterInputBlock inputBlock =
      ^AVAudioBuffer * _Nullable(AVAudioPacketCount inPackets, AVAudioConverterInputStatus *outStatus) {
        if (inputProvided) {
          *outStatus = AVAudioConverterInputStatus_EndOfStream;
          return nil;
        }
        inputProvided = YES;
        *outStatus = AVAudioConverterInputStatus_HaveData;
        return srcBuffer;
      };

    NSError *convertErr = nil;
    AVAudioConverterOutputStatus status =
      [converter convertToBuffer:dstBuffer error:&convertErr withInputFromBlock:inputBlock];

    if (status != AVAudioConverterOutputStatus_HaveData &&
        status != AVAudioConverterOutputStatus_EndOfStream) {
      reject(@"E_AUDIO",
             convertErr.localizedDescription ?: [NSString stringWithFormat:@"convertToBuffer failed (status=%ld)", (long)status],
             convertErr);
      return;
    }

    if (dstBuffer.frameLength == 0) {
      AVAudioFrameCount fallback = (AVAudioFrameCount)ceil((double)srcFrames * ratio);
      dstBuffer.frameLength = fallback < dstCap ? fallback : dstCap;
    }

    toPlay = dstBuffer;

    self.lastEngineOutputSampleRate = kPlaybackRate;
    self.lastFormatSampleRate = playbackFormat.sampleRate;
    self.lastBufferFrameLength = toPlay.frameLength;
    self.lastBufferFormatSampleRate = toPlay.format.sampleRate;
  }

  if (!toPlay || toPlay.frameLength == 0) {
    reject(@"E_AUDIO", @"Converted buffer is empty", nil);
    return;
  }

  // 8) Schedule and resolve ONLY on completion
  __block BOOL didResolve = NO;
  [player stop];

  __weak PiperTtsModule *wself = self;
  RCTPromiseResolveBlock resolveCopy = [resolve copy];
  [player scheduleBuffer:toPlay
                  atTime:nil
                 options:0
       completionHandler:^{
         if (didResolve) return;
         didResolve = YES;
         dispatch_async(dispatch_get_main_queue(), ^{
           if (!wself) return;
           if (resolveCopy) resolveCopy(@(YES));
         });
       }];

  if (!player.isPlaying) {
    [player play];
  }
}

RCT_EXPORT_METHOD(isModelAvailable:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSString *modelPath = [PiperTtsModule piperModelPathInBundle:[NSBundle mainBundle]];
  resolve(@(modelPath.length > 0));
}

RCT_EXPORT_METHOD(getDebugInfo:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSBundle *main = [NSBundle mainBundle];
  NSMutableArray<NSString *> *lines = [NSMutableArray array];

  [lines addObject:[NSString stringWithFormat:@"Main bundle path: %@", main.bundlePath ?: @"(nil)"]];
  [lines addObject:[NSString stringWithFormat:@"Resource path: %@", main.resourcePath ?: @"(nil)"]];

  NSString *modelFlat = [main pathForResource:@"model" ofType:@"onnx"];
  [lines addObject:[NSString stringWithFormat:@"model.onnx (flat): %@", modelFlat.length ? modelFlat : @"(not found)"]];

  NSString *modelInPiper = [main pathForResource:@"model" ofType:@"onnx" inDirectory:@"piper"];
  [lines addObject:[NSString stringWithFormat:@"model.onnx (piper/): %@", modelInPiper.length ? modelInPiper : @"(not found)"]];

  NSString *modelInDir = [main pathForResource:@"model" ofType:@"onnx" inDirectory:@"Resources/piper"];
  [lines addObject:[NSString stringWithFormat:@"model.onnx (Resources/piper): %@", modelInDir.length ? modelInDir : @"(not found)"]];

  NSString *espeakPath = [PiperTtsModule espeakDataPathInBundle:main];
  [lines addObject:[NSString stringWithFormat:@"espeak-ng-data dir: %@", espeakPath.length ? espeakPath : @"(not found)"]];

  NSArray *onnxInRoot = [main pathsForResourcesOfType:@"onnx" inDirectory:nil];
  [lines addObject:[NSString stringWithFormat:@"All .onnx in bundle root: %@", onnxInRoot.count ? [onnxInRoot componentsJoinedByString:@", "] : @"(none)"]];

  NSArray *jsonInRoot = [main pathsForResourcesOfType:@"json" inDirectory:nil];
  [lines addObject:[NSString stringWithFormat:@"All .json in bundle root: %@", jsonInRoot.count ? [jsonInRoot componentsJoinedByString:@", "] : @"(none)"]];

  NSArray *inPiper = [main pathsForResourcesOfType:nil inDirectory:@"piper"];
  [lines addObject:[NSString stringWithFormat:@"Files in piper/: %@", inPiper.count ? [inPiper componentsJoinedByString:@", "] : @"(none)"]];

  NSArray *inResourcesPiper = [main pathsForResourcesOfType:nil inDirectory:@"Resources/piper"];
  [lines addObject:[NSString stringWithFormat:@"Files in Resources/piper: %@", inResourcesPiper.count ? [inResourcesPiper componentsJoinedByString:@", "] : @"(none)"]];

  /* List top-level bundle contents to see what actually got copied */
  NSString *bundlePath = main.bundlePath;
  if (bundlePath.length) {
    NSError *err = nil;
    NSArray<NSString *> *topLevel = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:bundlePath error:&err];
    if (topLevel.count) {
      NSArray *filtered = [topLevel filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSString *name, id _) {
        return [name isEqualToString:@"model.onnx"] || [name isEqualToString:@"model.onnx.json"] || [name isEqualToString:@"piper"] || [name isEqualToString:@"espeak-ng-data"];
      }]];
      if (filtered.count) {
        [lines addObject:[NSString stringWithFormat:@"Bundle has (model/piper/espeak): %@", [filtered componentsJoinedByString:@", "]]];
      }
    }
  }

  [lines addObject:@"--- Last playback buffer check (visible in JS via getDebugInfo) ---"];
  [lines addObject:[NSString stringWithFormat:@"audioSampleCount=%lu sampleRate=%lu expectedDurationSec=%.2f pcmBytes=%lu pcmLength=%lu engineOutputSampleRate=%.0f",
                    (unsigned long)self.lastAudioSampleCount, (unsigned long)self.lastSampleRate, self.lastExpectedDurationSec,
                    (unsigned long)self.lastPcmBytes, (unsigned long)self.lastPcmLength, self.lastEngineOutputSampleRate]];
  double srcDur = (double)self.lastAudioSampleCount / (double)(self.lastSampleRate ?: 1);
  double dstDur = (double)self.lastBufferFrameLength / (double)(self.lastBufferFormatSampleRate ?: 1);
  [lines addObject:[NSString stringWithFormat:
    @"durations: src=%.3fs (samples=%lu @ %lu)  dst=%.3fs (frames=%u @ %.0f)",
    srcDur, (unsigned long)self.lastAudioSampleCount, (unsigned long)self.lastSampleRate,
    dstDur, (unsigned)self.lastBufferFrameLength, self.lastBufferFormatSampleRate]];

  resolve([lines componentsJoinedByString:@"\n"]);
}

@end
