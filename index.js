/**
 * @format
 */

// Log any bootstrap error so it appears in Metro (helps debug "Global was not installed" on Android).
function logBootstrapError(label, error) {
  const msg = error?.message ?? String(error);
  const stack = error?.stack ?? '';
  console.error('\n[Bootstrap] --- ' + label + ' ---\n' + msg + '\n' + stack + '\n---\n');
}

try {
  const { AppRegistry, Platform } = require('react-native');
  const appConfig = require('./app.json');
  const appName = appConfig.appIdentity?.projectName || appConfig.name;

  // R3F native/Expo warns when EXPO_OS was not babel-inlined; define a safe runtime fallback.
  if (typeof process !== 'undefined') {
    process.env = process.env || {};
    if (!process.env.EXPO_OS) {
      process.env.EXPO_OS = Platform.OS;
    }
  }

  const { install: installPluginDiagnostics } = require('./src/shared/native/PluginDiagnostics');
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

  const App = require('./App').default;
  AppRegistry.registerComponent(appName, () => App);
} catch (e) {
  logBootstrapError('Bootstrap failed (this often causes "Global was not installed" on Android)', e);
  throw e;
}
