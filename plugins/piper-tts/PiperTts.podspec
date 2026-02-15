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

  s.source_files = "ios/PiperTtsModule.{h,mm}", "ios/cpp/**/*.{h,cpp}"
  # Copy model files into the app bundle so they are on device
  s.resources    = "ios/Resources/piper/*.onnx", "ios/Resources/piper/*.json"
  s.frameworks   = "AVFoundation"
  s.requires_arc = true
  s.dependency "React-Core"
  s.dependency "onnxruntime-objc"
  # Required for New Arch: generated TurboModule spec (PiperTts/PiperTts.h, NativePiperTtsSpecJSI)
  s.dependency "ReactCodegen"
end
