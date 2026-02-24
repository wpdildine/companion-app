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

/** Path to content_pack in Documents. Used so the app can copy the bundle pack once and reuse it (no rebundling). */
- (NSString *)contentPackDocumentsPath {
  NSArray<NSString *> *dirs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *docDir = dirs.firstObject;
  if (!docDir.length) return @"";
  return [docDir stringByAppendingPathComponent:@"content_pack"];
}

/** Returns the Documents path to the content pack if it already exists (manifest.json present). Empty string if not yet copied. */
RCT_EXPORT_METHOD(getContentPackPathInDocuments:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *packDir = [self contentPackDocumentsPath];
  if (!packDir.length) {
    resolve(@"");
    return;
  }
  NSString *manifestPath = [packDir stringByAppendingPathComponent:@"manifest.json"];
  if ([[NSFileManager defaultManager] fileExistsAtPath:manifestPath]) {
    resolve(packDir);
  } else {
    resolve(@"");
  }
}

/** Copies the bundled content_pack to Documents. Idempotent: if manifest already exists in Documents, skips copy and resolves with path. */
RCT_EXPORT_METHOD(copyBundlePackToDocuments:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *packDir = [self contentPackDocumentsPath];
  if (!packDir.length) {
    reject(@"E_COPY", @"Documents directory not found", nil);
    return;
  }
  NSString *manifestInDocs = [packDir stringByAppendingPathComponent:@"manifest.json"];
  if ([[NSFileManager defaultManager] fileExistsAtPath:manifestInDocs]) {
    resolve(packDir);
    return;
  }
  NSString *bundlePack = [[NSBundle mainBundle] resourcePath];
  if (!bundlePack.length) {
    reject(@"E_COPY", @"Bundle resource path not found", nil);
    return;
  }
  NSString *srcPack = [bundlePack stringByAppendingPathComponent:@"content_pack"];
  if (![[NSFileManager defaultManager] fileExistsAtPath:srcPack]) {
    reject(@"E_COPY", @"Bundle content_pack not found; run sync-pack-small or add content_pack to the app.", nil);
    return;
  }
  NSFileManager *fm = [NSFileManager defaultManager];
  NSError *err = nil;
  if (![fm createDirectoryAtPath:packDir withIntermediateDirectories:YES attributes:nil error:&err]) {
    RCTLogError(@"[RagPackReader] copyBundlePackToDocuments create dir: %@", err.localizedDescription);
    reject(@"E_COPY", err.localizedDescription, err);
    return;
  }
  NSArray<NSString *> *contents = [fm contentsOfDirectoryAtPath:srcPack error:&err];
  if (!contents) {
    reject(@"E_COPY", [NSString stringWithFormat:@"List bundle pack: %@", err.localizedDescription], nil);
    return;
  }
  for (NSString *item in contents) {
    NSString *src = [srcPack stringByAppendingPathComponent:item];
    NSString *dst = [packDir stringByAppendingPathComponent:item];
    if ([fm fileExistsAtPath:dst]) [fm removeItemAtPath:dst error:NULL];
    if (![fm copyItemAtPath:src toPath:dst error:&err]) {
      RCTLogError(@"[RagPackReader] copyBundlePackToDocuments copy %@: %@", item, err.localizedDescription);
      reject(@"E_COPY", [NSString stringWithFormat:@"Copy %@: %@", item, err.localizedDescription], nil);
      return;
    }
  }
  resolve(packDir);
}

/** Read a file from the filesystem by full path (e.g. Documents/content_pack/manifest.json). For use after copyBundlePackToDocuments. */
RCT_EXPORT_METHOD(readFileAtPath:(NSString *)absolutePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![[NSFileManager defaultManager] fileExistsAtPath:absolutePath]) {
    reject(@"E_READ", [NSString stringWithFormat:@"File not found: %@", absolutePath], nil);
    return;
  }
  NSError *err = nil;
  NSString *content = [NSString stringWithContentsOfFile:absolutePath encoding:NSUTF8StringEncoding error:&err];
  if (err) {
    RCTLogError(@"[RagPackReader][E_READ] %@: %@", absolutePath, err.localizedDescription);
    reject(@"E_READ", err.localizedDescription, err);
    return;
  }
  resolve(content ?: @"");
}

RCT_EXPORT_METHOD(readFileBinaryAtPath:(NSString *)absolutePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (![[NSFileManager defaultManager] fileExistsAtPath:absolutePath]) {
    reject(@"E_READ", [NSString stringWithFormat:@"File not found: %@", absolutePath], nil);
    return;
  }
  NSError *err = nil;
  NSData *data = [NSData dataWithContentsOfFile:absolutePath options:0 error:&err];
  if (err) {
    RCTLogError(@"[RagPackReader][E_READ] %@: %@", absolutePath, err.localizedDescription);
    reject(@"E_READ", err.localizedDescription, err);
    return;
  }
  if (!data.length) {
    resolve(@"");
    return;
  }
  resolve([data base64EncodedStringWithOptions:0]);
}

RCT_EXPORT_METHOD(fileExistsAtPath:(NSString *)absolutePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@([[NSFileManager defaultManager] fileExistsAtPath:absolutePath]));
}

@end
