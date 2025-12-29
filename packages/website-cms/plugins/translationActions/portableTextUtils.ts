/**
 * Utility functions for translating Portable Text while preserving structure
 * Uses JSON-based approach for maximum compatibility
 */

import type {PortableTextBlock} from '@portabletext/types'

/**
 * Serialize Portable Text blocks to JSON string for translation
 */
export function serializePortableText(blocks: PortableTextBlock[]): string {
  if (!blocks || !Array.isArray(blocks)) {
    return '[]'
  }
  return JSON.stringify(blocks, null, 2)
}

/**
 * Parse translated Portable Text JSON back to blocks
 */
export function parsePortableText(json: string): PortableTextBlock[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      console.error('Parsed JSON is not an array')
      return []
    }
    return parsed
  } catch (error) {
    console.error('Failed to parse Portable Text JSON:', error)
    return []
  }
}
