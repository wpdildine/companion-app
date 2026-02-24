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
  'build.gradle'
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
if (current.includes('androidx.appcompat:appcompat:1.7.0') && current.includes('namespace "com.wenkesj.voice"')) {
  console.log('[patch-voice] already patched.');
  process.exit(0);
}

fs.writeFileSync(target, patched);
console.log('[patch-voice] patched @react-native-voice/voice android build.gradle');
