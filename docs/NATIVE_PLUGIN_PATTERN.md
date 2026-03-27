# Native Plugin Integration Pattern

This document defines the reusable integration, debugging, and validation pattern for native plugins that expose hardware or OS capabilities to JavaScript. It is the repo-local pattern that sits between the generic rules in [PLUGIN_CONTRACT.md](./PLUGIN_CONTRACT.md) and any domain-specific contract such as [NATIVE_MIC_CONTRACT.md](./NATIVE_MIC_CONTRACT.md). The `atlas-native-mic` work is the motivating example, but this document is intentionally generic and applies to future native plugins as well.

## Purpose

Use this document as the standard pattern for designing, wiring, validating, and debugging native plugins that bridge device capabilities into the app. The goal is to keep plugin responsibilities narrow, make JS/native boundaries explicit, and provide a repeatable process for proving whether a plugin is correctly exposed to JS, correctly instrumented, and actually functioning on device.

## When to use this pattern

Apply this pattern to any plugin that interfaces with hardware, OS services, or device capabilities such as audio, microphone, camera, sensors, Bluetooth, filesystem-like native access, notifications, background execution, or similar native-only surfaces. If a plugin is expected to surface native facts to JS and can fail due to registration, build, bridge, or platform integration issues, this pattern applies.

## Ownership split

The native plugin owns hardware and session facts only. The app, orchestrator, or other semantic owner remains responsible for user-facing meaning, policy, retries, fallback, and lifecycle truth. Plugins emit facts, not decisions. Native code can report what happened at the hardware or OS boundary, but it must not decide what the app means by those facts or take semantic actions on the app's behalf.

## Required JS contract shape

The JS-facing contract should stay narrow and imperative. Native plugins should expose a small command surface for explicit requests such as init, start, stop, cancel, teardown, or debug info, and they should emit facts and structured events back to JS. Native layers must not expose semantic actions such as submit, fallback selection, policy transitions, or user-facing state decisions. The command surface should be explicit, typed, and stable enough for JS to validate availability and observe failures without guessing.

## Required native exposure parity

The exported module name must match what JS expects to load. iOS and Android must expose the same JS-visible module identity, the same method names, and the same event names at the boundary. A plugin is not considered contract-complete until both platforms present the same JS-facing surface, even if their internal native implementation details differ. Platform-specific implementation choices are allowed below the boundary, but contract names, payload shapes, and event semantics must stay aligned.

## Registration and autolinking verification pattern

Start by verifying the package is actually installed in the app dependency graph. Then verify the native registration surfaces: package metadata, `react-native.config.js`, podspec or iOS equivalent, Android package wiring, and any generated autolinking outputs. Confirm that generated artifacts such as autolinking manifests, `PackageList`, `Podfile.lock`, or equivalent build products reflect the plugin on each platform. Finally, verify that the running app binary actually includes the native code, because a correctly linked repo state is still insufficient if the installed binary predates the native integration.

## Runtime availability debugging flow

Use the same sequence every time. First, verify the config or environment gate that enables the plugin path. Second, verify the JS availability check and record exactly what object or method it expects to exist. Third, verify the native exported name and mechanism on iOS and Android. Fourth, verify autolinking or registration and generated build outputs. Fifth, verify the module is actually visible to JS at runtime. Sixth, verify the event subscription path, including whether listeners can attach and whether native events can reach diagnostics. Seventh, verify actual device behavior after availability is proven. Eighth, separate native-layer success from downstream transport or service failures so a native capture success is not misclassified as a plugin failure.

## Validation instrumentation pattern

Validation should stay seam-local and observational. Add validation logs around the JS/native seam, add event subscription diagnostics where plugins emit events, and add timing markers for start, finalize, cancel, or similar lifecycle edges when those timings help distinguish registration problems from runtime behavior. Instrumentation should help prove which layer is failing without changing semantic behavior or becoming a second source of truth.

## Common failure classes

The reusable failure classes for native plugin integration are `WRONG_JS_EXPOSURE_PATH`, `MODULE_NAME_MISMATCH`, `METHOD_EXPORT_MISMATCH`, `AUTOLINK_OR_REGISTRATION_FAILURE`, `NATIVE_BINARY_NOT_UPDATED`, `ARCHITECTURE_BRIDGE_MISMATCH`, `CONTRACT_SHAPED_BUT_UNPROVEN`, and `DOWNSTREAM_TRANSPORT_FAILURE_AFTER_NATIVE_SUCCESS`. These labels are intended to keep debugging outcomes precise and comparable across plugins. They separate exposure failures from runtime behavior failures and separate native success from later service-layer failures.

## Closure checklist

A native plugin is only considered closed when a contract exists, JS and native exposure match, the module is available at runtime, event subscription is working, platform parity has been verified, behavior has been validated on device, and any downstream service failures have been explicitly separated from native plugin failures. Closure requires proving the plugin is both wired and observable, not merely implemented in source.
