package com.companionapp

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.InputStream
import java.io.FileOutputStream
import java.util.concurrent.Executors
import android.util.Base64

class RagPackReaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RagPackReader"

    private val executor = Executors.newSingleThreadExecutor()

    @ReactMethod
    fun readFile(relativePath: String, promise: Promise) {
        executor.execute {
            try {
                val path = relativePath.trimStart('/')
                reactApplicationContext.assets.open(path).use { stream: InputStream ->
                    val text = stream.bufferedReader(Charsets.UTF_8).readText()
                    promise.resolve(text)
                }
            } catch (e: Exception) {
                Log.e(TAG, "[E_READ] $relativePath: ${e.message}")
                promise.reject("E_READ", "Failed to read $relativePath: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun readFileBinary(relativePath: String, promise: Promise) {
        executor.execute {
            try {
                val path = relativePath.trimStart('/')
                reactApplicationContext.assets.open(path).use { stream: InputStream ->
                    val bytes = stream.readBytes()
                    val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    promise.resolve(base64)
                }
            } catch (e: Exception) {
                Log.e(TAG, "[E_READ] $relativePath: ${e.message}")
                promise.reject("E_READ", "Failed to read $relativePath: ${e.message}")
            }
        }
    }

    /** Returns the app's writable directory for GGUF model files (e.g. embed + chat). Creates dir if needed. */
    @ReactMethod
    fun getAppModelsPath(promise: Promise) {
        executor.execute {
            try {
                val filesDir = reactApplicationContext.filesDir
                val modelsDir = java.io.File(filesDir, "models")
                if (!modelsDir.exists()) modelsDir.mkdirs()
                val path = modelsDir.absolutePath
                promise.resolve(path)
            } catch (e: Exception) {
                Log.e(TAG, "getAppModelsPath: ${e.message}")
                promise.reject("E_MODELS_PATH", "Failed to get models path: ${e.message}")
            }
        }
    }

    /** Returns a file path for a bundled asset so native GGUF loaders can open it. On Android copies asset to filesDir/bundle_models/ and returns that path (overwrites so app updates use the new bundle). */
    @ReactMethod
    fun getBundleFilePath(relativePath: String, promise: Promise) {
        executor.execute {
            try {
                val path = relativePath.trimStart('/')
                val destDir = File(reactApplicationContext.filesDir, "bundle_models")
                if (!destDir.exists()) destDir.mkdirs()
                val safeName = path.replace("/", "_")
                val destFile = File(destDir, safeName)
                reactApplicationContext.assets.open(path).use { input ->
                    FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                }
                promise.resolve(destFile.absolutePath)
            } catch (e: Exception) {
                Log.e(TAG, "getBundleFilePath $relativePath: ${e.message}")
                promise.resolve("")
            }
        }
    }

    companion object {
        private const val TAG = "RagPackReader"
    }
}
