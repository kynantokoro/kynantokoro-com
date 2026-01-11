/**
 * Shared security headers for SharedArrayBuffer support (LÖVE.js projects)
 * These headers enable cross-origin isolation required by SharedArrayBuffer.
 * Used in both development and production environments.
 */
export const SHARED_ARRAY_BUFFER_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;
