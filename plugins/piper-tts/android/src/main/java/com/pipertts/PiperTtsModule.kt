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
import java.nio.ShortBuffer
import java.util.concurrent.Executors
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

    private val tailFadeMs = 8.0

    /** ~1–3 ms @ 48 kHz; micro-fade at segment join boundaries to prevent clicks. */
    private val boundaryFadeSamples = 96

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
                val result = nativeSynthesize(modelPath, configPath, espeakPath, text)
                val parsed = parseNativePcmResult(result, promise, "full text")
                    ?: run {
                        activeSpeakPromise = null
                        return@execute
                    }
                var pcm = parsed.first
                val sampleRate = parsed.second
                Log.d(TAG, "[Piper] single-pass synthesize ok: ${pcm.size / 2} samples @ $sampleRate Hz")
                if (sentenceMs > 0 || commaMs > 0) {
                    pcm = insertPostSynthPunctuationPauses(pcm, sampleRate, text.trim(), commaMs, sentenceMs)
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

    /**
     * Parses native [ByteArray, sampleRate] or error string; rejects [promise] on failure.
     */
    private fun parseNativePcmResult(result: Array<Any>?, promise: Promise, errLabel: String): Pair<ByteArray, Int>? {
        if (result == null || result.size < 2) {
            Log.e(TAG, "[E_SYNTHESIS] Native synthesize returned invalid result ($errLabel)")
            promise.reject("E_SYNTHESIS", "Synthesis failed. Native Piper pipeline returned no result.")
            return null
        }
        val first = result[0]
        val second = result[1]
        if (first == null && second is String) {
            Log.e(TAG, "[E_SYNTHESIS] $second")
            promise.reject("E_SYNTHESIS", second)
            return null
        }
        @Suppress("UNCHECKED_CAST")
        val pcmBytes = first as? ByteArray ?: run {
            promise.reject("E_SYNTHESIS", "Native synthesize returned no audio.")
            return null
        }
        val rate = (second as? Number)?.toInt() ?: 0
        if (pcmBytes.isEmpty() || rate <= 0) {
            promise.reject("E_SYNTHESIS", "Native synthesize returned empty audio")
            return null
        }
        return Pair(pcmBytes, rate)
    }

    private data class CharPause(val insertAfter: Int, val ms: Int)
    private data class SamplePause(val pos: Int, val ms: Int)

    /**
     * Single-pass PCM only: proportional UTF-16 pause overlay (matches iOS). No multi-segment synthesis.
     */
    private fun insertPostSynthPunctuationPauses(
        pcm: ByteArray,
        sampleRate: Int,
        text: String,
        commaMs: Int,
        sentenceMs: Int,
    ): ByteArray {
        if (commaMs <= 0 && sentenceMs <= 0) return pcm
        val n = pcm.size / 2
        if (n < 4) return pcm
        val L = text.length
        if (L < 2) return pcm
        val raw = mutableListOf<CharPause>()
        var i = 0
        while (i < L) {
            val c = text[i]
            if (c in '\uD800'..'\uDBFF') {
                i += 2
                continue
            }
            when {
                c == ',' -> {
                    if (commaMs > 0 && i + 1 < L) raw.add(CharPause(i + 1, commaMs))
                    i++
                }
                c == '\u2026' -> {
                    if (sentenceMs > 0 && i + 1 < L) raw.add(CharPause(i + 1, sentenceMs))
                    i++
                }
                c == '.' -> {
                    var run = 1
                    while (i + run < L && text[i + run] == '.') run++
                    val insertAfter = i + run
                    if (run >= 2) {
                        if (sentenceMs > 0 && insertAfter < L) raw.add(CharPause(insertAfter, sentenceMs))
                    } else {
                        if (sentenceMs > 0 && i + 1 < L) raw.add(CharPause(i + 1, sentenceMs))
                    }
                    i += run
                }
                c == '!' || c == '?' -> {
                    if (sentenceMs > 0 && i + 1 < L) raw.add(CharPause(i + 1, sentenceMs))
                    i++
                }
                else -> i++
            }
        }
        if (raw.isEmpty()) return pcm
        raw.sortBy { it.insertAfter }
        val dedup = mutableListOf<CharPause>()
        for (e in raw) {
            val last = dedup.lastOrNull()
            if (last != null && last.insertAfter == e.insertAfter) {
                if (e.ms > last.ms) dedup[dedup.size - 1] = CharPause(e.insertAfter, e.ms)
            } else {
                dedup.add(e)
            }
        }
        val sampleEvents = mutableListOf<SamplePause>()
        for (e in dedup) {
            val pos = (e.insertAfter.toLong() * n / L).toInt()
            if (pos <= 0 || pos >= n) continue
            sampleEvents.add(SamplePause(pos, e.ms))
        }
        if (sampleEvents.isEmpty()) return pcm
        val minGap = maxOf(240, (sampleRate * 0.005).roundToInt())
        sampleEvents.sortBy { it.pos }
        val merged = mutableListOf<SamplePause>()
        for (e in sampleEvents) {
            val last = merged.lastOrNull()
            if (last == null) {
                merged.add(e)
            } else if (e.pos == last.pos) {
                if (e.ms > last.ms) merged[merged.size - 1] = SamplePause(e.pos, e.ms)
            } else if (e.pos - last.pos < minGap) {
                if (e.ms > last.ms) merged[merged.size - 1] = SamplePause(last.pos, e.ms)
            } else {
                merged.add(e)
            }
        }
        merged.sortByDescending { it.pos }
        var work = pcm
        for (ev in merged) {
            val silenceSamples = (sampleRate * ev.ms / 1000.0).roundToInt().coerceAtLeast(0)
            if (silenceSamples == 0) continue
            work = insertSilenceAtSampleWithFades(work, ev.pos, silenceSamples)
        }
        Log.d(TAG, "[Piper] post-synth pause overlay: ${merged.size} events, ${work.size / 2} samples out")
        return work
    }

    private fun insertSilenceAtSampleWithFades(pcm: ByteArray, pos: Int, silenceSamples: Int): ByteArray {
        val n = pcm.size / 2
        if (pos <= 0 || pos >= n || silenceSamples <= 0) return pcm
        var fade = minOf(boundaryFadeSamples, pos, n - pos)
        if (fade <= 0) return pcm
        val left = pcm.copyOfRange(0, pos * 2)
        val right = pcm.copyOfRange(pos * 2, pcm.size)
        val bbL = ByteBuffer.wrap(left).order(ByteOrder.LITTLE_ENDIAN)
        applyBoundaryFadeInt16(bbL, left.size / 2 - fade, fade, false)
        val bbR = ByteBuffer.wrap(right).order(ByteOrder.LITTLE_ENDIAN)
        applyBoundaryFadeInt16(bbR, 0, fade, true)
        val silence = ByteArray(silenceSamples * 2)
        return concatBytes(concatBytes(left, silence), right)
    }

    /** Linear fade on int16 LE PCM; [sampleIndex] is first sample index (not byte). */
    private fun applyBoundaryFadeInt16(bb: ByteBuffer, sampleIndex: Int, length: Int, fadeIn: Boolean) {
        if (length <= 0) return
        bb.order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until length) {
            val idx = sampleIndex + i
            val t = i.toDouble() / length.toDouble()
            val gain = if (fadeIn) t else (1.0 - t)
            val off = idx * 2
            val s = bb.getShort(off).toInt()
            val v = (s * gain).roundToInt().coerceIn(-32768, 32767)
            bb.putShort(off, v.toShort())
        }
    }

    private fun concatBytes(a: ByteArray, b: ByteArray): ByteArray {
        val out = a.copyOf(a.size + b.size)
        b.copyInto(out, a.size)
        return out
    }

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
        work = applyLayer2DesyncPcm16LE(work, sampleRate, opts)
        applyEndFadePcm16LE(work, sampleRate, tailFadeMs)
        return work
    }

    /** Dry + delayed wet (gain on wet only); extends PCM length. No-op when layer2 disabled. */
    private fun applyLayer2DesyncPcm16LE(pcm: ByteArray, sampleRate: Int, opts: ReadableMap): ByteArray {
        if (!opts.hasKey("renderLayer2Enabled") || !opts.getBoolean("renderLayer2Enabled")) {
            return pcm
        }
        if (sampleRate <= 0 || pcm.size < 2) return pcm
        val delayMs = if (opts.hasKey("renderLayer2DelayMs")) {
            opts.getDouble("renderLayer2DelayMs").coerceAtLeast(0.0)
        } else {
            0.0
        }
        val gainDb = if (opts.hasKey("renderLayer2GainDb")) opts.getDouble("renderLayer2GainDb") else 0.0
        val nSamples = pcm.size / 2
        val dSamples = (sampleRate * delayMs / 1000.0).toInt().coerceIn(0, 100_000)
        var linear = 10.0.pow(gainDb / 20.0)
        if (linear < 0 || linear.isNaN() || linear.isInfinite()) linear = 0.0
        val outSamples = nSamples + dSamples
        val out = ByteArray(outSamples * 2)
        val inputShorts: ShortBuffer =
            ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val outShorts: ShortBuffer =
            ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        for (i in 0 until outSamples) {
            var sum = 0.0
            if (i < nSamples) {
                sum += inputShorts.get(i).toDouble()
            }
            val srcIdx = i - dSamples
            if (srcIdx >= 0 && srcIdx < nSamples) {
                sum += inputShorts.get(srcIdx).toDouble() * linear
            }
            outShorts.put(i, sum.roundToInt().coerceIn(-32768, 32767).toShort())
        }
        return out
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

    private fun applyEndFadePcm16LE(pcm: ByteArray, sampleRate: Int, fadeMs: Double) {
        if (pcm.size < 2 || sampleRate <= 0 || fadeMs <= 0.0) return
        val samples = pcm.size / 2
        var fadeSamples = (sampleRate * fadeMs / 1000.0).roundToInt()
        if (fadeSamples <= 0) return
        if (fadeSamples > samples) fadeSamples = samples
        val start = samples - fadeSamples
        val bb = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until fadeSamples) {
            val idx = start + i
            val s = bb.getShort(idx * 2).toInt()
            val gain = (fadeSamples - i - 1).toDouble() / fadeSamples.toDouble()
            val out = (s * gain).roundToInt().coerceIn(-32768, 32767)
            bb.putShort(idx * 2, out.toShort())
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
