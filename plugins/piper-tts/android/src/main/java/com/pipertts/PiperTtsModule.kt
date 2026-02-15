package com.pipertts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.Executors
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession

class PiperTtsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PiperTts"

    private val executor = Executors.newSingleThreadExecutor()

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
                Log.d(TAG, "speak: synthesizing (length ${text.length})")
                val config = loadConfig(configPath) ?: run {
                    Log.e(TAG, "[E_CONFIG] Failed to load model config")
                    promise.reject("E_CONFIG", "Failed to load model config")
                    return@execute
                }
                val phonemeIds = textToPhonemeIds(config, text)
                if (phonemeIds.isEmpty()) {
                    Log.e(TAG, "[E_PHONEME] Could not convert text to phoneme IDs")
                    promise.reject("E_PHONEME", "Could not convert text to phoneme IDs")
                    return@execute
                }
                val env = OrtEnvironment.getEnvironment()
                val sessionOptions = OrtSession.SessionOptions()
                val session = env.createSession(modelPath, sessionOptions)
                try {
                    val sampleRate = config.getJSONObject("audio").getInt("sample_rate")
                    val inference = config.getJSONObject("inference")
                    val noiseScale = inference.optDouble("noise_scale", 0.667).toFloat()
                    val lengthScale = inference.optDouble("length_scale", 1.0).toFloat()
                    val noiseW = inference.optDouble("noise_w", 0.8).toFloat()

                    val inputTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(phonemeIds.toLongArray()), longArrayOf(1, phonemeIds.size.toLong()))
                    val inputLengthsTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(longArrayOf(phonemeIds.size.toLong())), longArrayOf(1))
                    val scalesTensor = OnnxTensor.createTensor(env, java.nio.FloatBuffer.wrap(floatArrayOf(noiseScale, lengthScale, noiseW)), longArrayOf(3))
                    val numSpeakers = config.optInt("num_speakers", 1)
                    val inputs = mutableMapOf<String, OnnxTensor>(
                        "input" to inputTensor,
                        "input_lengths" to inputLengthsTensor,
                        "scales" to scalesTensor
                    )
                    var sidTensor: OnnxTensor? = null
                    if (numSpeakers > 1) {
                        sidTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(longArrayOf(0)), longArrayOf(1))
                        inputs["sid"] = sidTensor
                    }
                    try {
                        val results = session.run(inputs)
                        try {
                            val output = results.get(0) as OnnxTensor
                            val floatData = output.getFloatBuffer()
                            val pcm = floatToInt16(floatData)
                            playPcm(pcm, sampleRate, promise)
                        } finally {
                            results.close()
                        }
                    } finally {
                        inputTensor.close()
                        inputLengthsTensor.close()
                        scalesTensor.close()
                        sidTensor?.close()
                    }
                } finally {
                    session.close()
                    sessionOptions.close()
                }
            } catch (e: Exception) {
                Log.e(TAG, "[E_PIPER] Piper speak failed", e)
                promise.reject("E_PIPER", e.message ?: "Piper synthesis failed")
            }
        }
    }

    private fun loadConfig(configPath: String): JSONObject? {
        return try {
            JSONObject(File(configPath).readText())
        } catch (e: Exception) {
            Log.e(TAG, "[E_CONFIG] Load config failed", e)
            null
        }
    }

    private fun textToPhonemeIds(config: JSONObject, text: String): List<Long> {
        val idMap = config.getJSONObject("phoneme_id_map")
        fun idFor(key: String): Long {
            if (!idMap.has(key)) return 3
            val arr = idMap.getJSONArray(key)
            return if (arr.length() > 0) arr.getLong(0) else 3
        }
        val bos = idFor("^")
        val eos = idFor("$")
        val pad = idFor("_")
        val space = idFor(" ")
        val ids = mutableListOf<Long>()
        ids.add(bos)
        for (c in text.lowercase()) {
            val ch = c.toString()
            if (idMap.has(ch)) {
                ids.add(idFor(ch))
            } else if (c == ' ' || c == '\n' || c == '\t') {
                ids.add(space)
            }
        }
        ids.add(pad)
        ids.add(eos)
        return ids
    }

    private fun floatToInt16(floatBuffer: FloatBuffer): ByteArray {
        val n = floatBuffer.remaining()
        val buffer = ByteBuffer.allocate(n * 2).order(ByteOrder.nativeOrder())
        val shortBuf = buffer.asShortBuffer()
        while (floatBuffer.hasRemaining()) {
            val s = (floatBuffer.get().coerceIn(-1f, 1f) * 32767).toInt().toShort()
            shortBuf.put(s)
        }
        return buffer.array()
    }

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

    private fun copyAssetToFile(assetPath: String, dest: File): Boolean {
        return try {
            reactApplicationContext.assets.open(assetPath).use { input ->
                FileOutputStream(dest).use { output ->
                    input.copyTo(output)
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "[E_NO_MODEL] Copy asset failed: $assetPath", e)
            false
        }
    }

    companion object {
        private const val TAG = "PiperTts"
    }
}
