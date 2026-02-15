#import <React/RCTBridgeModule.h>

#if __has_include("PiperTts/PiperTts.h")
#import "PiperTts/PiperTts.h"
#endif

@interface PiperTtsModule : NSObject <RCTBridgeModule
#if __has_include("PiperTts/PiperTts.h")
, NativePiperTtsSpec
#endif
>
@end
