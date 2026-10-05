//
// Upload size limits and image content sniffing. Pure functions on
// Uint8Array — no Node-only imports, so both server functions and client
// code (e.g. UI copy, pre-checks) can use them.

/** Max decoded size of a single receipt image upload. */
export const MAX_RECEIPT_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

/** Max number of images accepted per receipt scan request. */
export const MAX_RECEIPT_IMAGES = 5;

/** Max decoded size of a statement CSV upload. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5MB

/** Max number of data rows accepted per statement import. */
export const MAX_IMPORT_ROWS = 10_000;

/**
 * Longest base64 string that can decode to at most `maxBytes` bytes.
 * Used to reject oversized payloads by string length, before decoding.
 */
export function base64LengthLimit(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4;
}

export type ImageExt = "jpg" | "png" | "webp";

/**
 * Detects the image type from magic bytes. Strict allowlist — extension
 * and declared MIME type are never trusted. Returns null for anything
 * that is not a JPEG, PNG, or WebP container.
 */
export function sniffImageExt(bytes: Uint8Array): ImageExt | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "webp";
  }

  return null;
}

// ── Metadata stripping ───────────────────────────────────────────────────────
//
// Receipt photos carry EXIF (GPS position, device serial, capture time) that
// must not be persisted or sent to a third-party AI provider. These pure
// strippers drop metadata segments/chunks while leaving pixel data untouched.

/** Strips JPEG APP1 (EXIF/XMP), APP2 (ICC) and COM segments. Keeps APP0
 * (JFIF). Copies everything from the SOS marker on unchanged. */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break; // corrupt stream — keep the rest as-is
    const marker = bytes[i + 1];
    // SOS: entropy-coded data follows, no more metadata segments possible.
    if (marker === 0xda) {
      out.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    const segEnd = i + 2 + segLen;
    if (segLen < 2 || segEnd > bytes.length) break;
    const isMetadata =
      marker === 0xe1 || // APP1: EXIF, XMP
      marker === 0xe2 || // APP2: ICC profile
      marker === 0xfe; // COM
    if (!isMetadata) {
      out.push(bytes.subarray(i, segEnd));
    }
    i = segEnd;
  }
  if (i < bytes.length) out.push(bytes.subarray(i));
  return concatBytes(out);
}

/** Strips PNG eXIf and textual chunks (tEXt/zTXt/iTXt). */
function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const STRIP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
  const out: Uint8Array[] = [bytes.subarray(0, 8)]; // signature
  let i = 8;
  while (i + 12 <= bytes.length) {
    const dataLen =
      (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    const type = String.fromCharCode(
      bytes[i + 4],
      bytes[i + 5],
      bytes[i + 6],
      bytes[i + 7],
    );
    const chunkEnd = i + 12 + dataLen; // len + type + data + crc
    if (dataLen < 0 || chunkEnd > bytes.length) break;
    if (!STRIP.has(type)) {
      out.push(bytes.subarray(i, chunkEnd));
    }
    if (type === "IEND") {
      i = chunkEnd;
      break;
    }
    i = chunkEnd;
  }
  if (i < bytes.length) out.push(bytes.subarray(i));
  return concatBytes(out);
}

/** Strips WebP EXIF/XMP chunks and clears their presence flags in VP8X. */
function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [];
  const header = new Uint8Array(bytes.subarray(0, 12)); // RIFF <size> WEBP
  out.push(header);
  let i = 12;
  let kept = 4; // "WEBP" fourcc counts toward the RIFF size
  while (i + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(
      bytes[i],
      bytes[i + 1],
      bytes[i + 2],
      bytes[i + 3],
    );
    const dataLen =
      bytes[i + 4] |
      (bytes[i + 5] << 8) |
      (bytes[i + 6] << 16) |
      (bytes[i + 7] << 24);
    const padded = dataLen + (dataLen % 2); // chunks are 2-byte aligned
    const chunkEnd = Math.min(i + 8 + padded, bytes.length);
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = new Uint8Array(bytes.subarray(i, chunkEnd));
      if (fourcc === "VP8X" && chunk.length >= 9) {
        chunk[8] &= ~0x0c; // clear EXIF (0x08) and XMP (0x04) flags
      }
      out.push(chunk);
      kept += chunk.length;
    }
    i = chunkEnd;
  }
  // Patch the RIFF payload size to match what survived.
  header[4] = kept & 0xff;
  header[5] = (kept >> 8) & 0xff;
  header[6] = (kept >> 16) & 0xff;
  header[7] = (kept >> 24) & 0xff;
  return concatBytes(out);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Removes metadata (EXIF, XMP, ICC, comments) from a validated image before
 * it is persisted or forwarded to the AI provider. Pixel data is untouched.
 */
export function stripImageMetadata(bytes: Uint8Array, ext: ImageExt): Uint8Array {
  switch (ext) {
    case "jpg":
      return stripJpegMetadata(bytes);
    case "png":
      return stripPngMetadata(bytes);
    case "webp":
      return stripWebpMetadata(bytes);
  }
}

export type ImageValidation =
  | { ok: true; ext: ImageExt }
  | { ok: false; error: string };

/**
 * Validates a decoded receipt image upload: enforces the size cap and the
 * magic-byte allowlist. The returned `ext` is derived from content, so the
 * stored file extension always matches what the bytes actually are.
 */
export function validateReceiptImage(bytes: Uint8Array): ImageValidation {
  if (bytes.length > MAX_RECEIPT_IMAGE_BYTES) {
    return { ok: false, error: "File exceeds 20MB limit" };
  }
  const ext = sniffImageExt(bytes);
  if (!ext) {
    return {
      ok: false,
      error: "Unsupported format. Allowed: JPG, JPEG, PNG, WebP",
    };
  }
  return { ok: true, ext };
}
