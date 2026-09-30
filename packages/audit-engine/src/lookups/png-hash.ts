const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const HASH_SIZE = 8;
const MATCH_DISTANCE = 8;
const DIFFERENT_DISTANCE = 16;

export type ImageLikeness = "match" | "different" | "unsure";

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset
  );

const isPng = (bytes: Uint8Array): boolean => {
  if (bytes.length < PNG_SIGNATURE.length) {
    return false;
  }
  for (const [index, byte] of PNG_SIGNATURE.entries()) {
    if (bytes[index] !== byte) {
      return false;
    }
  }
  return true;
};

const inflateZlib = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof DecompressionStream === "undefined") {
    return null;
  }
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  try {
    const stream = new Blob([buffer])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
};

const chunkType = (bytes: Uint8Array, offset: number): string =>
  String.fromCodePoint(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0
  );

const unfilterRgb = (
  inflated: Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray | null => {
  const expected = height * (width * 3 + 1);
  if (inflated.length < expected) {
    return null;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    if ((inflated[source] ?? 0) !== 0) {
      return null;
    }
    source += 1;
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      rgba[target] = inflated[source] ?? 0;
      rgba[target + 1] = inflated[source + 1] ?? 0;
      rgba[target + 2] = inflated[source + 2] ?? 0;
      rgba[target + 3] = 255;
      source += 3;
    }
  }
  return rgba;
};

interface PngImage {
  height: number;
  rgba: Uint8ClampedArray;
  width: number;
}

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    bytes.set(part, cursor);
    cursor += part.length;
  }
  return bytes;
};

const readPngChunks = (
  bytes: Uint8Array
): { height: number; idat: Uint8Array; width: number } | null => {
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  const parts: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      return null;
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      if ((data[8] ?? 0) !== 8 || (data[9] ?? 0) !== 2) {
        return null;
      }
    }
    if (type === "IDAT") {
      parts.push(data);
    }
    if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (width < 1 || height < 1 || parts.length === 0) {
    return null;
  }
  return { height, idat: concatBytes(parts), width };
};

const decodePng = async (bytes: Uint8Array): Promise<PngImage | null> => {
  if (!isPng(bytes)) {
    return null;
  }
  const chunks = readPngChunks(bytes);
  if (!chunks) {
    return null;
  }
  const inflated = await inflateZlib(chunks.idat);
  if (!inflated) {
    return null;
  }
  const rgba = unfilterRgb(inflated, chunks.width, chunks.height);
  if (!rgba) {
    return null;
  }
  return { height: chunks.height, rgba, width: chunks.width };
};

const sampleHash = (image: PngImage): string => {
  const samples: number[] = [];
  for (let y = 0; y < HASH_SIZE; y += 1) {
    for (let x = 0; x < HASH_SIZE; x += 1) {
      const sourceX = Math.min(
        image.width - 1,
        Math.floor(((x + 0.5) * image.width) / HASH_SIZE)
      );
      const sourceY = Math.min(
        image.height - 1,
        Math.floor(((y + 0.5) * image.height) / HASH_SIZE)
      );
      const index = (sourceY * image.width + sourceX) * 4;
      const red = image.rgba[index] ?? 0;
      const green = image.rgba[index + 1] ?? 0;
      const blue = image.rgba[index + 2] ?? 0;
      samples.push((red + green + blue) / 3);
    }
  }
  const average =
    samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  return samples.map((sample) => (sample >= average ? "1" : "0")).join("");
};

const hashDistance = (left: string, right: string): number => {
  let distance = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }
  return distance;
};

export const pngLikeness = async (
  left: Uint8Array,
  right: Uint8Array
): Promise<ImageLikeness> => {
  const [leftImage, rightImage] = await Promise.all([
    decodePng(left),
    decodePng(right),
  ]);
  if (!leftImage || !rightImage) {
    return "unsure";
  }
  const distance = hashDistance(sampleHash(leftImage), sampleHash(rightImage));
  if (distance <= MATCH_DISTANCE) {
    return "match";
  }
  if (distance >= DIFFERENT_DISTANCE) {
    return "different";
  }
  return "unsure";
};
