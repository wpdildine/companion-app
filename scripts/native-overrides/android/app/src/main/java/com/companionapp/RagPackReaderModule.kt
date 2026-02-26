package com.companionapp

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

/**
 * Native module to read the bundled content_pack (from assets) and copy it to app files dir.
 * JS uses BUNDLE_PACK_ROOT = "" on Android but we store pack under assets/content_pack/ so we prefix here.
 */
class RagPackReaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RagPackReader"

  private val assetPrefix = "content_pack/"

  private fun contentPackDocumentsPath(): String {
    val dir = reactApplicationContext.filesDir ?: return ""
    return File(dir, "content_pack").absolutePath
  }

  private fun readAssetPath(relativePath: String): String {
    val path = relativePath.replace(Regex("^/+"), "")
    return assetPrefix + path
  }

  @ReactMethod
  fun readFile(relativePath: String, promise: Promise) {
    try {
      val path = readAssetPath(relativePath)
      val content = reactApplicationContext.assets.open(path).bufferedReader().use { it.readText() }
      promise.resolve(content)
    } catch (e: Exception) {
      Log.e(TAG, "[RagPackReader] readFile $relativePath: ${e.message}")
      promise.reject("E_READ", "File not found: $relativePath", e)
    }
  }

  @ReactMethod
  fun readFileBinary(relativePath: String, promise: Promise) {
    try {
      val path = readAssetPath(relativePath)
      val bytes = reactApplicationContext.assets.open(path).readBytes()
      val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
      promise.resolve(base64)
    } catch (e: Exception) {
      Log.e(TAG, "[RagPackReader] readFileBinary $relativePath: ${e.message}")
      promise.reject("E_READ", "File not found: $relativePath", e)
    }
  }

  @ReactMethod
  fun getAppModelsPath(promise: Promise) {
    try {
      val dir = reactApplicationContext.filesDir ?: run {
        promise.reject("E_MODELS_PATH", "Files dir not found")
        return
      }
      val modelsDir = File(dir, "models")
      if (!modelsDir.exists()) modelsDir.mkdirs()
      promise.resolve(modelsDir.absolutePath)
    } catch (e: Exception) {
      Log.e(TAG, "[RagPackReader] getAppModelsPath: ${e.message}")
      promise.reject("E_MODELS_PATH", e.message, e)
    }
  }

  @ReactMethod
  fun getBundleFilePath(relativePath: String, promise: Promise) {
    // On Android assets are not filesystem paths; return empty (caller uses readFile for content).
    promise.resolve("")
  }

  @ReactMethod
  fun getContentPackPathInDocuments(promise: Promise) {
    try {
      val packDir = contentPackDocumentsPath()
      if (packDir.isEmpty()) {
        promise.resolve("")
        return
      }
      val manifest = File(packDir, "manifest.json")
      if (manifest.exists()) promise.resolve(packDir) else promise.resolve("")
    } catch (e: Exception) {
      promise.resolve("")
    }
  }

  @ReactMethod
  fun copyBundlePackToDocuments(promise: Promise) {
    try {
      val packDir = contentPackDocumentsPath()
      if (packDir.isEmpty()) {
        promise.reject("E_COPY", "Files dir not found")
        return
      }
      val packDirFile = File(packDir)
      val manifestInDocs = File(packDirFile, "manifest.json")
      if (manifestInDocs.exists()) {
        promise.resolve(packDir)
        return
      }
      copyAssetsToDir("content_pack", packDirFile)
      promise.resolve(packDir)
    } catch (e: Exception) {
      Log.e(TAG, "[RagPackReader] copyBundlePackToDocuments: ${e.message}")
      promise.reject("E_COPY", e.message ?: "Copy failed", e)
    }
  }

  /** Recursively copy assets under prefix to targetDir (targetDir = app files content_pack root). */
  private fun copyAssetsToDir(assetPrefix: String, targetDir: File) {
    val assets = reactApplicationContext.assets
    val list = assets.list(assetPrefix) ?: return
    for (name in list) {
      val assetPath = if (assetPrefix.isEmpty()) name else "$assetPrefix/$name"
      val dest = File(targetDir, name)
      if (assets.list(assetPath).isNullOrEmpty()) {
        // file
        dest.parentFile?.mkdirs()
        assets.open(assetPath).use { input ->
          FileOutputStream(dest).use { output -> input.copyTo(output) }
        }
      } else {
        // directory
        dest.mkdirs()
        copyAssetsToDir(assetPath, dest)
      }
    }
  }

  @ReactMethod
  fun readFileAtPath(absolutePath: String, promise: Promise) {
    try {
      val file = File(absolutePath)
      if (!file.exists()) {
        promise.reject("E_READ", "File not found: $absolutePath")
        return
      }
      val content = file.readText()
      promise.resolve(content)
    } catch (e: Exception) {
      Log.e(TAG, "[RagPackReader] readFileAtPath $absolutePath: ${e.message}")
      promise.reject("E_READ", e.message, e)
    }
  }

  @ReactMethod
  fun readFileBinaryAtPath(absolutePath: String, promise: Promise) {
    try {
      val file = File(absolutePath)
      if (!file.exists()) {
        promise.reject("E_READ", "File not found: $absolutePath")
        return
      }
      val base64 = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
      promise.resolve(base64)
    } catch (e: Exception) {
      Log.e(TAG, "[RagPackReader] readFileBinaryAtPath $absolutePath: ${e.message}")
      promise.reject("E_READ", e.message, e)
    }
  }

  @ReactMethod
  fun fileExistsAtPath(absolutePath: String, promise: Promise) {
    promise.resolve(File(absolutePath).exists())
  }

  companion object {
    private const val TAG = "RagPackReader"
  }
}
