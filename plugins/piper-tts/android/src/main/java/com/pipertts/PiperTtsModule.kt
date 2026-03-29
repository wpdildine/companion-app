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
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.regex.Pattern
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.roundToInt

class PiperTtsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PiperTts"

    private val executor = Executors.newSingleThreadExecutor()

    @Volatile
    private var lastSpeakOptions: ReadableMap? = null

    @Volatile
    private var stopPlaybackRequested: Boolean = false

    @Volatile
    private var activeSpeakPromise: Promise? = null

    @Volatile
    private var activeAudioTrack: AudioTrack? = null

    init {
        // Copy model from assets to files/piper/ as soon as the module loads so it's on device before any JS or speak().
        executor.execute {
            try {
                val dir = reactApplicationContext.filesDir.resolve("piper").also { it.mkdirs() }
                val onnx = dir.resolve("model.onnx")
                if (!onnx.exists()) {
                    if (copyAssetToFile("piper/model.onnx", onnx)) {
                        copyAssetToFile("piper/model.onnx.json", dir.resolve("model.onnx.json"))
                        Log.i(TAG, "[Piper] Model copied to ${dir.absolutePath}")
                    } else {
                        Log.w(TAG, "[Piper] Model not in app assets; run pnpm run download-piper and rebuild.")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "[Piper] init copy failed: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun setOptions(options: ReadableMap?) {
        lastSpeakOptions = options
    }

    @ReactMethod
    fun stop() {
        executor.execute {
            stopPlaybackRequested = true
            val t = activeAudioTrack
            activeAudioTrack = null
            if (t != null) {
                try {
                    t.stop()
                } catch (_: Exception) {
                }
                try {
                    t.release()
                } catch (_: Exception) {
                }
            }
            val p = activeSpeakPromise
            activeSpeakPromise = null
            if (p != null) {
                try {
                    p.reject("E_CANCELLED", "Playback stopped", null)
                } catch (_: Exception) {
                }
            }
        }
    }

    /** Copy Piper ONNX model from app assets to files/piper/ so synthesis can run. Call on app startup. */
    @ReactMethod
    fun copyModelToFiles(promise: Promise) {
        try {
            val dir = reactApplicationContext.filesDir.resolve("piper").also { it.mkdirs() }
            val onnx = dir.resolve("model.onnx")
            val json = dir.resolve("model.onnx.json")
            if (!onnx.exists()) {
                if (!copyAssetToFile("piper/model.onnx", onnx)) {
                    promise.reject("E_NO_MODEL", "Piper model not in app assets. Run pnpm run download-piper and rebuild.")
                    return
                }
                copyAssetToFile("piper/model.onnx.json", json)
            }
            promise.resolve(dir.absolutePath)
        } catch (e: Exception) {
            Log.e(TAG, "[copyModelToFiles] ${e.message}", e)
            promise.reject("E_COPY", e.message ?: "Copy failed", e)
        }
    }

    @ReactMethod
    fun speak(text: String, promise: Promise) {
        if (text.isBlank()) {
            Log.w(TAG, "[E_INVALID] Text is empty")
            promise.reject("E_INVALID", "Text is empty")
            return
        }
        executor.execute {
            stopPlaybackRequested = false
            activeSpeakPromise = promise
            try {
                val (modelPath, configPath) = getModelPaths() ?: run {
                    Log.e(TAG, "[E_NO_MODEL] Piper model not found. Run: pnpm run download-piper then rebuild the app.")
                    promise.reject("E_NO_MODEL", "Piper model not found. Run: pnpm run download-piper then rebuild the app.")
                    activeSpeakPromise = null
                    return@execute
                }
                val espeakPath = getEspeakDataPath()
                if (espeakPath == null) {
                    Log.e(TAG, "[E_NO_ESPEAK_DATA] espeak-ng-data not found. Run: ./scripts/download-espeak-ng-data.sh then rebuild the app.")
                    promise.reject("E_NO_ESPEAK_DATA", "espeak-ng-data not found. Run: ./scripts/download-espeak-ng-data.sh then rebuild the app.")
                    activeSpeakPromise = null
                    return@execute
                }
                val sentenceMs = getOptionInt("interSentenceSilenceMs", 0)
                val commaMs = getOptionInt("interCommaSilenceMs", 0)
                val segments = segmentsWithSilenceFromText(text.trim(), sentenceMs, commaMs)
                val (pcm, sampleRate) = if (segments.size > 1 && (sentenceMs > 0 || commaMs > 0)) {
                    synthesizeSegmentsWithSilence(modelPath, configPath, espeakPath, segments, promise)
                        ?: run {
                            activeSpeakPromise = null
                            return@execute
                        }
                } else {
                    val result = nativeSynthesize(modelPath, configPath, espeakPath, text)
                    if (result == null || result.size < 2) {
                        Log.e(TAG, "[E_SYNTHESIS] Native synthesize returned invalid result")
                        promise.reject("E_SYNTHESIS", "Synthesis failed. Native Piper pipeline returned no result.")
                        activeSpeakPromise = null
                        return@execute
                    }
                    val first = result[0]
                    val second = result[1]
                    if (first == null && second is String) {
                        Log.e(TAG, "[E_SYNTHESIS] $second")
                        promise.reject("E_SYNTHESIS", second)
                        activeSpeakPromise = null
                        return@execute
                    }
                    @Suppress("UNCHECKED_CAST")
                    val pcmBytes = first as? ByteArray ?: run {
                        promise.reject("E_SYNTHESIS", "Native synthesize returned no audio.")
                        activeSpeakPromise = null
                        return@execute
                    }
                    val rate = (second as? Number)?.toInt() ?: 0
                    if (pcmBytes.isEmpty() || rate <= 0) {
                        promise.reject("E_SYNTHESIS", "Native synthesize returned empty audio")
                        activeSpeakPromise = null
                        return@execute
                    }
                    Pair(pcmBytes, rate)
                }
                playPcm(pcm, sampleRate)
            } catch (e: Exception) {
                Log.e(TAG, "[E_PIPER] Piper speak failed", e)
                activeSpeakPromise = null
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

    private fun playPcm(pcm: ByteArray, sampleRate: Int) {
        val promise = activeSpeakPromise ?: return
        if (stopPlaybackRequested) {
            activeSpeakPromise = null
            try {
                promise.reject("E_CANCELLED", "Playback stopped", null)
            } catch (_: Exception) {
            }
            return
        }
        val processed = applyPiperPostSynthesisRender(pcm, sampleRate)
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
            .setBufferSizeInBytes(maxOf(bufferSize, processed.size))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        activeAudioTrack = track
        track.play()
        track.write(processed, 0, processed.size)
        val totalFrames = processed.size / 2
        while (track.playbackHeadPosition < totalFrames && track.playState == AudioTrack.PLAYSTATE_PLAYING) {
            if (stopPlaybackRequested) {
                try {
                    track.stop()
                } catch (_: Exception) {
                }
                try {
                    track.release()
                } catch (_: Exception) {
                }
                activeAudioTrack = null
                activeSpeakPromise = null
                try {
                    promise.reject("E_CANCELLED", "Playback stopped", null)
                } catch (_: Exception) {
                }
                return
            }
            Thread.sleep(50)
        }
        try {
            track.stop()
        } catch (_: Exception) {
        }
        try {
            track.release()
        } catch (_: Exception) {
        }
        activeAudioTrack = null
        activeSpeakPromise = null
        promise.resolve(null)
    }

    @ReactMethod
    fun isModelAvailable(promise: Promise) {
        try {
            // On Android both the Piper ONNX model and espeak-ng-data are required for synthesis.
            val modelOk = getModelPaths() != null
            val espeakOk = getEspeakDataPath() != null
            promise.resolve(modelOk && espeakOk)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** Pairs of (segment text, silence ms to insert after). Comma -> 125ms, sentence end (.!?) -> 250ms on iOS. */
    private fun segmentsWithSilenceFromText(
        text: String,
        sentenceMs: Int,
        commaMs: Int
    ): List<Pair<String, Int>> {
        if (text.isEmpty() || (sentenceMs <= 0 && commaMs <= 0)) return emptyList()
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        // Match runs of text ending in , or .!? (with optional trailing space) — same as iOS
        val regex = Pattern.compile("[^,.!?]+[,.!?]\\s*")
        val matcher = regex.matcher(trimmed)
        val result = mutableListOf<Pair<String, Int>>()
        var lastEnd = 0
        while (matcher.find()) {
            val seg = matcher.group()?.trim() ?: continue
            if (seg.isEmpty()) {
                lastEnd = matcher.end()
                continue
            }
            val lastChar = seg[seg.length - 1]
            val silence = when (lastChar) {
                ',' -> commaMs
                '.', '!', '?' -> sentenceMs
                else -> 0
            }
            result.add(Pair(seg, silence))
            lastEnd = matcher.end()
        }
        if (lastEnd < trimmed.length) {
            val tail = trimmed.substring(lastEnd).trim()
            if (tail.isNotEmpty()) result.add(Pair(tail, 0))
        }
        return if (result.isEmpty()) listOf(Pair(trimmed, 0)) else result
    }

    /** Synthesize each segment, concatenate PCM, insert silence (zero samples) after each segment. Returns null if error (promise already rejected). */
    private fun synthesizeSegmentsWithSilence(
        modelPath: String,
        configPath: String,
        espeakPath: String,
        segments: List<Pair<String, Int>>,
        promise: Promise
    ): Pair<ByteArray, Int>? {
        var combinedRate = 0
        val combined = mutableListOf<ByteArray>()
        for ((i, seg) in segments.withIndex()) {
            val (segText, silenceMs) = seg
            val result = nativeSynthesize(modelPath, configPath, espeakPath, segText)
                ?: run {
                    promise.reject("E_SYNTHESIS", "Native synthesize returned null for segment ${i + 1}")
                    return null
                }
            if (result.size < 2) {
                promise.reject("E_SYNTHESIS", "Synthesis failed for segment ${i + 1}: invalid result")
                return null
            }
            val first = result[0]
            val second = result[1]
            if (first == null && second is String) {
                promise.reject("E_SYNTHESIS", "Segment ${i + 1}: $second")
                return null
            }
            val pcm = first as? ByteArray ?: run {
                promise.reject("E_SYNTHESIS", "Segment ${i + 1}: no audio")
                return null
            }
            val rate = (second as? Number)?.toInt() ?: 0
            if (pcm.isEmpty() || rate <= 0) {
                promise.reject("E_SYNTHESIS", "Segment ${i + 1}: empty audio or invalid sample rate")
                return null
            }
            if (combinedRate == 0) combinedRate = rate
            combined.add(pcm)
            if (silenceMs > 0 && combinedRate > 0) {
                val silenceSamples = (combinedRate.toLong() * silenceMs / 1000).toInt()
                combined.add(ByteArray(silenceSamples * 2)) // 16-bit = 2 bytes per sample
            }
        }
        if (combinedRate <= 0) {
            promise.reject("E_SYNTHESIS", "No audio produced")
            return null
        }
        val totalBytes = combined.sumOf { it.size }
        val out = ByteArray(totalBytes)
        var offset = 0
        for (chunk in combined) {
            chunk.copyInto(out, offset)
            offset += chunk.size
        }
        Log.d(TAG, "segments: ${segments.size} parts, commas=${segments.any { it.second in 1..124 }}, sentences=${segments.any { it.second >= 125 }}")
        return Pair(out, combinedRate)
    }

    private fun getOptionInt(key: String, default: Int): Int {
        val opts = lastSpeakOptions ?: return default
        return if (opts.hasKey(key)) opts.getDouble(key).toInt() else default
    }

    /** Post-synth: leading silence, optional dB gain, optional high-pass on int16 LE PCM (same keys as iOS). */
    private fun applyPiperPostSynthesisRender(pcm: ByteArray, sampleRate: Int): ByteArray {
        val opts = lastSpeakOptions ?: return pcm
        var work = pcm
        if (opts.hasKey("renderLeadSilenceMs")) {
            val leadMs = opts.getDouble("renderLeadSilenceMs").toLong()
            if (leadMs > 0 && sampleRate > 0) {
                val n = (sampleRate * leadMs / 1000).toInt().coerceIn(0, 10_000_000)
                if (n > 0) {
                    val silence = ByteArray(n * 2)
                    val combined = ByteArray(silence.size + work.size)
                    silence.copyInto(combined)
                    work.copyInto(combined, silence.size)
                    work = combined
                }
            }
        }
        if (opts.hasKey("renderPostGainDb")) {
            val gainDb = opts.getDouble("renderPostGainDb")
            val linear = 10.0.pow(gainDb / 20.0)
            val bb = ByteBuffer.wrap(work).order(ByteOrder.LITTLE_ENDIAN)
            val samples = work.size / 2
            for (i in 0 until samples) {
                val s = bb.getShort(i * 2).toInt()
                val v = (s * linear).roundToInt().coerceIn(-32768, 32767)
                bb.putShort(i * 2, v.toShort())
            }
        }
        val hpHz = if (opts.hasKey("renderHighPassHz")) opts.getDouble("renderHighPassHz") else 0.0
        if (hpHz > 0) {
            applyHighPassPcm16LE(work, sampleRate, hpHz)
        }
        return work
    }

    private fun applyHighPassPcm16LE(pcm: ByteArray, sampleRate: Int, cutoffHz: Double) {
        if (pcm.size < 2 || cutoffHz <= 0 || sampleRate <= 0) return
        var r = exp(-2.0 * PI * cutoffHz / sampleRate)
        if (r < 0.0) r = 0.0
        if (r > 0.999999) r = 0.999999
        var x1 = 0f
        var y1 = 0f
        val bb = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
        val n = pcm.size / 2
        for (i in 0 until n) {
            val x0 = bb.getShort(i * 2) / 32768f
            val y0 = x0 - x1 + (r * y1).toFloat()
            x1 = x0
            y1 = y0
            val out = (y0 * 32768f).roundToInt().coerceIn(-32768, 32767)
            bb.putShort(i * 2, out.toShort())
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
