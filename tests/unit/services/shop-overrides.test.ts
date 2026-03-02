import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const testState = {
  gamesDir: "",
};

const mockSearchByName = mock(async (titleName: string) => {
  if (titleName === "The Legend of Zelda: Tears of the Kingdom") {
    return "0100F2C0115B6000";
  }
  return null;
});
const mockGetTitleInfo = mock(async (titleId: string) => {
  if (titleId === "0100F2C0115B6000") {
    return {
      id: "0100F2C0115B6000",
      name: "The Legend of Zelda: Tears of the Kingdom",
      category: ["Adventure"],
      iconUrl: "https://example.com/zelda-icon.jpg",
      bannerUrl: "https://example.com/zelda-banner.jpg",
    };
  }

  if (titleId === "0100F2C0115B6800") {
    return {
      id: "0100F2C0115B6800",
      name: "The Legend of Zelda: Tears of the Kingdom Update",
      category: ["Adventure"],
      iconUrl: "https://example.com/zelda-update-icon.jpg",
      bannerUrl: "https://example.com/zelda-update-banner.jpg",
    };
  }

  return null;
});

mock.module("../../../src/services/titledb", () => ({
  searchByName: mockSearchByName,
  getTitleInfo: mockGetTitleInfo,
}));

mock.module("../../../src/config", () => ({
  BASES: [{ path: testState.gamesDir, alias: "games" }],
  GLOB_PATTERN: "**/*.{nsp,nsz,xci,xciz,json}",
  SUCCESS_MESSAGE: "",
  CACHE_TTL: 0,
  REFERRER: "",
  OVERRIDE_FILENAME: "omnifoil-overrides.json",
  OVERRIDES_ENABLED: true,
}));

let getShopCatalog: (forceRefresh?: boolean, limitForAllSection?: number) => Promise<any>;

beforeAll(async () => {
  testState.gamesDir = await mkdtemp(join(tmpdir(), "omnifoil-shop-overrides-"));

  const weirdFileName = "sxs-the_legend_of_zelda_tears_of_the_kingdom_v393216.nsp";
  const unmatchedFileName = "totally_weird_unmatched_game_dump.nsp";
  await Bun.write(join(testState.gamesDir, weirdFileName), "dummy nsp content");
  await Bun.write(join(testState.gamesDir, unmatchedFileName), "dummy unknown nsp content");

  await Bun.write(
    join(testState.gamesDir, "omnifoil-overrides.json"),
    JSON.stringify(
      {
        overrides: {
          [weirdFileName]: {
            titleName: "The Legend of Zelda: Tears of the Kingdom",
            appType: "UPDATE",
            version: "393216",
          },
          [unmatchedFileName]: {
            titleName: "A Game That Does Not Exist In TitleDB",
            appType: "GAME",
            version: "1",
          },
        },
      },
      null,
      2
    )
  );

  ({ getShopCatalog } = await import("../../../src/services/shop"));
});

afterAll(async () => {
  if (testState.gamesDir) {
    await rm(testState.gamesDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  mockSearchByName.mockClear();
  mockGetTitleInfo.mockClear();
});

describe("services/shop overrides integration", () => {
  it("applies file override and reflects resolved metadata in catalog + sections", async () => {
    const catalog = await getShopCatalog(true, 50);

    expect(catalog.entries.length).toBe(2);

    const entry = catalog.entries.find(
      (catalogEntry: any) =>
        catalogEntry.filename === "sxs-the_legend_of_zelda_tears_of_the_kingdom_v393216.nsp"
    );
    expect(entry).toBeTruthy();
    expect(entry.appType).toBe(2);
    expect(entry.version).toBe("393216");

    // Resolved from titleName + UPDATE
    expect(entry.titleId).toBe("0100F2C0115B6800");
    expect(entry.baseTitleId).toBe("0100F2C0115B6000");

    // titleName is explicitly overridden
    expect(entry.titleName).toBe("The Legend of Zelda: Tears of the Kingdom");

    // Metadata pulled from TitleDB using base title id
    expect(entry.category).toEqual(["Adventure"]);
    expect(entry.iconUrl).toBe("https://example.com/zelda-icon.jpg");
    expect(entry.bannerUrl).toBe("https://example.com/zelda-banner.jpg");

    // Ensure the override file itself is not scanned as game content
    expect(catalog.shopData.files.length).toBe(2);

    const updatesSection = catalog.sectionsPayload.sections.find((section: any) => section.id === "updates");
    expect(updatesSection).toBeTruthy();
    expect(updatesSection.items.length).toBe(1);

    const [updateItem] = updatesSection.items;
    expect(updateItem.app_type).toBe(2);
    expect(updateItem.app_id).toBe("0100F2C0115B6800");
    expect(updateItem.title_id).toBe("0100F2C0115B6000");
    expect(updateItem.title_name).toBe("The Legend of Zelda: Tears of the Kingdom");

    const otherSection = catalog.sectionsPayload.sections.find((section: any) => section.id === "other");
    expect(otherSection).toBeTruthy();
    expect(otherSection.items.length).toBe(1);
    expect(otherSection.items[0].filename).toBe("totally_weird_unmatched_game_dump.nsp");

    const newSection = catalog.sectionsPayload.sections.find((section: any) => section.id === "new");
    const recommendedSection = catalog.sectionsPayload.sections.find((section: any) => section.id === "recommended");
    expect(newSection).toBeTruthy();
    expect(recommendedSection).toBeTruthy();
    expect(newSection.items.every((item: any) => item.filename !== "totally_weird_unmatched_game_dump.nsp")).toBe(true);
    expect(recommendedSection.items.every((item: any) => item.filename !== "totally_weird_unmatched_game_dump.nsp")).toBe(true);

    expect(mockSearchByName).toHaveBeenCalledWith("The Legend of Zelda: Tears of the Kingdom");
    expect(mockSearchByName).toHaveBeenCalledWith("A Game That Does Not Exist In TitleDB");
    expect(mockGetTitleInfo).toHaveBeenCalledWith("0100F2C0115B6000");
  });
});
