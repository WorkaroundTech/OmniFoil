import { describe, it, expect } from "bun:test";
import { validSingle } from "../../helpers/torrent";
import { validateTorrent, TorrentValidationError } from "../../../src/lib/torrent";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const pieces = "x".repeat(20);


describe("lib/torrent", () => {
  it("accepts a single-file torrent", () => {
    expect(validateTorrent(validSingle())).toEqual({ name: "game.nsp", fileCount: 1 });
  });

  it("accepts a multi-file torrent", () => {
    const t = enc(`d4:infod5:filesld6:lengthi1e4:pathl1:a5:b.nspeed6:lengthi2e4:pathl1:ceee4:name3:dir12:piece lengthi16384e6:pieces20:${pieces}ee`);
    expect(validateTorrent(t)).toEqual({ name: "dir", fileCount: 2 });
  });

  it("accepts a v2-only torrent (file tree, no pieces)", () => {
    const t = enc(`d4:infod9:file treede4:name1:v12:piece lengthi16384eee`);
    expect(validateTorrent(t).name).toBe("v");
  });

  const bad: Array<[string, string]> = [
    ["not bencode", "hello"],
    ["trailing data", `d4:infod6:lengthi1e4:name1:a12:piece lengthi1e6:pieces20:${pieces}eex`],
    ["list root", "le"],
    ["no info", "d3:foo3:bare"],
    ["traversal name", `d4:infod6:lengthi1e4:name2:..12:piece lengthi1e6:pieces20:${pieces}ee`],
    ["slash in name", `d4:infod6:lengthi1e4:name3:a/b12:piece lengthi1e6:pieces20:${pieces}ee`],
    ["traversal in path", `d4:infod5:filesld6:lengthi1e4:pathl2:..1:aeee4:name1:a12:piece lengthi1e6:pieces20:${pieces}ee`],
    ["bad pieces length", `d4:infod6:lengthi1e4:name1:a12:piece lengthi1e6:pieces5:xxxxxee`],
    ["zero piece length", `d4:infod6:lengthi1e4:name1:a12:piece lengthi0e6:pieces20:${pieces}ee`],
    ["leading-zero int", `d4:infod6:lengthi01e4:name1:a12:piece lengthi1e6:pieces20:${pieces}ee`],
    ["string overruns buffer", "d4:infod4:name99:abcee"],
    ["huge integer", `d4:infod6:lengthi${"9".repeat(40)}e4:name1:aee`],
    ["duplicate key", `d4:infod4:name1:a4:name1:bee`],
    ["deep nesting", "l".repeat(100) + "e".repeat(100)],
  ];

  for (const [label, input] of bad) {
    it(`rejects: ${label}`, () => {
      expect(() => validateTorrent(enc(input))).toThrow(TorrentValidationError);
    });
  }

  it("does not let __proto__ keys pollute", () => {
    expect(() => validateTorrent(enc("d9:__proto__d1:xi1eee"))).toThrow(TorrentValidationError);
    expect(({} as any).x).toBeUndefined();
  });
});
