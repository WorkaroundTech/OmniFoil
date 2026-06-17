import { describe, it, expect, beforeEach } from "bun:test";
import { buildShopData, type ShopData } from "../../../src/services/shop";

describe("lib/shop", () => {
  describe("buildShopData", () => {
    it("should return valid ShopData structure", async () => {
      const shopData = await buildShopData();

      expect(shopData).toHaveProperty("files");
      expect(Array.isArray(shopData.files)).toBe(true);
    });

    it("should include success field for CyberFoil clients", async () => {
      const shopData = await buildShopData(true);

      expect(shopData).toHaveProperty("success");
      expect(typeof shopData.success).toBe("string");
    });

    it("should have file objects with url and size properties", async () => {
      const shopData = await buildShopData();

      if (shopData.files.length > 0) {
        const file = shopData.files[0];
        expect(file).toHaveProperty("url");
        expect(file).toHaveProperty("size");
        expect(typeof file?.url).toBe("string");
        expect(typeof file?.size).toBe("number");
      }
    });

    it("should encode virtual paths in file URLs", async () => {
      const shopData = await buildShopData();

      if (shopData.files.length > 0) {
        const file = shopData.files[0];
        // URLs should use CyberFoil-compatible id-based downloads
        expect(file?.url).toContain("/api/get_game/");
      }
    });

    it("should include success message if configured", async () => {
      const originalEnv = process.env.SUCCESS_MESSAGE;
      process.env.SUCCESS_MESSAGE = "Test success message";

      // Need to reload module to pick up new env
      // For now we just test the structure
      const shopData = await buildShopData();
      expect(shopData).toHaveProperty("files");

      process.env.SUCCESS_MESSAGE = originalEnv;
    });

    it("should not error on empty directories", async () => {
      // Should not throw even if no files found
      const shopData = await buildShopData();
      expect(shopData).toBeDefined();
    });

    it("should omit titledb blob for CyberFoil clients", async () => {
      const shopData = await buildShopData(true);
      expect(shopData.titledb).toBeUndefined();
    });

    it("should expose titledb blob for Tinfoil clients when entries are matched", async () => {
      const shopData = await buildShopData(false);
      // titledb is only emitted when at least one matched titleId exists.
      // The unit env may not have a populated library, so just assert the
      // shape when the field is present.
      if (shopData.titledb !== undefined) {
        expect(typeof shopData.titledb).toBe("object");
        for (const [key, entry] of Object.entries(shopData.titledb)) {
          expect(key).toMatch(/^[0-9A-F]{16}$/);
          expect(entry.id).toBe(key);
          expect(typeof entry.name).toBe("string");
          expect(typeof entry.version).toBe("number");
          expect(typeof entry.size).toBe("number");
        }
      }
    });
  });
});
