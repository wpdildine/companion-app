Pod::Spec.new do |s|
  s.name         = "AtlasNativeMic"
  s.version      = "0.0.1"
  s.summary      = "Native microphone capture facts for ATLAS (NATIVE_MIC_CONTRACT)"
  s.homepage     = "https://github.com/example/companion-app"
  s.license      = { :type => "MIT" }
  s.author       = { "CompanionApp" => "example@example.com" }
  s.platform     = :ios, "13.0"
  s.source       = { :path => "." }
  s.source_files = "ios/*.{h,mm}"
  s.frameworks   = "AVFoundation"
  s.requires_arc = true
  s.dependency "React-Core"
end
