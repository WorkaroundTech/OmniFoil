import { describe, it, expect } from "bun:test";
import { buildSectionsPayload, type CatalogFileEntry } from "../../../src/services/shop";

function makeEntry(id: number, name: string): CatalogFileEntry {
  const titleId = `0100${id.toString(16).toUpperCase().padStart(9, "0")}000`;
  return {
    id,
    virtualPath: `games/${name}.nsp`,
    absPath: `/games/${name}.nsp`,
    filename: `${name} [${titleId}][v0].nsp`,
    size: 1024,
    name,
    appId: titleId,
    titleId,
    titleName: name,
    appType: 0,
    version: "0",
    category: [],
    iconUrl: "https://example.com/icon.jpg",
    bannerUrl: null,
    baseTitleId: null,
    hasTitleDbMatch: true,
  };
}

describe("services/shop buildSectionsPayload", () => {
  it("returns every matched entry in the `all` section, even for large libraries", () => {
    // 26 letters x 30 titles = 780 entries, above the old 500-item cap.
    const entries: CatalogFileEntry[] = [];
    for (let letter = 0; letter < 26; letter++) {
      for (let n = 0; n < 30; n++) {
        const name = `${String.fromCharCode(65 + letter)} Game ${n.toString().padStart(2, "0")}`;
        entries.push(makeEntry(entries.length + 1, name));
      }
    }

    const payload = buildSectionsPayload(entries, 50);
    const all = payload.sections.find((section) => section.id === "all");

    expect(all).toBeDefined();
    expect(all!.items).toHaveLength(780);
    expect(all!.total).toBe(780);
    expect(all!.truncated).toBe(false);
    expect(all!.items.at(-1)!.name).toBe("Z Game 29");
  });

  it("still applies the discovery limit to `new` and `recommended`", () => {
    const entries = Array.from({ length: 120 }, (_, i) => makeEntry(i + 1, `Game ${i}`));

    const payload = buildSectionsPayload(entries, 10);

    expect(payload.sections.find((section) => section.id === "new")!.items).toHaveLength(10);
    expect(payload.sections.find((section) => section.id === "recommended")!.items).toHaveLength(10);
    expect(payload.sections.find((section) => section.id === "all")!.items).toHaveLength(120);
  });
});
