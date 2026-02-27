/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { install as installPluginDiagnostics } from './src/shared/services/native/PluginDiagnostics';

installPluginDiagnostics();

// Always print errors to console so they show in Metro terminal
function logError(label, error) {
  const msg = error?.message ?? String(error);
  const stack = error?.stack ?? '';
  console.error('\n--- ' + label + ' ---\n' + msg + '\n' + stack + '\n---\n');
}

// Set up global error handler only if ErrorUtils exists (can be undefined before runtime is ready)
try {
  const ErrorUtils = require('react-native').ErrorUtils;
  if (ErrorUtils && typeof ErrorUtils.getGlobalHandler === 'function') {
    const defaultHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      logError(isFatal ? 'FATAL' : 'ERROR', error);
      if (typeof defaultHandler === 'function') {
        defaultHandler(error, isFatal);
      } else {
        throw error;
      }
    });
  }
} catch (e) {
  logError('Error setting up error handler', e);
}

AppRegistry.registerComponent(appName, () => App);
