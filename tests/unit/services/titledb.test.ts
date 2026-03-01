import { describe, it, expect, beforeAll } from "bun:test";
import { 
  initializeTitleDB, 
  getTitleInfo, 
  getTitleVersions,
  getLatestVersion,
  searchTitles,
  getTitleDBStats
} from "../../../src/services/titledb";

describe("services/titledb", () => {
  // Note: These tests will attempt to download TitleDB data from the network.
  // To run offline, set TITLEDB_ENABLED=false before running tests.
  // For CI/CD, consider mocking fetch or pre-populating cache directories.
  
  beforeAll(async () => {
    // Initialize TitleDB before running tests
    // This will use cached data if available, otherwise download
    console.log("Initializing TitleDB for tests...");
    await initializeTitleDB();
  });

  describe("getTitleDBStats", () => {
    it("should return stats about the loaded TitleDB", async () => {
      const stats = await getTitleDBStats();
      
      expect(stats).toHaveProperty("titleCount");
      expect(stats).toHaveProperty("versionCount");
      expect(stats).toHaveProperty("enabled");
      expect(stats).toHaveProperty("initialized");
      expect(stats).toHaveProperty("lastUpdated");
      
      expect(typeof stats.titleCount).toBe("number");
      expect(typeof stats.versionCount).toBe("number");
      expect(stats.initialized).toBe(true);
      expect(stats.enabled).toBe(true);
    });

    it("should report positive number of titles", async () => {
      const stats = await getTitleDBStats();
      
      // TitleDB should have at least some titles
      expect(stats.titleCount).toBeGreaterThan(0);
    });
  });

  describe("getTitleInfo", () => {
    it("should return null for non-existent title ID", async () => {
      const info = await getTitleInfo("0000000000000000");
      
      expect(info).toBeNull();
    });

    it("should return null for invalid title ID format", async () => {
      const info = await getTitleInfo("invalid");
      
      expect(info).toBeNull();
    });

    it("should return title info structure when title exists", async () => {
      // Get a real title ID from the database (we'll search for one)
      const searchResults = await searchTitles("Zelda", 1);
      
      if (searchResults.length > 0) {
        const titleId = searchResults[0]!.id;
        const info = await getTitleInfo(titleId);
        
        if (info) {
          expect(info).toHaveProperty("id");
          expect(info).toHaveProperty("name");
          expect(typeof info.id).toBe("string");
          expect(typeof info.name).toBe("string");
        }
      }
    });
  });

  describe("searchTitles", () => {
    it("should return empty array for non-matching query", async () => {
      const results = await searchTitles("XYZXYZNONEXISTENTGAME123");
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("should return array of results for common query", async () => {
      const results = await searchTitles("Mario");
      
      expect(Array.isArray(results)).toBe(true);
      // Mario is a common Nintendo franchise, should have results
      expect(results.length).toBeGreaterThan(0);
    });

    it("should respect the limit parameter", async () => {
      const results = await searchTitles("the", 5);
      
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should return titles with required properties", async () => {
      const results = await searchTitles("Switch", 1);
      
      if (results.length > 0) {
        const title = results[0];
        expect(title).toHaveProperty("id");
        expect(title).toHaveProperty("name");
      }
    });
  });

  describe("getTitleVersions", () => {
    it("should return null for non-existent title ID", async () => {
      const versions = await getTitleVersions("0000000000000000");
      
      expect(versions).toBeNull();
    });

    it("should return versions array when available", async () => {
      // Find a title with versions
      const searchResults = await searchTitles("Zelda", 5);
      
      for (const title of searchResults) {
        const versions = await getTitleVersions(title.id);
        
        if (versions && versions.length > 0) {
          expect(Array.isArray(versions)).toBe(true);
          expect(versions[0]).toHaveProperty("version");
          break; // Found one with versions, that's enough
        }
      }
    });
  });

  describe("getLatestVersion", () => {
    it("should return null for non-existent title ID", async () => {
      const version = await getLatestVersion("0000000000000000");
      
      expect(version).toBeNull();
    });

    it("should return string or null for title without versions", async () => {
      const searchResults = await searchTitles("Game", 1);
      
      if (searchResults.length > 0) {
        const version = await getLatestVersion(searchResults[0]!.id);
        
        // Should be either string or null
        expect(version === null || typeof version === "string").toBe(true);
      }
    });
  });

  describe("integration", () => {
    it("should be able to look up a title and get its info", async () => {
      const searchResults = await searchTitles("Pokemon", 1);
      
      if (searchResults.length > 0) {
        const titleId = searchResults[0]!.id;
        const info = await getTitleInfo(titleId);
        
        expect(info).toBeTruthy();
        if (info) {
          expect(info.id).toBe(titleId);
          expect(info.name).toBeTruthy();
        }
      }
    });
  });
});
