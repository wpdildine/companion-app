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

@end
