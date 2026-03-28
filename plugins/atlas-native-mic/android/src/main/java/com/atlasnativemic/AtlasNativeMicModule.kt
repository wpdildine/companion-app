package com.atlasnativemic

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class AtlasNativeMicModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var recorder: MediaRecorder? = null
    private var activeSessionId: String? = null
    private var recordingPath: String? = null
    private var captureActive = false
    private var startedAtMs: Long = 0
    private var lastTerminalSessionId: String? = null
    private var lastTerminalWasFinalize = false
    private var tornDown = false

    override fun getName(): String = "AtlasNativeMic"

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "sendEvent failed: ${e.message}")
        }
    }

    private fun micPayload(sessionId: String, phase: String, extras: Map<String, String>? = null): WritableMap {
        val m = Arguments.createMap()
        m.putString("sessionId", sessionId)
        m.putString("phase", phase)
        extras?.forEach { (k, v) -> m.putString(k, v) }
        return m
    }

    @ReactMethod
    fun init(promise: Promise) {
        if (tornDown) {
            promise.reject("E_TORN_DOWN", "AtlasNativeMic torn down")
            return
        }
        Log.i(TAG, "[AtlasNativeMic] init")
        promise.resolve(null)
    }

    @ReactMethod
    fun startCapture(sessionId: String, promise: Promise) {
        if (tornDown) {
            promise.reject("E_TORN_DOWN", "AtlasNativeMic torn down")
            return
        }
        if (sessionId.isBlank()) {
            promise.reject("E_INVALID", "sessionId required")
            return
        }
        mainHandler.post {
            if (captureActive) {
                if (activeSessionId == sessionId) {
                    Log.i(TAG, "[AtlasNativeMic] startCapture duplicate same session")
                    promise.resolve(null)
                    return@post
                }
                promise.reject("E_SESSION_ACTIVE", "Another capture session is active")
                return@post
            }
            val ctx = reactApplicationContext
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                promise.reject("E_PERMISSION", "RECORD_AUDIO not granted")
                return@post
            }
            val out = File(ctx.cacheDir, "atlas_mic_${sessionId}.m4a")
            if (out.exists()) out.delete()
            recordingPath = out.absolutePath
            try {
                val r = MediaRecorder()
                r.setAudioSource(MediaRecorder.AudioSource.MIC)
                r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                r.setOutputFile(out.absolutePath)
                r.prepare()
                r.start()
                recorder = r
                activeSessionId = sessionId
                captureActive = true
                startedAtMs = System.currentTimeMillis()
                lastTerminalSessionId = null
                lastTerminalWasFinalize = false
                sendEvent("mic_capture_started", micPayload(sessionId, "capturing"))
                Log.i(TAG, "[AtlasNativeMic] capture started $sessionId")
                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "[AtlasNativeMic][E_AUDIO] start failed", e)
                recordingPath = null
                promise.reject("E_AUDIO", e.message ?: "start failed", e)
            }
        }
    }

    @ReactMethod
    fun stopFinalize(sessionId: String, promise: Promise) {
        if (tornDown) {
            promise.reject("E_TORN_DOWN", "AtlasNativeMic torn down")
            return
        }
        if (sessionId.isBlank()) {
            promise.reject("E_INVALID", "sessionId required")
            return
        }
        mainHandler.post {
            if (!captureActive) {
                if (sessionId == lastTerminalSessionId && lastTerminalWasFinalize) {
                    Log.i(TAG, "[AtlasNativeMic] stopFinalize duplicate silent no-op")
                    val dup = Arguments.createMap()
                    dup.putString("uri", "")
                    dup.putInt("durationMillis", 0)
                    dup.putBoolean("duplicate", true)
                    promise.resolve(dup)
                    return@post
                }
                promise.reject("E_NO_SESSION", "No active capture for sessionId")
                return@post
            }
            if (activeSessionId != sessionId) {
                promise.reject("E_NO_SESSION", "sessionId mismatch")
                return@post
            }
            sendEvent("mic_capture_stopping", micPayload(sessionId, "stopping"))
            val path = recordingPath
            val startMs = startedAtMs
            try {
                recorder?.apply {
                    try {
                        stop()
                    } catch (_: Exception) {
                    }
                    release()
                }
                recorder = null
            } catch (e: Exception) {
                Log.e(TAG, "stop", e)
            }
            captureActive = false
            activeSessionId = null
            recordingPath = null
            val durationMs = if (startMs > 0) {
                (System.currentTimeMillis() - startMs).toInt().coerceAtLeast(0)
            } else {
                0
            }
            lastTerminalSessionId = sessionId
            lastTerminalWasFinalize = true
            sendEvent("mic_capture_finalized", micPayload(sessionId, "finalized"))
            val uri = if (path != null) "file://$path" else ""
            val result = Arguments.createMap()
            result.putString("uri", uri)
            result.putInt("durationMillis", durationMs)
            result.putBoolean("duplicate", false)
            Log.i(TAG, "[AtlasNativeMic] capture finalized $sessionId ms=$durationMs")
            promise.resolve(result)
        }
    }

    @ReactMethod
    fun cancel(sessionId: String, promise: Promise) {
        if (tornDown) {
            Log.i(TAG, "[AtlasNativeMic] cancel duplicate silent no-op (torn down)")
            promise.resolve(null)
            return
        }
        if (sessionId.isBlank()) {
            promise.reject("E_INVALID", "sessionId required")
            return
        }
        mainHandler.post {
            if (!captureActive) {
                if (sessionId == lastTerminalSessionId) {
                    Log.i(TAG, "[AtlasNativeMic] cancel duplicate silent no-op")
                    promise.resolve(null)
                    return@post
                }
                promise.reject("E_NO_SESSION", "No active capture for sessionId")
                return@post
            }
            if (activeSessionId != sessionId) {
                promise.reject("E_NO_SESSION", "sessionId mismatch")
                return@post
            }
            val path = recordingPath
            try {
                recorder?.apply {
                    try {
                        stop()
                    } catch (_: Exception) {
                    }
                    release()
                }
                recorder = null
            } catch (e: Exception) {
                Log.e(TAG, "cancel stop", e)
            }
            captureActive = false
            activeSessionId = null
            recordingPath = null
            if (path != null) {
                try {
                    File(path).delete()
                } catch (_: Exception) {
                }
            }
            lastTerminalSessionId = sessionId
            lastTerminalWasFinalize = false
            val fail = micPayload(sessionId, "cancelled")
            fail.putString("code", "E_CANCELLED")
            fail.putString("classification", "hardware_session")
            sendEvent("mic_failure", fail)
            Log.i(TAG, "[AtlasNativeMic] capture cancelled $sessionId")
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun teardown(promise: Promise) {
        mainHandler.post {
            try {
                recorder?.apply {
                    try {
                        stop()
                    } catch (_: Exception) {
                    }
                    release()
                }
            } catch (_: Exception) {
            }
            recorder = null
            captureActive = false
            activeSessionId = null
            recordingPath?.let {
                try {
                    File(it).delete()
                } catch (_: Exception) {
                }
            }
            recordingPath = null
            tornDown = true
            Log.i(TAG, "[AtlasNativeMic] teardown")
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getDebugInfo(promise: Promise) {
        val s =
            "AtlasNativeMic Android captureActive=$captureActive activeSession=$activeSessionId tornDown=$tornDown"
        promise.resolve(s)
    }

    companion object {
        private const val TAG = "AtlasNativeMic"
    }
}
