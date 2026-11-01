import { GrayImage } from "../graphics/image";

/**
 * Pictures the external agent shows on the lenses (the glasses.show_image tool).
 * The bridge already converts them (grayscale, light ink on black, fitted to
 * IMAGE_MAX_*); this side only decodes and re-checks, so a direct caller or a
 * future bridge can't push something the shell can't paint.
 *
 * Pure module (no NativeScript imports) so tests run it under node.
 */

/** The image area inside the shell's dialog box (560x232 at x=40, inset 16/8). */
export const IMAGE_MAX_WIDTH = 528;
export const IMAGE_MAX_HEIGHT = 216;
/** Room left for the image when a caption line is drawn under it. */
export const IMAGE_MAX_HEIGHT_WITH_CAPTION = 196;
/** Base64 of a fitted 4-bit gray PNG is ~10-60 KB; anything far larger is not one of ours. */
export const IMAGE_MAX_BASE64_CHARS = 400_000;
/** Decoded images larger than this are rejected before any per-pixel work. */
const DECODED_MAX_PIXELS = 1600 * 1200;
export const IMAGE_DEFAULT_SECONDS = 15;
export const IMAGE_MAX_SECONDS = 60;
export const IMAGE_CAPTION_MAX_CHARS = 120;

export type PngDecoder = {
  decode(buffer: ArrayBuffer): { width: number; height: number };
  toRGBA8(decoded: unknown): ArrayBuffer[];
};

/** Flat, like ToolResult: the app builds with strictNullChecks off, so a union wouldn't narrow. */
export type PreparedGlassesImage = { ok: boolean; image?: GrayImage; error?: string };

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_INDEX = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64.length; i++) table[BASE64.charCodeAt(i)] = i;
  table["-".charCodeAt(0)] = 62; // base64url
  table["_".charCodeAt(0)] = 63;
  return table;
})();

/** Decode standard or URL-safe base64 (whitespace and padding ignored); null if malformed. */
export function decodeBase64(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, "").replace(/=+$/, "");
  if (clean.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const digit = code < 128 ? BASE64_INDEX[code]! : -1;
    if (digit < 0) return null;
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, index);
}

/** RGBA to gray, alpha composited over black (the lenses' "off"). */
export function grayFromRgba(rgba: Uint8Array, width: number, height: number): GrayImage {
  const image = new GrayImage(width, height, 0);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const luminance = 0.2126 * rgba[p]! + 0.7152 * rgba[p + 1]! + 0.0722 * rgba[p + 2]!;
    image.pixels[i] = Math.round((luminance * rgba[p + 3]!) / 255);
  }
  return image;
}

/** Area-average downscale to fit maxWidth x maxHeight (never upscales: the bridge does that). */
export function fitGrayImage(source: GrayImage, maxWidth: number, maxHeight: number): GrayImage {
  const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height);
  if (scale >= 1) return source;
  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));
  const out = new GrayImage(width, height, 0);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * source.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * source.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * source.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * source.width) / width));
      let sum = 0;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * source.width;
        for (let sx = x0; sx < x1; sx++) sum += source.pixels[row + sx]!;
      }
      out.pixels[y * width + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return out;
}

/**
 * Snap to the 16 lens levels and lift 0 to 1: identical on the lenses, but 0 is
 * the shell surface's color key and would show the layers underneath.
 */
export function quantizeForLens(image: GrayImage): GrayImage {
  const pixels = image.pixels;
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.max(1, Math.round(pixels[i]! / 17) * 17);
  return image;
}

/** Validate and decode a tool call's PNG into a lens-ready image. */
export function prepareGlassesImage(base64: unknown, hasCaption: boolean, png: PngDecoder): PreparedGlassesImage {
  if (typeof base64 !== "string" || !base64.trim()) return { ok: false, error: "show_image requires png_base64" };
  if (base64.length > IMAGE_MAX_BASE64_CHARS) return { ok: false, error: "Image too large" };
  const bytes = decodeBase64(base64.replace(/^data:image\/png;base64,/, ""));
  if (!bytes || bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return { ok: false, error: "png_base64 is not a PNG" };
  }
  let width: number;
  let height: number;
  let rgba: Uint8Array;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const decoded = png.decode(buffer);
    width = decoded.width;
    height = decoded.height;
    if (!(width > 0 && height > 0) || width * height > DECODED_MAX_PIXELS) return { ok: false, error: "Image dimensions out of range" };
    const frames = png.toRGBA8(decoded);
    if (!frames.length) return { ok: false, error: "PNG contains no frames" };
    rgba = new Uint8Array(frames[0]!);
  } catch {
    return { ok: false, error: "Could not decode PNG" };
  }
  const gray = grayFromRgba(rgba, width, height);
  const fitted = fitGrayImage(gray, IMAGE_MAX_WIDTH, hasCaption ? IMAGE_MAX_HEIGHT_WITH_CAPTION : IMAGE_MAX_HEIGHT);
  return { ok: true, image: quantizeForLens(fitted === gray ? gray : fitted) };
}

/** Display time in seconds from a tool argument: default, clamped to 3..IMAGE_MAX_SECONDS. */
export function imageSeconds(value: unknown): number {
  const seconds = typeof value === "number" && Number.isFinite(value) ? value : IMAGE_DEFAULT_SECONDS;
  return Math.min(IMAGE_MAX_SECONDS, Math.max(3, Math.round(seconds)));
}

export function imageCaption(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, IMAGE_CAPTION_MAX_CHARS) : "";
}
