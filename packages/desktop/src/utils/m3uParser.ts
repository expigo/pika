/**
 * VirtualDJ M3U Parser
 * Parses VirtualDJ's extended M3U files to extract track metadata and timestamps.
 */

// ============================================================================
// Types
// ============================================================================

export interface ParsedTrack {
  /** Unix timestamp when the track was played */
  timestamp: number;
  /** Artist name */
  artist: string;
  /** Track title */
  title: string;
  /** Original file path (if available) */
  filePath?: string;
}

// ============================================================================
// HTML Entity Decoding
// ============================================================================

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&nbsp;": " ",
};

/**
 * Decode common HTML entities in a string
 */
function decodeHtmlEntities(text: string): string {
  let decoded = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.replace(new RegExp(entity, "gi"), char);
  }
  // Also handle numeric entities like &#123;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 10)),
  );
  // And hex entities like &#x7B;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
  return decoded;
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse VirtualDJ extended M3U file content
 *
 * VDJ M3U format example:
 * ```
 * #EXTM3U
 * #EXTVDJ:<lastplaytime>1735555200</lastplaytime><artist>Artist Name</artist><title>Track Title</title>
 * /path/to/file.mp3
 * ```
 *
 * @param fileContent - Raw content of the M3U file
 * @returns Array of parsed tracks sorted by timestamp (ascending)
 */
export function parseVdjM3u(fileContent: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = [];
  const lines = fileContent.split("\n");

  // Regex patterns for VDJ extended info
  const timestampRegex = /<lastplaytime>(\d+)<\/lastplaytime>/i;
  const artistRegex = /<artist>([^<]*)<\/artist>/i;
  const titleRegex = /<title>([^<]*)<\/title>/i;

  let currentTrack: Partial<ParsedTrack> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and standard M3U header
    if (!trimmed || trimmed === "#EXTM3U") {
      continue;
    }

    // Parse VDJ extended info line
    if (trimmed.startsWith("#EXTVDJ:")) {
      const timestampMatch = trimmed.match(timestampRegex);
      const artistMatch = trimmed.match(artistRegex);
      const titleMatch = trimmed.match(titleRegex);

      if (timestampMatch && artistMatch && titleMatch) {
        currentTrack = {
          timestamp: Number.parseInt(timestampMatch[1], 10),
          artist: decodeHtmlEntities(artistMatch[1].trim()),
          title: decodeHtmlEntities(titleMatch[1].trim()),
        };
      }
      continue;
    }

    // If we have a current track and this line is a file path, attach it
    if (currentTrack && !trimmed.startsWith("#")) {
      currentTrack.filePath = trimmed;

      // Only add if we have required fields
      if (
        currentTrack.timestamp &&
        currentTrack.artist !== undefined &&
        currentTrack.title !== undefined
      ) {
        tracks.push(currentTrack as ParsedTrack);
      }

      currentTrack = null;
    }
  }

  // Sort by timestamp ascending (oldest first)
  tracks.sort((a, b) => a.timestamp - b.timestamp);

  return tracks;
}

/**
 * Extract just the filename from a full path
 */
export function extractFilename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

/**
 * Normalize artist/title for comparison (lowercase, trim, remove extra spaces)
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, ""); // Remove special characters
}
