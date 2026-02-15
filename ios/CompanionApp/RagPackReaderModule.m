#import "RagPackReaderModule.h"
#import <React/RCTLog.h>

@implementation RagPackReaderModule

RCT_EXPORT_MODULE(RagPackReader)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (NSString *)pathInBundle:(NSString *)relativePath {
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *resPath = [bundle resourcePath];
  if (!resPath.length) return @"";
  NSString *full = [resPath stringByAppendingPathComponent:relativePath];
  if ([[NSFileManager defaultManager] fileExistsAtPath:full]) return full;
  return @"";
}

RCT_EXPORT_METHOD(readFile:(NSString *)relativePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *path = [self pathInBundle:relativePath];
  if (!path.length) {
    reject(@"E_READ", [NSString stringWithFormat:@"File not found: %@", relativePath], nil);
    return;
  }
  NSError *err = nil;
  NSString *content = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&err];
  if (err) {
    RCTLogError(@"[RagPackReader][E_READ] %@: %@", relativePath, err.localizedDescription);
    reject(@"E_READ", err.localizedDescription, err);
    return;
  }
  resolve(content ?: @"");
}

RCT_EXPORT_METHOD(readFileBinary:(NSString *)relativePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *path = [self pathInBundle:relativePath];
  if (!path.length) {
    reject(@"E_READ", [NSString stringWithFormat:@"File not found: %@", relativePath], nil);
    return;
  }
  NSError *err = nil;
  NSData *data = [NSData dataWithContentsOfFile:path options:0 error:&err];
  if (err) {
    RCTLogError(@"[RagPackReader][E_READ] %@: %@", relativePath, err.localizedDescription);
    reject(@"E_READ", err.localizedDescription, err);
    return;
  }
  if (!data.length) {
    resolve(@"");
    return;
  }
  NSString *base64 = [data base64EncodedStringWithOptions:0];
  resolve(base64);
}

RCT_EXPORT_METHOD(getAppModelsPath:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSArray<NSString *> *dirs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *docDir = dirs.firstObject;
  if (!docDir.length) {
    reject(@"E_MODELS_PATH", @"Documents directory not found", nil);
    return;
  }
  NSString *modelsDir = [docDir stringByAppendingPathComponent:@"models"];
  NSFileManager *fm = [NSFileManager defaultManager];
  NSError *err = nil;
  if (![fm fileExistsAtPath:modelsDir]) {
    if (![fm createDirectoryAtPath:modelsDir withIntermediateDirectories:YES attributes:nil error:&err]) {
      RCTLogError(@"[RagPackReader] getAppModelsPath: %@", err.localizedDescription);
      reject(@"E_MODELS_PATH", err.localizedDescription, err);
      return;
    }
  }
  resolve(modelsDir);
}

/** Returns the full filesystem path to a file in the app bundle (e.g. content_pack/models/embed/model.gguf). Empty string if not found. */
RCT_EXPORT_METHOD(getBundleFilePath:(NSString *)relativePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *path = [self pathInBundle:relativePath];
  resolve(path ?: @"");
}

@end
