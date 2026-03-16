#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_JSON = path.join(ROOT, 'app.json');

function readAppJson() {
  return JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
}

function packagePath(packageName) {
  return packageName.split('.').join('/');
}

function getAppIdentity() {
  const appJson = readAppJson();
  const identity = appJson.appIdentity || {};

  const projectName = identity.projectName || appJson.name || 'ATLAS00';
  const displayName = identity.displayName || appJson.displayName || projectName;
  const packageName = identity.packageName || 'com.atlas00.app';
  const iosTargetName = identity.iosTargetName || projectName;
  const androidPackageName = identity.androidPackageName || packageName;

  return {
    projectName,
    displayName,
    packageName,
    iosTargetName,
    androidPackageName,
    androidPackagePath: packagePath(androidPackageName),
  };
}

module.exports = {
  getAppIdentity,
};
