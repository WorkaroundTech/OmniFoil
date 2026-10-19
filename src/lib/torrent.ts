/**
 * Strict .torrent validation.
 * Decodes bencode defensively (bounded depth, no trailing data, no prototype keys)
 * and checks the structure a real torrent must have before it is handed to Deluge.
 */

type BValue = number | string | BValue[] | Map<string, BValue>;

const MAX_DEPTH = 16;

export class TorrentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TorrentValidationError";
  }
}

export interface TorrentSummary {
  name: string;
  fileCount: number;
}

function fail(message: string): never {
  throw new TorrentValidationError(message);
}

/** Decodes bencode. Byte strings become latin1 strings so lengths stay byte-accurate. */
function decode(bytes: Uint8Array): BValue {
  let pos = 0;

  const readInt = (terminator: number): number => {
    const start = pos;
    while (pos < bytes.length && bytes[pos] !== terminator) pos++;
    if (pos >= bytes.length) fail("Truncated integer");
    if (pos - start > 20) fail("Integer out of range");
    const text = String.fromCharCode(...bytes.subarray(start, pos));
    pos++; // terminator
    // Canonical form only: no "+", no leading zeros, no "-0"
    if (!/^(0|-?[1-9][0-9]*)$/.test(text)) fail("Malformed integer");
    const value = Number(text);
    if (!Number.isSafeInteger(value)) fail("Integer out of range");
    return value;
  };

  const readString = (): string => {
    const len = readInt(0x3a); // ':'
    if (len < 0 || pos + len > bytes.length) fail("Invalid string length");
    const value = Buffer.from(bytes.subarray(pos, pos + len)).toString("latin1");
    pos += len;
    return value;
  };

  const readValue = (depth: number): BValue => {
    if (depth > MAX_DEPTH) fail("Nested too deeply");
    const byte = bytes[pos];
    if (byte === undefined) fail("Unexpected end of data");

    if (byte === 0x69) { // 'i'
      pos++;
      return readInt(0x65); // 'e'
    }
    if (byte === 0x6c) { // 'l'
      pos++;
      const list: BValue[] = [];
      while (bytes[pos] !== 0x65) {
        if (pos >= bytes.length) fail("Unterminated list");
        list.push(readValue(depth + 1));
      }
      pos++;
      return list;
    }
    if (byte === 0x64) { // 'd'
      pos++;
      const dict = new Map<string, BValue>(); // Map, so keys like "__proto__" are inert
      while (bytes[pos] !== 0x65) {
        if (pos >= bytes.length) fail("Unterminated dictionary");
        if (bytes[pos]! < 0x30 || bytes[pos]! > 0x39) fail("Dictionary key must be a string");
        const key = readString();
        if (dict.has(key)) fail("Duplicate dictionary key");
        dict.set(key, readValue(depth + 1));
      }
      pos++;
      return dict;
    }
    if (byte >= 0x30 && byte <= 0x39) return readString();
    return fail("Unexpected token");
  };

  const value = readValue(0);
  if (pos !== bytes.length) fail("Trailing data after torrent");
  return value;
}

function isDict(value: BValue | undefined): value is Map<string, BValue> {
  return value instanceof Map;
}

/** A name/path component that cannot escape or confuse the download directory. */
function isSafeComponent(value: BValue | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[\/\\\0]/.test(value)
  );
}

/**
 * Validate raw .torrent bytes. Throws TorrentValidationError describing the first problem.
 */
export function validateTorrent(bytes: Uint8Array): TorrentSummary {
  const root = decode(bytes);
  if (!isDict(root)) fail("Torrent must be a dictionary");

  const info = root.get("info");
  if (!isDict(info)) fail("Missing info dictionary");

  const name = info.get("name");
  if (!isSafeComponent(name)) fail("Missing or unsafe torrent name");

  const pieceLength = info.get("piece length");
  if (typeof pieceLength !== "number" || pieceLength <= 0) fail("Invalid piece length");

  const pieces = info.get("pieces");
  const fileTree = info.get("file tree");
  const hasV1Pieces = typeof pieces === "string" && pieces.length > 0 && pieces.length % 20 === 0;
  if (!hasV1Pieces && !isDict(fileTree)) fail("Missing piece hashes");

  let fileCount = 1;
  const files = info.get("files");
  if (files !== undefined) {
    if (!Array.isArray(files) || files.length === 0) fail("Invalid file list");
    for (const file of files) {
      if (!isDict(file)) fail("Invalid file entry");
      const length = file.get("length");
      if (typeof length !== "number" || length < 0) fail("Invalid file length");
      const path = file.get("path");
      if (!Array.isArray(path) || path.length === 0 || !path.every(isSafeComponent)) {
        fail("Missing or unsafe file path");
      }
    }
    fileCount = files.length;
  } else if (hasV1Pieces) {
    const length = info.get("length");
    if (typeof length !== "number" || length < 0) fail("Invalid file length");
  }

  return { name, fileCount };
}
