#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'android',
  'build.gradle',
);
const srcIndexTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'src',
  'index.ts',
);
const distIndexTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'dist',
  'index.js',
);
const iosVoiceTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'ios',
  'Voice',
  'Voice.m',
);

if (!fs.existsSync(target)) {
  console.warn('[patch-voice] build.gradle not found, skipping.');
  process.exit(0);
}

const patched = `apply plugin: 'com.android.library'

android {
    namespace "com.wenkesj.voice"
    compileSdk rootProject.hasProperty('compileSdkVersion') ? rootProject.compileSdkVersion : 35

    defaultConfig {
        minSdkVersion rootProject.hasProperty('minSdkVersion') ? rootProject.minSdkVersion : 23
        targetSdkVersion rootProject.hasProperty('targetSdkVersion') ? rootProject.targetSdkVersion : 35
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    mavenCentral()
    google()
}

dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
    testImplementation 'junit:junit:4.12'
    implementation "androidx.appcompat:appcompat:1.7.0"
    implementation "com.facebook.react:react-android"
}
`;

const current = fs.readFileSync(target, 'utf8');
if (
  current.includes('androidx.appcompat:appcompat:1.7.0') &&
  current.includes('namespace "com.wenkesj.voice"')
) {
  console.log('[patch-voice] already patched.');
} else {
  fs.writeFileSync(target, patched);
  console.log(
    '[patch-voice] patched @react-native-voice/voice android build.gradle',
  );
}

function patchModuleResolution(filePath, from, to) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(to)) return false;
  if (!content.includes(from)) return false;
  fs.writeFileSync(filePath, content.replace(from, to));
  return true;
}

const patchedSrcIndex = patchModuleResolution(
  srcIndexTarget,
  'const Voice = NativeModules.Voice as VoiceModule;',
  'const Voice = (NativeModules.Voice ?? NativeModules.RCTVoice) as VoiceModule;',
);
const patchedDistIndex = patchModuleResolution(
  distIndexTarget,
  'const Voice = react_native_1.NativeModules.Voice;',
  'const Voice = react_native_1.NativeModules.Voice ?? react_native_1.NativeModules.RCTVoice;',
);

if (patchedSrcIndex || patchedDistIndex) {
  console.log(
    '[patch-voice] patched module resolution for Voice/RCTVoice in',
    [
      patchedSrcIndex ? 'src/index.ts' : null,
      patchedDistIndex ? 'dist/index.js' : null,
    ]
      .filter(Boolean)
      .join(', '),
  );
} else {
  console.log(
    '[patch-voice] module resolution already patched or files not found.',
  );
}

if (fs.existsSync(iosVoiceTarget)) {
  const iosContent = fs.readFileSync(iosVoiceTarget, 'utf8');
  const invalidRestore = `    // Reset back to the previous category
    if ([self isHeadsetPluggedIn] || [self isHeadSetBluetooth]) {
        [self.audioSession setCategory:self.priorAudioCategory withOptions:AVAudioSessionCategoryOptionAllowBluetooth error: nil];
    } else {
        [self.audioSession setCategory:self.priorAudioCategory withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker error: nil];
    }`;
  const safeRestore = `    // Restore the prior category without forcing route-only options that are
    // invalid for categories such as Playback or Ambient.
    [self.audioSession setCategory:self.priorAudioCategory error:nil];`;
  if (iosContent.includes(safeRestore)) {
    console.log('[patch-voice] iOS audio session restore already patched.');
  } else if (iosContent.includes(invalidRestore)) {
    fs.writeFileSync(
      iosVoiceTarget,
      iosContent.replace(invalidRestore, safeRestore),
    );
    console.log('[patch-voice] patched iOS audio session restore in Voice.m');
  } else {
    console.log('[patch-voice] iOS Voice.m restore block not found; skipping.');
  }

  const inactiveReset = `    // Deactivate before restoring the prior category to avoid property writes
    // against an active PlayAndRecord session during teardown.
    [self.audioSession setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];`;
  const commentedReset = `    // Set audio session to inactive and notify other sessions
    // [self.audioSession setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error: nil];`;
  if (iosContent.includes(inactiveReset)) {
    console.log(
      '[patch-voice] iOS audio session deactivate-before-restore already patched.',
    );
  } else if (iosContent.includes(commentedReset)) {
    fs.writeFileSync(
      iosVoiceTarget,
      fs
        .readFileSync(iosVoiceTarget, 'utf8')
        .replace(commentedReset, inactiveReset),
    );
    console.log(
      '[patch-voice] patched iOS audio session deactivate-before-restore in Voice.m',
    );
  } else {
    console.log(
      '[patch-voice] iOS Voice.m deactivate-before-restore block not found; skipping.',
    );
  }
} else {
  console.log('[patch-voice] iOS Voice.m not found, skipping.');
}
