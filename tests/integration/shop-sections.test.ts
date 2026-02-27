import { describe, it, expect, afterEach } from "bun:test";
import { cyberfoilSectionsHandler } from "../../src/routes/handlers/cyberfoil";
import { type RequestContext } from "../../src/types";

describe("shop sections endpoint", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "CyberFoil/1.0",
    startTime: Date.now(),
  };

  afterEach(() => {
    // Clear cache after each test
  });

  it("should return sections with correct structure", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = (await response.json()) as any;
    expect(data).toHaveProperty("sections");
    expect(Array.isArray(data.sections)).toBe(true);
  });

  it("should include updates section", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const updatesSection = data.sections.find((s: any) => s.id === "updates");
    expect(updatesSection).toBeDefined();
    expect(updatesSection.id).toBe("updates");
    expect(updatesSection.title).toBe("Updates");
    expect(Array.isArray(updatesSection.items)).toBe(true);
  });

  it("should include dlc section", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const dlcSection = data.sections.find((s: any) => s.id === "dlc");
    expect(dlcSection).toBeDefined();
    expect(dlcSection.id).toBe("dlc");
    expect(dlcSection.title).toBe("DLC");
    expect(Array.isArray(dlcSection.items)).toBe(true);
  });

  it("should properly structure update items with base title_id", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const updatesSection = data.sections.find((s: any) => s.id === "updates");
    if (updatesSection.items.length > 0) {
      const update = updatesSection.items[0];

      // Verify UPDATE items have correct structure for CyberFoil/AeroFoil compatibility
      expect(update).toHaveProperty("title_id");
      expect(update).toHaveProperty("app_id");
      expect(update).toHaveProperty("app_type");
      expect(update.app_type).toBe("UPDATE");

      // Update's title_id should be base game's title (for linking by client)
      expect(update.title_id).toMatch(/^[0-9A-Fa-f]{16}$/);
      // Update's app_id should be the update's own title (with Y800 suffix pattern)
      expect(update.app_id).toMatch(/^[0-9A-Fa-f]{16}$/);

      // title_id and app_id should be different (for UPDATE)
      if (update.app_type === "UPDATE") {
        // For updates, title_id = base game, app_id = update's own id
        // The last 3 chars of app_id should be "800" (update marker)
        const appIdLast3 = update.app_id.substring(13).toUpperCase();
        expect(appIdLast3).toBe("800");
      }
    }
  });

  it("should properly structure dlc items with base title_id", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const dlcSection = data.sections.find((s: any) => s.id === "dlc");
    if (dlcSection.items.length > 0) {
      const dlc = dlcSection.items[0];

      // Verify DLC items have correct structure for CyberFoil/AeroFoil compatibility
      expect(dlc).toHaveProperty("title_id");
      expect(dlc).toHaveProperty("app_id");
      expect(dlc).toHaveProperty("app_type");
      expect(dlc.app_type).toBe("DLC");

      // DLC's title_id should be base game's title (for linking by client)
      expect(dlc.title_id).toMatch(/^[0-9A-Fa-f]{16}$/);
      // DLC's app_id should be the DLC's own title (with odd digit at position 12)
      expect(dlc.app_id).toMatch(/^[0-9A-Fa-f]{16}$/);

      // Verify title_id and app_id are different (base vs DLC)
      expect(dlc.title_id).not.toBe(dlc.app_id);
    }
  });

  it("should include new and recommended sections with base games only", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const newSection = data.sections.find((s: any) => s.id === "new");
    expect(newSection).toBeDefined();

    const recommendedSection = data.sections.find((s: any) => s.id === "recommended");
    expect(recommendedSection).toBeDefined();

    // New and recommended should only have BASE games
    if (newSection.items.length > 0) {
      newSection.items.forEach((item: any) => {
        expect(item.app_type).toBe("BASE");
      });
    }

    if (recommendedSection.items.length > 0) {
      recommendedSection.items.forEach((item: any) => {
        expect(item.app_type).toBe("BASE");
      });
    }
  });

  it("should include all section with all types of apps", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const allSection = data.sections.find((s: any) => s.id === "all");
    expect(allSection).toBeDefined();
    expect(allSection.items.length).toBeGreaterThan(0);

    // All section should only have BASE games (based on AeroFoil implementation)
    allSection.items.forEach((item: any) => {
      expect(item.app_type).toBe("BASE");
    });
  });

  it("should have all sections present", async () => {
    const req = new Request("http://localhost/api/shop/sections");
    const response = await cyberfoilSectionsHandler(req, ctx);
    const data = (await response.json()) as any;

    const sectionIds = data.sections.map((s: any) => s.id);
    expect(sectionIds).toContain("new");
    expect(sectionIds).toContain("recommended");
    expect(sectionIds).toContain("updates");
    expect(sectionIds).toContain("dlc");
    expect(sectionIds).toContain("all");
  });
});
