import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockSearchByName = mock(async (_titleName: string) => null as string | null);
const mockGetTitleInfo = mock(async (_titleId: string) => null as any);

mock.module("../../../src/services/titledb", () => ({
  searchByName: mockSearchByName,
  getTitleInfo: mockGetTitleInfo,
}));

const { resolveOverride } = await import("../../../src/lib/overrides");

describe("lib/overrides", () => {
  beforeEach(() => {
    mockSearchByName.mockReset();
    mockGetTitleInfo.mockReset();
  });

  describe("resolveOverride appType parsing", () => {
    it("accepts case-insensitive string appType for explicit titleId", async () => {
      const resolved = await resolveOverride(
        {
          titleId: "0100F2C0115B6800",
          appType: "update",
          version: "393216",
        },
        "zelda-update.nsp"
      );

      expect(resolved.titleId).toBe("0100F2C0115B6800");
      expect(resolved.appType).toBe(2);
      expect(resolved.baseTitleId).toBe("0100F2C0115B6000");
      expect(resolved.version).toBe("393216");
    });

    it("supports GAME/BASE aliases", async () => {
      const fromGame = await resolveOverride(
        {
          titleId: "0100F2C0115B6000",
          appType: "GAME",
        },
        "zelda-base.nsp"
      );

      const fromBase = await resolveOverride(
        {
          titleId: "0100F2C0115B6000",
          appType: "base",
        },
        "zelda-base-2.nsp"
      );

      expect(fromGame.appType).toBe(0);
      expect(fromBase.appType).toBe(0);
      expect(fromGame.baseTitleId).toBeUndefined();
      expect(fromBase.baseTitleId).toBeUndefined();
    });

    it("supports PATCH alias for UPDATE", async () => {
      const resolved = await resolveOverride(
        {
          titleId: "0100F2C0115B6800",
          appType: "PATCH",
        },
        "zelda-patch.nsp"
      );

      expect(resolved.appType).toBe(2);
      expect(resolved.baseTitleId).toBe("0100F2C0115B6000");
    });
  });

  describe("resolveOverride smart resolution", () => {
    it("resolves titleId/baseTitleId from titleName + UPDATE", async () => {
      mockSearchByName.mockResolvedValue("0100F2C0115B6000");
      mockGetTitleInfo.mockResolvedValue({
        id: "0100F2C0115B6000",
        name: "The Legend of Zelda: Tears of the Kingdom",
        category: ["Adventure"],
        iconUrl: "https://example.com/icon.jpg",
        bannerUrl: "https://example.com/banner.jpg",
      });

      const resolved = await resolveOverride(
        {
          titleName: "The Legend of Zelda: Tears of the Kingdom",
          appType: "UPDATE",
          version: "393216",
        },
        "sxs-the_legend_of_zelda_tears_of_the_kingdom_v393216.nsp"
      );

      expect(mockSearchByName).toHaveBeenCalledTimes(1);
      expect(mockSearchByName).toHaveBeenCalledWith("The Legend of Zelda: Tears of the Kingdom");
      expect(mockGetTitleInfo).toHaveBeenCalledWith("0100F2C0115B6000");

      expect(resolved.appType).toBe(2);
      expect(resolved.baseTitleId).toBe("0100F2C0115B6000");
      expect(resolved.titleId).toBe("0100F2C0115B6800");
      expect(resolved.version).toBe("393216");
      expect(resolved.category).toEqual(["Adventure"]);
      expect(resolved.iconUrl).toBe("https://example.com/icon.jpg");
      expect(resolved.bannerUrl).toBe("https://example.com/banner.jpg");
    });

    it("keeps explicit metadata over TitleDB values", async () => {
      mockSearchByName.mockResolvedValue("0100F2C0115B6000");
      mockGetTitleInfo.mockResolvedValue({
        category: ["Adventure"],
        iconUrl: "https://example.com/db-icon.jpg",
        bannerUrl: "https://example.com/db-banner.jpg",
      });

      const resolved = await resolveOverride(
        {
          titleName: "The Legend of Zelda: Tears of the Kingdom",
          appType: "UPDATE",
          category: ["Custom Category"],
          iconUrl: "https://example.com/custom-icon.jpg",
        },
        "custom-metadata.nsp"
      );

      expect(resolved.category).toEqual(["Custom Category"]);
      expect(resolved.iconUrl).toBe("https://example.com/custom-icon.jpg");
      expect(resolved.bannerUrl).toBe("https://example.com/db-banner.jpg");
    });

    it("returns partial data when title lookup does not match", async () => {
      mockSearchByName.mockResolvedValue(null);

      const resolved = await resolveOverride(
        {
          titleName: "Unknown Game",
          appType: "DLC",
          version: "1",
        },
        "unknown.nsp"
      );

      expect(resolved.titleName).toBe("Unknown Game");
      expect(resolved.appType).toBe(1);
      expect(resolved.version).toBe("1");
      expect(resolved.titleId).toBeUndefined();
      expect(resolved.baseTitleId).toBeUndefined();
    });

    it("defaults unknown appType strings to GAME", async () => {
      const resolved = await resolveOverride(
        {
          titleId: "0100F2C0115B6000",
          appType: "SOMETHING_ELSE",
        },
        "invalid-apptype.nsp"
      );

      expect(resolved.appType).toBe(0);
      expect(resolved.titleId).toBe("0100F2C0115B6000");
    });
  });
});
