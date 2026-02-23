/**
 * Pack file reader helpers.
 * The app must provide a PackFileReader that reads paths relative to pack root
 * (e.g. from app document directory via a native module or react-native-fs).
 */

import { Platform } from 'react-native';
import type { PackFileReader } from './types';

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = base64.replace(/=+$/, '').length;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const idx = chars.indexOf(base64[i]!);
    if (idx === -1) continue;
    buf = (buf << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/**
 * Returns a reader that throws on any read. Use when the pack is not yet configured
 * so that init() or ask() fails with a clear message instead of silent errors.
 */
export function createThrowReader(message: string): PackFileReader {
  return {
    async readFile() {
      throw new Error(message);
    },
    async readFileBinary() {
      throw new Error(message);
    },
  };
}

/** Pack root path in the app bundle: Android assets are merged at root (""), iOS uses "content_pack" if folder was added to Xcode. */
export const BUNDLE_PACK_ROOT = Platform.OS === 'android' ? '' : 'content_pack';

/**
 * Returns a PackFileReader that reads from the bundled content pack (Android assets / iOS app bundle).
 * Requires the RagPackReader native module. Returns null if the module is not available.
 */
export function createBundlePackReader(): PackFileReader | null {
  try {
    const { NativeModules } = require('react-native');
    const RagPackReader = NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
    if (!RagPackReader || typeof RagPackReader.readFile !== 'function') return null;
    const root = BUNDLE_PACK_ROOT;
    const prefix = root ? root + '/' : '';
    return {
      async readFile(relativePath: string): Promise<string> {
        const path = prefix + relativePath.replace(/^\//, '');
        return RagPackReader.readFile(path);
      },
      async readFileBinary(relativePath: string): Promise<ArrayBuffer> {
        const path = prefix + relativePath.replace(/^\//, '');
        const base64 = await RagPackReader.readFileBinary(path);
        const bytes = base64ToBytes(base64);
        return bytes.buffer;
      },
    };
  } catch {
    return null;
  }
}

/**
 * Returns a PackFileReader that reads from a pack root on the filesystem (e.g. Documents/content_pack).
 * Use after copyBundlePackToDocuments so the app uses the on-device copy and avoids rebundling.
 * Requires RagPackReader.readFileAtPath / readFileBinaryAtPath. Returns null if not available.
 */
export function createDocumentsPackReader(packRoot: string): PackFileReader | null {
  if (!packRoot || typeof packRoot !== 'string') return null;
  try {
    const { NativeModules } = require('react-native');
    const RagPackReader = NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
    if (
      !RagPackReader ||
      typeof RagPackReader.readFileAtPath !== 'function' ||
      typeof RagPackReader.readFileBinaryAtPath !== 'function'
    )
      return null;
    const root = packRoot.replace(/\/+$/, '');
    return {
      async readFile(relativePath: string): Promise<string> {
        const path = `${root}/${relativePath.replace(/^\//, '')}`;
        return RagPackReader.readFileAtPath(path);
      },
      async readFileBinary(relativePath: string): Promise<ArrayBuffer> {
        const path = `${root}/${relativePath.replace(/^\//, '')}`;
        const base64 = await RagPackReader.readFileBinaryAtPath(path);
        const bytes = base64ToBytes(base64);
        return bytes.buffer;
      },
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the path to the content pack in Documents. If the pack is already there (manifest present),
 * returns that path. Otherwise returns empty string (caller should then copy and retry).
 */
export async function getContentPackPathInDocuments(): Promise<string> {
  try {
    const { NativeModules } = require('react-native');
    const RagPackReader = NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
    if (!RagPackReader || typeof RagPackReader.getContentPackPathInDocuments !== 'function')
      return '';
    return (await RagPackReader.getContentPackPathInDocuments()) ?? '';
  } catch {
    return '';
  }
}

/**
 * Copies the bundled content_pack to Documents (one-time). Idempotent: if pack already in Documents, skips copy.
 * Returns the Documents pack path. Rejects if bundle has no pack or copy fails.
 */
export async function copyBundlePackToDocuments(): Promise<string> {
  const { NativeModules } = require('react-native');
  const RagPackReader = NativeModules.RagPackReader ?? NativeModules.RagPackReaderModule;
  if (!RagPackReader || typeof RagPackReader.copyBundlePackToDocuments !== 'function')
    throw new Error('RagPackReader.copyBundlePackToDocuments not available');
  return RagPackReader.copyBundlePackToDocuments();
}
