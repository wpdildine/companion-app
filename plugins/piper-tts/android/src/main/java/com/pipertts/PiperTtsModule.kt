package com.pipertts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class PiperTtsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PiperTts"

    private val executor = Executors.newSingleThreadExecutor()

    @Volatile
    private var lastSpeakOptions: ReadableMap? = null

    @ReactMethod
    fun setOptions(options: ReadableMap?) {
        lastSpeakOptions = options
    }

    @ReactMethod
    fun speak(text: String, promise: Promise) {
        if (text.isBlank()) {
            Log.w(TAG, "[E_INVALID] Text is empty")
            promise.reject("E_INVALID", "Text is empty")
            return
        }
        executor.execute {
            try {
                val (modelPath, configPath) = getModelPaths() ?: run {
                    Log.e(TAG, "[E_NO_MODEL] Piper model not found. Run scripts/download-piper-voice.sh")
                    promise.reject("E_NO_MODEL", "Piper model not found. Run scripts/download-piper-voice.sh")
                    return@execute
                }
                val espeakPath = getEspeakDataPath()
                if (espeakPath == null) {
                    Log.e(TAG, "[E_NO_ESPEAK_DATA] espeak-ng-data not found. Run scripts/download-espeak-ng-data.sh and copy to android assets.")
                    promise.reject("E_NO_ESPEAK_DATA", "espeak-ng-data not found. Run scripts/download-espeak-ng-data.sh")
                    return@execute
                }
                Log.d(TAG, "speak: synthesizing (length ${text.length}) via native")
                val result = nativeSynthesize(modelPath, configPath, espeakPath, text)
                if (result == null || result.size < 2) {
                    Log.e(TAG, "[E_SYNTHESIS] Native synthesize returned invalid result")
                    promise.reject("E_SYNTHESIS", "Synthesis failed. Native Piper pipeline returned no result.")
                    return@execute
                }
                val first = result[0]
                val second = result[1]
                // Failure: native returns [null, errorMessage]
                if (first == null && second is String) {
                    Log.e(TAG, "[E_SYNTHESIS] $second")
                    promise.reject("E_SYNTHESIS", second)
                    return@execute
                }
                @Suppress("UNCHECKED_CAST")
                val pcm = first as? ByteArray ?: run {
                    promise.reject("E_SYNTHESIS", "Native synthesize returned no audio.")
                    return@execute
                }
                val sampleRate = (second as? Number)?.toInt() ?: 0
                if (pcm.isEmpty() || sampleRate <= 0) {
                    promise.reject("E_SYNTHESIS", "Native synthesize returned empty audio")
                    return@execute
                }
                playPcm(pcm, sampleRate, promise)
            } catch (e: Exception) {
                Log.e(TAG, "[E_PIPER] Piper speak failed", e)
                promise.reject("E_PIPER", e.message ?: "Piper synthesis failed")
            }
        }
    }

    private external fun nativeSynthesize(
        modelPath: String,
        configPath: String,
        espeakPath: String,
        text: String
    ): Array<Any>?

    private fun playPcm(pcm: ByteArray, sampleRate: Int, promise: Promise) {
        val bufferSize = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(bufferSize, pcm.size))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track.play()
        track.write(pcm, 0, pcm.size)
        val totalFrames = pcm.size / 2
        while (track.playbackHeadPosition < totalFrames && track.playState == AudioTrack.PLAYSTATE_PLAYING) {
            Thread.sleep(50)
        }
        track.stop()
        track.release()
        promise.resolve(null)
    }

    @ReactMethod
    fun isModelAvailable(promise: Promise) {
        try {
            promise.resolve(getModelPaths() != null)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun getModelPaths(): Pair<String, String>? {
        val dir = reactApplicationContext.filesDir.resolve("piper").also { it.mkdirs() }
        val onnx = dir.resolve("model.onnx")
        val json = dir.resolve("model.onnx.json")
        if (!onnx.exists()) {
            copyAssetToFile("piper/model.onnx", onnx) ?: return null
            copyAssetToFile("piper/model.onnx.json", json)
        }
        return if (onnx.exists()) Pair(onnx.absolutePath, json.absolutePath) else null
    }

    /** Copy espeak-ng-data from assets to filesDir once; return path to directory or null. */
    private fun getEspeakDataPath(): String? {
        val destDir = reactApplicationContext.filesDir.resolve("espeak-ng-data")
        val marker = destDir.resolve(".copied")
        if (marker.exists()) return destDir.absolutePath
        destDir.mkdirs()
        return try {
            if (reactApplicationContext.assets.list("espeak-ng-data").isNullOrEmpty()) return null
            copyAssetDirRecursive("espeak-ng-data", destDir)
            marker.writeText("1")
            destDir.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "[E_NO_ESPEAK_DATA] Copy espeak-ng-data failed", e)
            null
        }
    }

    private fun copyAssetDirRecursive(assetPath: String, destDir: File) {
        val names = reactApplicationContext.assets.list(assetPath) ?: return
        for (name in names) {
            val subPath = "$assetPath/$name"
            val destFile = destDir.resolve(name)
            val list = reactApplicationContext.assets.list(subPath)
            if (!list.isNullOrEmpty()) {
                destFile.mkdirs()
                copyAssetDirRecursive(subPath, destFile)
            } else {
                destFile.parentFile?.mkdirs()
                reactApplicationContext.assets.open(subPath).use { input ->
                    FileOutputStream(destFile).use { output -> input.copyTo(output) }
                }
            }
        }
    }

    private fun copyAssetToFile(assetPath: String, dest: File): Boolean {
        return try {
            reactApplicationContext.assets.open(assetPath).use { input ->
                FileOutputStream(dest).use { output -> input.copyTo(output) }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "[E_NO_MODEL] Copy asset failed: $assetPath", e)
            false
        }
    }

    companion object {
        init {
            System.loadLibrary("piper_tts")
        }
        private const val TAG = "PiperTts"
    }
}
