package com.companionapp

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.InputStream
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

    companion object {
        private const val TAG = "RagPackReader"
    }
}
