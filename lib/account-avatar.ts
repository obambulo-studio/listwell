const MD5_SHIFT: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

const MD5_K: readonly number[] = [
  0xd7_6a_a4_78, 0xe8_c7_b7_56, 0x24_20_70_db, 0xc1_bd_ce_ee, 0xf5_7c_0f_af,
  0x47_87_c6_2a, 0xa8_30_46_13, 0xfd_46_95_01, 0x69_80_98_d8, 0x8b_44_f7_af,
  0xff_ff_5b_b1, 0x89_5c_d7_be, 0x6b_90_11_22, 0xfd_98_71_93, 0xa6_79_43_8e,
  0x49_b4_08_21, 0xf6_1e_25_62, 0xc0_40_b3_40, 0x26_5e_5a_51, 0xe9_b6_c7_aa,
  0xd6_2f_10_5d, 0x02_44_14_53, 0xd8_a1_e6_81, 0xe7_d3_fb_c8, 0x21_e1_cd_e6,
  0xc3_37_07_d6, 0xf4_d5_0d_87, 0x45_5a_14_ed, 0xa9_e3_e9_05, 0xfc_ef_a3_f8,
  0x67_6f_02_d9, 0x8d_2a_4c_8a, 0xff_fa_39_42, 0x87_71_f6_81, 0x6d_9d_61_22,
  0xfd_e5_38_0c, 0xa4_be_ea_44, 0x4b_de_cf_a9, 0xf6_bb_4b_60, 0xbe_bf_bc_70,
  0x28_9b_7e_c6, 0xea_a1_27_fa, 0xd4_ef_30_85, 0x04_88_1d_05, 0xd9_d4_d0_39,
  0xe6_db_99_e5, 0x1f_a2_7c_f8, 0xc4_ac_56_65, 0xf4_29_22_44, 0x43_2a_ff_97,
  0xab_94_23_a7, 0xfc_93_a0_39, 0x65_5b_59_c3, 0x8f_0c_cc_92, 0xff_ef_f4_7d,
  0x85_84_5d_d1, 0x6f_a8_7e_4f, 0xfe_2c_e6_e0, 0xa3_01_43_14, 0x4e_08_11_a1,
  0xf7_53_7e_82, 0xbd_3a_f2_35, 0x2a_d7_d2_bb, 0xeb_86_d3_91,
];

const MD5_INIT_A = 0x67_45_23_01;
const MD5_INIT_B = 0xef_cd_ab_89;
const MD5_INIT_C = 0x98_ba_dc_fe;
const MD5_INIT_D = 0x10_32_54_76;
const MD5_PAD_BYTE = 0x80;
const MD5_BLOCK_BYTES = 64;
const MD5_LENGTH_BYTES = 8;
const MD5_ROUNDS = 64;
const MD5_WORDS = 16;
const BITS_PER_BYTE = 8;
const UINT32_BYTES = 4;
const UINT32_RADIX = 2 ** 32;

const md5At = (values: readonly number[], index: number): number => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`MD5 value missing at ${index}`);
  }
  return value;
};

const md5WordIndex = (round: number): number => {
  if (round < MD5_WORDS) {
    return round;
  }
  if (round < MD5_WORDS * 2) {
    return (5 * round + 1) % MD5_WORDS;
  }
  if (round < MD5_WORDS * 3) {
    return (3 * round + 5) % MD5_WORDS;
  }
  return (7 * round) % MD5_WORDS;
};

/* Web Crypto has no MD5. Gravatar hashes the email with these 32-bit steps. */
/* eslint-disable no-bitwise */
const u32 = (value: number): number => value >>> 0;

const md5Mix = (round: number, b: number, c: number, d: number): number => {
  if (round < MD5_WORDS) {
    return (b & c) | (~b & d);
  }
  if (round < MD5_WORDS * 2) {
    return (d & b) | (~d & c);
  }
  if (round < MD5_WORDS * 3) {
    return b ^ c ^ d;
  }
  return c ^ (b | ~d);
};

const md5HexLe = (word: number): string =>
  [0, BITS_PER_BYTE, BITS_PER_BYTE * 2, BITS_PER_BYTE * 3]
    .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
/* eslint-enable no-bitwise */

const md5Padded = (input: string): Uint8Array => {
  const source = new TextEncoder().encode(input);
  const bitLength = source.length * BITS_PER_BYTE;
  const paddedLength = source.length + 1;
  const zeroCount =
    (56 - (paddedLength % MD5_BLOCK_BYTES) + MD5_BLOCK_BYTES) % MD5_BLOCK_BYTES;
  const total = paddedLength + zeroCount + MD5_LENGTH_BYTES;
  const bytes = new Uint8Array(total);
  bytes.set(source);
  bytes[source.length] = MD5_PAD_BYTE;
  const view = new DataView(bytes.buffer);
  view.setUint32(total - MD5_LENGTH_BYTES, u32(bitLength), true);
  view.setUint32(
    total - UINT32_BYTES,
    Math.floor(bitLength / UINT32_RADIX),
    true
  );
  return bytes;
};

/* eslint-disable no-bitwise */
const md5Compress = (
  state: { a: number; b: number; c: number; d: number },
  words: readonly number[]
): { a: number; b: number; c: number; d: number } => {
  let { a, b, c, d } = state;
  for (let round = 0; round < MD5_ROUNDS; round += 1) {
    const mixed = u32(
      a +
        md5Mix(round, b, c, d) +
        md5At(words, md5WordIndex(round)) +
        md5At(MD5_K, round)
    );
    const shift = md5At(MD5_SHIFT, round);
    const rotated = u32((mixed << shift) | (mixed >>> (32 - shift)));
    a = d;
    d = c;
    c = b;
    b = u32(b + rotated);
  }
  return {
    a: u32(state.a + a),
    b: u32(state.b + b),
    c: u32(state.c + c),
    d: u32(state.d + d),
  };
};
/* eslint-enable no-bitwise */

const md5Hex = (input: string): string => {
  const bytes = md5Padded(input);
  const view = new DataView(bytes.buffer);
  let state = { a: MD5_INIT_A, b: MD5_INIT_B, c: MD5_INIT_C, d: MD5_INIT_D };
  for (let offset = 0; offset < bytes.length; offset += MD5_BLOCK_BYTES) {
    const words = Array.from({ length: MD5_WORDS }, (_, index) =>
      view.getUint32(offset + index * UINT32_BYTES, true)
    );
    state = md5Compress(state, words);
  }
  return `${md5HexLe(state.a)}${md5HexLe(state.b)}${md5HexLe(state.c)}${md5HexLe(state.d)}`;
};

/**
 * Smallest edge that still counts as a photo.
 * A 1px upload loads without an error and would hide Gravatar.
 */
export const AVATAR_MIN_EDGE_PX = 8;

export const avatarEdgesAreUsable = (width: number, height: number): boolean =>
  Number.isFinite(width) &&
  Number.isFinite(height) &&
  width >= AVATAR_MIN_EDGE_PX &&
  height >= AVATAR_MIN_EDGE_PX;

/** Gravatar URL for an email, or null when email is empty. */
export const gravatarAvatarUrl = (email: string): string | null => {
  const trimmed = email.trim();
  if (trimmed === "") {
    return null;
  }
  const hash = md5Hex(trimmed.toLowerCase());
  // d=404: a real photo when Gravatar has one; otherwise the image errors
  // and the UI keeps the user icon. d=mp is a second generic silhouette.
  return `https://www.gravatar.com/avatar/${hash}?s=64&d=404`;
};

export {
  storedProfileImageRaw as accountStoredProfileImage,
  uploadedProfilePhotoFromSession as accountImageFromSession,
} from "./profile-photo";
