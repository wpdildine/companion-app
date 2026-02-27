package com.companionapp

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

@Suppress("DEPRECATION")
class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(RagPackReaderPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    copyPiperModelToFiles()
    copyEspeakDataToFiles()
  }

  /** Copy Piper ONNX model from app assets to files/piper/ so Piper TTS works. Runs at app startup. */
  private fun copyPiperModelToFiles() {
    Executors.newSingleThreadExecutor().execute {
      try {
        val dir = File(filesDir, "piper").also { it.mkdirs() }
        val onnx = File(dir, "model.onnx")
        if (onnx.exists()) return@execute
        assets.open("piper/model.onnx").use { input ->
          FileOutputStream(onnx).use { output -> input.copyTo(output) }
        }
        assets.open("piper/model.onnx.json").use { input ->
          FileOutputStream(File(dir, "model.onnx.json")).use { output -> input.copyTo(output) }
        }
        Log.i(TAG, "[Piper] Model copied to ${dir.absolutePath}")
      } catch (e: Exception) {
        Log.w(TAG, "[Piper] copyPiperModelToFiles: ${e.message}")
      }
    }
  }

  /** Copy espeak-ng-data from app assets to files/espeak-ng-data for Piper phonemization. */
  private fun copyEspeakDataToFiles() {
    Executors.newSingleThreadExecutor().execute {
      try {
        val destDir = File(filesDir, "espeak-ng-data")
        val marker = File(destDir, ".copied")
        if (marker.exists()) return@execute
        destDir.mkdirs()
        copyAssetDirRecursive("espeak-ng-data", destDir)
        marker.writeText("1")
        Log.i(TAG, "[Piper] espeak-ng-data copied to ${destDir.absolutePath}")
      } catch (e: Exception) {
        Log.w(TAG, "[Piper] copyEspeakDataToFiles: ${e.message}")
      }
    }
  }

  private fun copyAssetDirRecursive(assetPath: String, destDir: File) {
    val names = assets.list(assetPath) ?: return
    for (name in names) {
      val subPath = "$assetPath/$name"
      val outFile = File(destDir, name)
      val child = assets.list(subPath)
      if (!child.isNullOrEmpty()) {
        outFile.mkdirs()
        copyAssetDirRecursive(subPath, outFile)
      } else {
        outFile.parentFile?.mkdirs()
        assets.open(subPath).use { input ->
          FileOutputStream(outFile).use { output -> input.copyTo(output) }
        }
      }
    }
  }

  companion object {
    private const val TAG = "MainApplication"
  }
}
