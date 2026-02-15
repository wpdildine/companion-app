#import "PiperTtsModule.h"
#import <AVFoundation/AVFoundation.h>
#import <React/RCTLog.h>
#import <onnxruntime-objc/onnxruntime.h>
#if __has_include("PiperTts/PiperTts.h")
#import "PiperTts/PiperTts.h"
#endif

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
  if (!modelPath.length || !configPath.length) {
    RCTLogError(@"[PiperTts][E_NO_MODEL] model or config missing: model=%d config=%d", (int)modelPath.length, (int)configPath.length);
    reject(@"E_NO_MODEL", @"Piper model not found. Run scripts/download-piper-voice.sh", nil);
    return;
  }
  RCTLogInfo(@"[PiperTts] synthesizing (length %lu)", (unsigned long)text.length);

  NSError *err = nil;
  NSDictionary *config = [self loadConfig:configPath error:&err];
  if (!config) {
    RCTLogError(@"[PiperTts][E_CONFIG] Failed to load config: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_CONFIG", err.localizedDescription ?: @"Failed to load config", err);
    return;
  }

  NSArray<NSNumber *> *phonemeIds = [self textToPhonemeIds:config text:text];
  if (phonemeIds.count == 0) {
    RCTLogError(@"[PiperTts][E_PHONEME] Could not convert text to phoneme IDs");
    reject(@"E_PHONEME", @"Could not convert text to phoneme IDs", nil);
    return;
  }

  ORTEnv *env = [[ORTEnv alloc] initWithLoggingLevel:ORTLoggingLevelWarning error:&err];
  if (!env) {
    RCTLogError(@"[PiperTts][E_ORT] ORT env failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"ORT env failed", err);
    return;
  }
  ORTSession *session = [[ORTSession alloc] initWithEnv:env modelPath:modelPath sessionOptions:nil error:&err];
  if (!session) {
    RCTLogError(@"[PiperTts][E_ORT] ORT session failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"ORT session failed", err);
    return;
  }

  NSDictionary *inference = config[@"inference"];
  NSNumber *noiseScaleNum = inference[@"noise_scale"] ?: @0.667;
  NSNumber *lengthScaleNum = inference[@"length_scale"] ?: @1.0;
  NSNumber *noiseWNum = inference[@"noise_w"] ?: @0.8;
  float noiseScale = noiseScaleNum.floatValue;
  float lengthScale = lengthScaleNum.floatValue;
  float noiseW = noiseWNum.floatValue;
  NSInteger sampleRate = [config[@"audio"][@"sample_rate"] integerValue];
  if (sampleRate <= 0) sampleRate = 22050;

  // input: int64 [1, N]
  NSMutableData *inputData = [NSMutableData dataWithLength:phonemeIds.count * sizeof(int64_t)];
  int64_t *inputPtr = (int64_t *)inputData.mutableBytes;
  for (NSInteger i = 0; i < phonemeIds.count; i++) {
    inputPtr[i] = (int64_t)[phonemeIds[i] longLongValue];
  }
  ORTValue *inputValue = [[ORTValue alloc] initWithTensorData:inputData
                                                   elementType:ORTTensorElementDataTypeInt64
                                                        shape:@[@1, @(phonemeIds.count)]
                                                        error:&err];
  if (!inputValue) {
    RCTLogError(@"[PiperTts][E_ORT] input tensor failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"input tensor failed", err);
    return;
  }

  int64_t inputLen = (int64_t)phonemeIds.count;
  NSMutableData *inputLengthsData = [NSMutableData dataWithBytes:&inputLen length:sizeof(int64_t)];
  ORTValue *inputLengthsValue = [[ORTValue alloc] initWithTensorData:inputLengthsData
                                                        elementType:ORTTensorElementDataTypeInt64
                                                             shape:@[@1]
                                                             error:&err];
  if (!inputLengthsValue) {
    RCTLogError(@"[PiperTts][E_ORT] input_lengths tensor failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"input_lengths tensor failed", err);
    return;
  }

  float scalesArr[] = { noiseScale, lengthScale, noiseW };
  NSMutableData *scalesData = [NSMutableData dataWithBytes:scalesArr length:3 * sizeof(float)];
  ORTValue *scalesValue = [[ORTValue alloc] initWithTensorData:scalesData
                                                  elementType:ORTTensorElementDataTypeFloat
                                                       shape:@[@3]
                                                       error:&err];
  if (!scalesValue) {
    RCTLogError(@"[PiperTts][E_ORT] scales tensor failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"scales tensor failed", err);
    return;
  }

  NSDictionary *inputs = @{
    @"input": inputValue,
    @"input_lengths": inputLengthsValue,
    @"scales": scalesValue
  };
  NSArray *outputNames = [session outputNamesWithError:&err];
  if (!outputNames.count) {
    RCTLogError(@"[PiperTts][E_ORT] no outputs: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"no outputs", err);
    return;
  }
  NSSet *outputNameSet = [NSSet setWithArray:outputNames];
  NSDictionary *outputs = [session runWithInputs:inputs outputNames:outputNameSet runOptions:nil error:&err];
  if (!outputs) {
    RCTLogError(@"[PiperTts][E_ORT] run failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"run failed", err);
    return;
  }

  /* Pick the audio output: float32 tensor with largest element count (handles [N], [1,N], [1,1,N] and multi-output models). */
  ORTValue *outputValue = nil;
  NSUInteger audioSampleCount = 0;
  for (NSString *name in outputNames) {
    ORTValue *val = outputs[name];
    if (!val) continue;
    ORTTensorTypeAndShapeInfo *info = [val tensorTypeAndShapeInfoWithError:&err];
    if (!info) continue;
    NSArray<NSNumber *> *shape = info.shape;
    NSUInteger n = 1;
    for (NSNumber *dim in shape) n *= [dim unsignedIntegerValue];
    RCTLogInfo(@"[PiperTts] ONNX output \"%@\" shape=%@ elementType=%ld count=%lu",
               name, shape, (long)info.elementType, (unsigned long)n);
    if (info.elementType != ORTTensorElementDataTypeFloat) continue;
    if (n > audioSampleCount) {
      audioSampleCount = n;
      outputValue = val;
    }
  }
  if (!outputValue || audioSampleCount == 0) {
    RCTLogError(@"[PiperTts][E_ORT] no float audio output found (output names: %@)", outputNames);
    reject(@"E_ORT", @"No float audio output tensor", nil);
    return;
  }

  NSMutableData *floatData = [outputValue tensorDataWithError:&err];
  if (!floatData || floatData.length == 0) {
    RCTLogError(@"[PiperTts][E_ORT] output tensor data failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_ORT", err.localizedDescription ?: @"output tensor failed", err);
    return;
  }
  NSUInteger expectedBytes = audioSampleCount * sizeof(float);
  if (floatData.length < expectedBytes) {
    RCTLogError(@"[PiperTts][E_ORT] output tensor length %lu < expected %lu", (unsigned long)floatData.length, (unsigned long)expectedBytes);
    reject(@"E_ORT", @"Output tensor size mismatch", nil);
    return;
  }
  RCTLogInfo(@"[PiperTts] Piper config sample_rate=%ld, ONNX audio samples=%lu", (long)sampleRate, (unsigned long)audioSampleCount);

  NSData *pcm = [self floatToInt16:floatData sampleCount:audioSampleCount];
  double expectedDurationSec = (double)audioSampleCount / (double)sampleRate;
  NSUInteger pcmBytes = audioSampleCount * 2;
  self.lastAudioSampleCount = audioSampleCount;
  self.lastSampleRate = (NSUInteger)sampleRate;
  self.lastExpectedDurationSec = expectedDurationSec;
  self.lastPcmBytes = pcmBytes;
  self.lastPcmLength = pcm.length;
  self.lastEngineOutputSampleRate = 0; /* set in playPcm */
  [self playPcm:pcm sampleRate:(unsigned)sampleRate resolver:resolve rejecter:reject];
}

- (NSDictionary *)loadConfig:(NSString *)path error:(NSError **)error {
  NSData *data = [NSData dataWithContentsOfFile:path];
  if (!data.length) return nil;
  id json = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
  return [json isKindOfClass:[NSDictionary class]] ? json : nil;
}

- (NSArray<NSNumber *> *)textToPhonemeIds:(NSDictionary *)config text:(NSString *)text {
  NSDictionary *idMap = config[@"phoneme_id_map"];
  if (![idMap isKindOfClass:[NSDictionary class]]) return @[];

  long (^idFor)(NSString *) = ^long(NSString *key) {
    id val = idMap[key];
    if ([val isKindOfClass:[NSArray class]] && [(NSArray *)val count] > 0) {
      return [((NSArray *)val)[0] longValue];
    }
    return 3;
  };

  NSMutableArray<NSNumber *> *ids = [NSMutableArray array];
  [ids addObject:@(idFor(@"^"))];
  NSString *lower = [text lowercaseString];
  for (NSUInteger i = 0; i < lower.length; i++) {
    unichar c = [lower characterAtIndex:i];
    NSString *ch = [NSString stringWithCharacters:&c length:1];
    if (idMap[ch]) {
      [ids addObject:@(idFor(ch))];
    } else if (c == ' ' || c == '\n' || c == '\t') {
      [ids addObject:@(idFor(@" "))];
    }
  }
  [ids addObject:@(idFor(@"_"))];
  [ids addObject:@(idFor(@"$"))];
  return ids;
}

- (NSData *)floatToInt16:(NSMutableData *)floatData sampleCount:(NSUInteger)n {
  /* Clamp float [-1,1] to int16 (little-endian is native on iOS). */
  if (n == 0) n = floatData.length / sizeof(float);
  NSMutableData *pcm = [NSMutableData dataWithLength:n * sizeof(int16_t)];
  const float *src = (const float *)floatData.bytes;
  int16_t *dst = (int16_t *)pcm.mutableBytes;
  for (NSUInteger i = 0; i < n; i++) {
    float v = src[i];
    if (v < -1.f) v = -1.f;
    if (v > 1.f) v = 1.f;
    dst[i] = (int16_t)(v * 32767.f);
  }
  return pcm;
}

- (void)playPcm:(NSData *)pcm sampleRate:(unsigned)sampleRate
       resolver:(RCTPromiseResolveBlock)resolve
       rejecter:(RCTPromiseRejectBlock)reject
{
  NSError *err = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  if (![session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:0 error:&err]) {
    RCTLogError(@"[PiperTts][E_AUDIO] Session setCategory failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_AUDIO", err.localizedDescription ?: @"Session setCategory failed", err);
    return;
  }
  /* Prefer the model's sample rate so playback isn't resampled incorrectly (avoids sped-up/distorted sound). */
  if (![session setPreferredSampleRate:(double)sampleRate error:&err]) {
    RCTLogWarn(@"[PiperTts] setPreferredSampleRate(%u) failed: %@ (using default)", sampleRate, err.localizedDescription);
  }
  if (![session setActive:YES withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&err]) {
    RCTLogError(@"[PiperTts][E_AUDIO] Session setActive failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_AUDIO", err.localizedDescription ?: @"Session setActive failed", err);
    return;
  }

  /* Format must exactly match PCM: Piper sample rate, mono, int16. */
  AVAudioFormat *format = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16
                                                           sampleRate:(double)sampleRate
                                                             channels:1
                                                          interleaved:YES];
  if (!format) {
    RCTLogError(@"[PiperTts][E_AUDIO] Invalid format");
    reject(@"E_AUDIO", @"Invalid format", nil);
    return;
  }
  AVAudioFrameCount frameCount = (AVAudioFrameCount)(pcm.length / sizeof(int16_t));
  AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:frameCount];
  if (!buffer) {
    RCTLogError(@"[PiperTts][E_AUDIO] Buffer alloc failed");
    reject(@"E_AUDIO", @"Buffer alloc failed", nil);
    return;
  }
  buffer.frameLength = frameCount;
  memcpy(buffer.int16ChannelData[0], pcm.bytes, pcm.length);

  self.playbackEngine = [[AVAudioEngine alloc] init];
  self.playbackPlayer = [[AVAudioPlayerNode alloc] init];
  AVAudioEngine *engine = self.playbackEngine;
  AVAudioPlayerNode *player = self.playbackPlayer;
  [engine attachNode:player];
  if (![engine startAndReturnError:&err]) {
    self.playbackEngine = nil;
    self.playbackPlayer = nil;
    RCTLogError(@"[PiperTts][E_AUDIO] Engine start failed: %@", err.localizedDescription ?: @"unknown");
    reject(@"E_AUDIO", err.localizedDescription ?: @"Engine start failed", err);
    return;
  }
  AVAudioFormat *outputFormat = [[engine outputNode] outputFormatForBus:0];
  self.lastEngineOutputSampleRate = outputFormat.sampleRate;
  self.lastFormatSampleRate = format.sampleRate;
  self.lastBufferFrameLength = buffer.frameLength;
  self.lastBufferFormatSampleRate = buffer.format.sampleRate;

  /* Make it correct no matter what: if engine output rate ≠ buffer rate, resample to output rate and use that. */
  AVAudioPCMBuffer *bufferToPlay = buffer;
  AVAudioFormat *formatToUse = format;
  double outRate = outputFormat.sampleRate;
  if (outRate > 0 && fabs(outRate - (double)sampleRate) > 1.0) {
    NSData *resampled = [self resamplePcm:pcm fromRate:(double)sampleRate toRate:outRate];
    if (resampled && resampled.length > 0) {
      AVAudioFormat *outFmt = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16
                                                              sampleRate:outRate
                                                                channels:1
                                                             interleaved:YES];
      if (outFmt) {
        AVAudioFrameCount outFrames = (AVAudioFrameCount)(resampled.length / sizeof(int16_t));
        AVAudioPCMBuffer *outBuf = [[AVAudioPCMBuffer alloc] initWithPCMFormat:outFmt frameCapacity:outFrames];
        if (outBuf) {
          outBuf.frameLength = outFrames;
          memcpy(outBuf.int16ChannelData[0], resampled.bytes, resampled.length);
          bufferToPlay = outBuf;
          formatToUse = outFmt;
          self.lastFormatSampleRate = outFmt.sampleRate;
          self.lastBufferFrameLength = outBuf.frameLength;
          self.lastBufferFormatSampleRate = outBuf.format.sampleRate;
        }
      }
    }
  }
  [engine connect:player to:engine.mainMixerNode format:formatToUse];

  __weak PiperTtsModule *wself = self;
  [player scheduleBuffer:bufferToPlay completionHandler:^{
    dispatch_async(dispatch_get_main_queue(), ^{
      PiperTtsModule *sself = wself;
      if (sself) {
        sself.playbackEngine = nil;
        sself.playbackPlayer = nil;
      }
      resolve(nil);
    });
  }];
  [player play];
}

/* Linear interpolation resample: int16 mono srcRate -> dstRate. Caller owns returned NSData. */
- (NSData *)resamplePcm:(NSData *)pcm fromRate:(double)srcRate toRate:(double)dstRate {
  if (!pcm.length || srcRate <= 0 || dstRate <= 0) return nil;
  const int16_t *src = (const int16_t *)pcm.bytes;
  NSUInteger srcFrames = pcm.length / sizeof(int16_t);
  NSUInteger dstFrames = (NSUInteger)((double)srcFrames * dstRate / srcRate);
  if (dstFrames == 0) return nil;
  NSMutableData *outData = [NSMutableData dataWithLength:dstFrames * sizeof(int16_t)];
  int16_t *dst = (int16_t *)outData.mutableBytes;
  for (NSUInteger i = 0; i < dstFrames; i++) {
    double srcIdx = (double)i * srcRate / dstRate;
    NSUInteger lo = (NSUInteger)srcIdx;
    NSUInteger hi = lo + 1;
    if (lo >= srcFrames) { dst[i] = src[srcFrames - 1]; continue; }
    if (hi >= srcFrames) { dst[i] = src[lo]; continue; }
    double t = srcIdx - (double)lo;
    double v = (1.0 - t) * (double)src[lo] + t * (double)src[hi];
    if (v > 32767.0) v = 32767.0;
    if (v < -32768.0) v = -32768.0;
    dst[i] = (int16_t)v;
  }
  return outData;
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
        return [name isEqualToString:@"model.onnx"] || [name isEqualToString:@"model.onnx.json"] || [name isEqualToString:@"piper"];
      }]];
      if (filtered.count) {
        [lines addObject:[NSString stringWithFormat:@"Bundle has (model/piper): %@", [filtered componentsJoinedByString:@", "]]];
      }
    }
  }

  [lines addObject:@"--- Last playback buffer check (visible in JS via getDebugInfo) ---"];
  [lines addObject:[NSString stringWithFormat:@"audioSampleCount=%lu sampleRate=%lu expectedDurationSec=%.2f pcmBytes=%lu pcmLength=%lu engineOutputSampleRate=%.0f",
                    (unsigned long)self.lastAudioSampleCount, (unsigned long)self.lastSampleRate, self.lastExpectedDurationSec,
                    (unsigned long)self.lastPcmBytes, (unsigned long)self.lastPcmLength, self.lastEngineOutputSampleRate]];
  [lines addObject:[NSString stringWithFormat:@"format.sampleRate=%.0f buffer.frameLength=%u buffer.format.sampleRate=%.0f (any 48000 vs 22050 = time distortion)",
                    self.lastFormatSampleRate, (unsigned)self.lastBufferFrameLength, self.lastBufferFormatSampleRate]];

  resolve([lines componentsJoinedByString:@"\n"]);
}

@end
