/**
 * Extract video duration from MP4 file buffer
 * Reads the moov atom which contains duration information
 */
export async function extractVideoDuration(buffer: Buffer): Promise<number> {
  try {
    // Try to find the moov atom and extract duration
    const duration = findMoovDuration(buffer);
    if (duration > 0) return duration;
    
    // Fallback: return 0 if duration cannot be extracted
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Find moov atom and extract duration
 */
function findMoovDuration(buffer: Buffer): number {
  try {
    // Look for 'moov' atom
    const moovIndex = buffer.indexOf("moov");
    if (moovIndex === -1) return 0;

    // Look for 'mvhd' atom (movie header) within moov
    // mvhd contains timeScale and duration
    const mvhdIndex = buffer.indexOf("mvhd", moovIndex);
    if (mvhdIndex === -1) return 0;

    // mvhdIndex points at the "mvhd" type (not atom start).
    // Layout from this point:
    // +0..+3  : "mvhd"
    // +4      : version
    // +5..+7  : flags
    // version 0 => timescale at +16, duration at +20
    // version 1 => timescale at +24, duration at +28 (64-bit)

    const version = buffer[mvhdIndex + 4];
    const isVersion1 = version === 1;
    const timeScaleOffset = mvhdIndex + (isVersion1 ? 24 : 16);
    const durationOffset = timeScaleOffset + 4;

    if (durationOffset + (isVersion1 ? 8 : 4) > buffer.length) return 0;

    // Read timeScale (big-endian 32-bit)
    const timeScale = buffer.readUInt32BE(timeScaleOffset);
    
    // Read duration (big-endian, either 32 or 64-bit depending on version)
    let duration: number;
    if (isVersion1) {
      // 64-bit value
      const high = buffer.readUInt32BE(durationOffset);
      const low = buffer.readUInt32BE(durationOffset + 4);
      duration = high * 0x100000000 + low;
    } else {
      // 32-bit value
      duration = buffer.readUInt32BE(durationOffset);
    }

    if (timeScale === 0) return 0;

    // Convert to seconds
    return Math.round(duration / timeScale);
  } catch {
    return 0;
  }
}

/**
 * Format duration in seconds to HH:MM:SS format
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
