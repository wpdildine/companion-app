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

    /** Path to content_pack in app files dir (persistent; used so pack is copied once, no rebundling). */
    private fun contentPackDocumentsPath(): String =
        File(reactApplicationContext.filesDir, "content_pack").absolutePath

    /** Returns the path to the content pack in Documents if manifest.json already exists; else empty string. */
    @ReactMethod
    fun getContentPackPathInDocuments(promise: Promise) {
        executor.execute {
            try {
                val packDir = File(reactApplicationContext.filesDir, "content_pack")
                val manifest = File(packDir, "manifest.json")
                if (manifest.exists()) promise.resolve(packDir.absolutePath)
                else promise.resolve("")
            } catch (e: Exception) {
                Log.e(TAG, "getContentPackPathInDocuments: ${e.message}")
                promise.resolve("")
            }
        }
    }

    private fun copyAssetPathToPackDir(assetPath: String, packDir: File) {
        val list = reactApplicationContext.assets.list(assetPath) ?: return
        for (name in list) {
            val childPath = if (assetPath.isEmpty()) name else "$assetPath/$name"
            val relPath = if (assetPath.isEmpty()) name else childPath.removePrefix("content_pack/")
            val destFile = File(packDir, relPath)
            val childList = reactApplicationContext.assets.list(childPath)
            if (childList.isNullOrEmpty()) {
                destFile.parentFile?.mkdirs()
                reactApplicationContext.assets.open(childPath).use { input ->
                    FileOutputStream(destFile).use { output -> input.copyTo(output) }
                }
            } else {
                destFile.mkdirs()
                copyAssetPathToPackDir(childPath, packDir)
            }
        }
    }

    /** Copies the bundled content_pack from assets to filesDir/content_pack. Idempotent: if manifest already present, skips and resolves with path.
     * On Android, Gradle may merge assets/content_pack into the assets root (no "content_pack" subdir); we try both. */
    @ReactMethod
    fun copyBundlePackToDocuments(promise: Promise) {
        executor.execute {
            try {
                val packDir = File(reactApplicationContext.filesDir, "content_pack")
                val manifest = File(packDir, "manifest.json")
                if (manifest.exists()) {
                    promise.resolve(packDir.absolutePath)
                    return@execute
                }
                val assetRoot = "content_pack"
                var list = reactApplicationContext.assets.list(assetRoot)
                val fromRoot = list.isNullOrEmpty()
                if (fromRoot) {
                    list = reactApplicationContext.assets.list("")
                    if (!list.isNullOrEmpty() && !list.any { it == "manifest.json" }) {
                        list = null
                    }
                }
                if (list.isNullOrEmpty()) {
                    promise.reject("E_COPY", "Bundle content_pack not found; add content_pack to the app assets.")
                    return@execute
                }
                packDir.mkdirs()
                if (fromRoot) {
                    copyAssetPathToPackDir("", packDir)
                } else {
                    copyAssetPathToPackDir(assetRoot, packDir)
                }
                promise.resolve(packDir.absolutePath)
            } catch (e: Exception) {
                Log.e(TAG, "copyBundlePackToDocuments: ${e.message}")
                promise.reject("E_COPY", "Copy failed: ${e.message}")
            }
        }
    }

    /** Read a file from the filesystem by full path (e.g. filesDir/content_pack/manifest.json). */
    @ReactMethod
    fun readFileAtPath(absolutePath: String, promise: Promise) {
        executor.execute {
            try {
                val file = File(absolutePath)
                if (!file.exists()) {
                    promise.reject("E_READ", "File not found: $absolutePath")
                    return@execute
                }
                promise.resolve(file.readText(Charsets.UTF_8))
            } catch (e: Exception) {
                Log.e(TAG, "readFileAtPath $absolutePath: ${e.message}")
                promise.reject("E_READ", "Failed to read: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun readFileBinaryAtPath(absolutePath: String, promise: Promise) {
        executor.execute {
            try {
                val file = File(absolutePath)
                if (!file.exists()) {
                    promise.reject("E_READ", "File not found: $absolutePath")
                    return@execute
                }
                val bytes = file.readBytes()
                promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
            } catch (e: Exception) {
                Log.e(TAG, "readFileBinaryAtPath $absolutePath: ${e.message}")
                promise.reject("E_READ", "Failed to read: ${e.message}")
            }
        }
    }

    /** Returns whether a file exists at the absolute path. */
    @ReactMethod
    fun fileExistsAtPath(absolutePath: String, promise: Promise) {
        executor.execute {
            try {
                promise.resolve(File(absolutePath).exists())
            } catch (e: Exception) {
                Log.e(TAG, "fileExistsAtPath $absolutePath: ${e.message}")
                promise.resolve(false)
            }
        }
    }

    companion object {
        private const val TAG = "RagPackReader"
    }
}
