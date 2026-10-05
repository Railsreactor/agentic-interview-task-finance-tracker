import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_IMAGE_BYTES,
  base64LengthLimit,
  sniffImageExt,
  stripImageMetadata,
  validateReceiptImage,
} from "#/lib/upload";

// Builds a buffer starting with the given magic bytes, padded to a valid
// minimum sniffing length.
function withMagic(magic: number[], length = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(magic);
  return bytes;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
// "RIFF" + 4 size bytes + "WEBP"
const WEBP_MAGIC = [
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

describe("upload validation", () => {
  it("sniffImageExt accepts JPEG, PNG, and WebP magic bytes", () => {
    expect(sniffImageExt(withMagic(PNG_MAGIC))).toBe("png");
    expect(sniffImageExt(withMagic(JPEG_MAGIC))).toBe("jpg");
    expect(sniffImageExt(withMagic(WEBP_MAGIC))).toBe("webp");
  });

  it("sniffImageExt rejects non-image and lookalike content", () => {
    // GIF
    expect(sniffImageExt(withMagic([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    // PDF
    expect(sniffImageExt(withMagic([0x25, 0x50, 0x44, 0x46]))).toBeNull();
    // Plain text / CSV
    expect(
      sniffImageExt(new TextEncoder().encode("date,amount,description\n")),
    ).toBeNull();
    // RIFF container that is NOT WebP (e.g. WAVE audio)
    const wave = withMagic([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageExt(wave)).toBeNull();
    // Truncated PNG signature
    expect(sniffImageExt(withMagic(PNG_MAGIC.slice(0, 4), 8))).toBeNull();
    // JPEG bytes embedded mid-file must NOT count (no heuristic scanning)
    const embedded = new Uint8Array(64);
    embedded.set([0xff, 0xd8, 0xff], 20);
    expect(sniffImageExt(embedded)).toBeNull();
  });

  it("validateReceiptImage enforces the size cap", () => {
    const oversize = new Uint8Array(MAX_RECEIPT_IMAGE_BYTES + 1);
    oversize.set(PNG_MAGIC);
    const tooBig = validateReceiptImage(oversize);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toContain("20MB");

    const atLimit = new Uint8Array(1024);
    atLimit.set(PNG_MAGIC);
    expect(validateReceiptImage(atLimit)).toEqual({ ok: true, ext: "png" });
  });

  it("base64LengthLimit matches decoded size", () => {
    for (const size of [1, 2, 3, 100, 3000]) {
      const encoded = Buffer.alloc(size).toString("base64");
      expect(encoded.length).toBeLessThanOrEqual(base64LengthLimit(size));
      const over = Buffer.alloc(size + 3).toString("base64");
      expect(over.length).toBeGreaterThan(base64LengthLimit(size));
    }
  });
});

describe("metadata stripping", () => {
  const bytesContain = (haystack: Uint8Array, needle: number[]): boolean => {
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  };
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it("strips JPEG APP1/COM segments but keeps APP0 and image data", () => {
    const seg = (marker: number, payload: number[]) => [
      0xff,
      marker,
      (payload.length + 2) >> 8,
      (payload.length + 2) & 0xff,
      ...payload,
    ];
    const exifPayload = [...ascii("Exif"), 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef];
    const jpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      ...seg(0xe0, [...ascii("JFIF"), 0x00]), // APP0 — kept
      ...seg(0xe1, exifPayload), // APP1 EXIF — stripped
      ...seg(0xfe, ascii("a comment")), // COM — stripped
      0xff, 0xda, 0x00, 0x02, // SOS
      0x11, 0x22, 0x33, // entropy data
      0xff, 0xd9, // EOI
    ]);

    const stripped = stripImageMetadata(jpeg, "jpg");
    expect(sniffImageExt(stripped)).toBe("jpg");
    expect(bytesContain(stripped, ascii("JFIF"))).toBe(true);
    expect(bytesContain(stripped, ascii("Exif"))).toBe(false);
    expect(bytesContain(stripped, ascii("a comment"))).toBe(false);
    // Everything from SOS on survives byte-for-byte.
    expect(bytesContain(stripped, [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33])).toBe(
      true,
    );
  });

  it("strips PNG eXIf and text chunks but keeps IHDR/IDAT/IEND", () => {
    const chunk = (type: string, data: number[]) => [
      (data.length >> 24) & 0xff,
      (data.length >> 16) & 0xff,
      (data.length >> 8) & 0xff,
      data.length & 0xff,
      ...ascii(type),
      ...data,
      0, 0, 0, 0, // crc (not validated by the stripper)
    ];
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk("IHDR", Array.from({ length: 13 }, () => 1)),
      ...chunk("tEXt", ascii("Author\0secret")),
      ...chunk("eXIf", [0xde, 0xad]),
      ...chunk("IDAT", [1, 2, 3, 4]),
      ...chunk("IEND", []),
    ]);

    const stripped = stripImageMetadata(png, "png");
    expect(sniffImageExt(stripped)).toBe("png");
    expect(bytesContain(stripped, ascii("IHDR"))).toBe(true);
    expect(bytesContain(stripped, ascii("IDAT"))).toBe(true);
    expect(bytesContain(stripped, ascii("IEND"))).toBe(true);
    expect(bytesContain(stripped, ascii("tEXt"))).toBe(false);
    expect(bytesContain(stripped, ascii("secret"))).toBe(false);
    expect(bytesContain(stripped, ascii("eXIf"))).toBe(false);
  });

  it("strips WebP EXIF/XMP chunks, clears VP8X flags, and patches the RIFF size", () => {
    const riffChunk = (fourcc: string, data: number[]) => {
      const padded = data.length % 2 ? [...data, 0] : data;
      return [
        ...ascii(fourcc),
        data.length & 0xff,
        (data.length >> 8) & 0xff,
        (data.length >> 16) & 0xff,
        (data.length >> 24) & 0xff,
        ...padded,
      ];
    };
    const vp8xData = [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // EXIF+XMP flags set
    const body = [
      ...ascii("WEBP"),
      ...riffChunk("VP8X", vp8xData),
      ...riffChunk("EXIF", [0xde, 0xad, 0xbe]),
      ...riffChunk("XMP ", ascii("<xmp/>")),
      ...riffChunk("VP8 ", [9, 8, 7, 6]),
    ];
    const webp = new Uint8Array([
      ...ascii("RIFF"),
      body.length & 0xff,
      (body.length >> 8) & 0xff,
      (body.length >> 16) & 0xff,
      (body.length >> 24) & 0xff,
      ...body,
    ]);

    const stripped = stripImageMetadata(webp, "webp");
    expect(sniffImageExt(stripped)).toBe("webp");
    expect(bytesContain(stripped, ascii("EXIF"))).toBe(false);
    expect(bytesContain(stripped, ascii("<xmp/>"))).toBe(false);
    expect(bytesContain(stripped, ascii("VP8X"))).toBe(true);
    expect(bytesContain(stripped, ascii("VP8 "))).toBe(true);

    // VP8X flags byte no longer advertises EXIF/XMP.
    const vp8xIndex = stripped.findIndex(
      (_, i) =>
        stripped[i] === 0x56 && stripped[i + 1] === 0x50 &&
        stripped[i + 2] === 0x38 && stripped[i + 3] === 0x58,
    );
    expect(stripped[vp8xIndex + 8] & 0x0c).toBe(0);

    // RIFF size matches the surviving payload.
    const riffSize =
      stripped[4] | (stripped[5] << 8) | (stripped[6] << 16) | (stripped[7] << 24);
    expect(riffSize).toBe(stripped.length - 8);
  });
});
