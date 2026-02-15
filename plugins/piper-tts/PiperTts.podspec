Pod::Spec.new do |s|
  s.name         = "PiperTts"
  s.version      = "0.0.1"
  s.summary      = "Offline Piper TTS for React Native"
  s.homepage     = "https://github.com/example/companion-app"
  s.license      = { :type => "MIT" }
  s.author       = { "CompanionApp" => "example@example.com" }
  s.platform     = :ios, "13.0"
  # Use pod root (directory containing this .podspec) so CocoaPods creates a native target and links libPiperTts.a
  s.source       = { :path => "." }

  s.source_files = "ios/PiperTtsModule.{h,mm}", "ios/cpp/**/*.{h,cpp,hpp}"
  # Piper model + config; espeak-ng-data for phonemization (run scripts/download-espeak-ng-data.sh). Same pattern as piper.
  s.resources    = "ios/Resources/piper/*.onnx", "ios/Resources/piper/*.json",
                   "ios/Resources/espeak-ng-data/**/*"
  s.frameworks   = "AVFoundation"
  s.requires_arc = true
  s.dependency "React-Core"
  # ORT C API only (piper_engine uses it; no Obj-C ORT in module)
  s.dependency "onnxruntime-c"
  # For phonemization: app must link libespeak-ng (e.g. SPM espeak-ng-spm). Set PIPER_USE_ESPEAK=1 when running pod install.
  # Headers come from scripts/download-espeak-ng-data.sh (vendors espeak-ng src/include into ios/Include).
  if ENV['PIPER_USE_ESPEAK'] == '1'
    s.pod_target_xcconfig = {
      'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) PIPER_ENGINE_USE_ESPEAK=1',
      'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/ios/Include"'
    }
  end
  # Required for New Arch: generated TurboModule spec (PiperTts/PiperTts.h, NativePiperTtsSpecJSI)
  s.dependency "ReactCodegen"
end
