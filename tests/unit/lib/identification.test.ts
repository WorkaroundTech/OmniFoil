import { describe, it, expect } from "bun:test";
import { 
  identifyFile, 
  parseGameName, 
  getDisplayName 
} from "../../../src/lib/identification";

describe("lib/identification", () => {
  describe("identifyFile", () => {
    describe("base games", () => {
      it("should identify base game from title ID ending in Y000 (Y=even)", () => {
        const result = identifyFile("Game Name [0100ED100B160000][v0].nsp");
        
        expect(result.titleId).toBe("0100ED100B160000");
        expect(result.appType).toBe(0); // BASE
        expect(result.version).toBe("0");
        expect(result.isDLC).toBe(false);
        expect(result.isUpdate).toBe(false);
        expect(result.baseTitleId).toBeUndefined();
      });

      it("should identify base game with A000 ending", () => {
        const result = identifyFile("[0100AEA0250EA000] Game Name.nsp");
        
        expect(result.titleId).toBe("0100AEA0250EA000");
        expect(result.appType).toBe(0); // BASE
        expect(result.baseTitleId).toBeUndefined();
      });
    });

    describe("updates", () => {
      it("should identify update from title ID ending in Y800 (Y=even)", () => {
        const result = identifyFile("Game Name [0100ED100B160800][v1].nsp");
        
        expect(result.titleId).toBe("0100ED100B160800");
        expect(result.appType).toBe(2); // UPDATE
        expect(result.version).toBe("1");
        expect(result.isDLC).toBe(false);
        expect(result.isUpdate).toBe(true);
        expect(result.baseTitleId).toBe("0100ED100B160000");
      });

      it("should identify update with A800 ending", () => {
        const result = identifyFile("[0100AEA0250EA800][v2] Game Update.nsp");
        
        expect(result.titleId).toBe("0100AEA0250EA800");
        expect(result.appType).toBe(2); // UPDATE
        expect(result.version).toBe("2");
        expect(result.baseTitleId).toBe("0100AEA0250EA000");
      });

      it("should identify update from filename keyword", () => {
        const result = identifyFile("Game Name Update v1.0.0.nsp");
        
        expect(result.appType).toBe(2); // UPDATE
        expect(result.isUpdate).toBe(true);
      });

      it("should identify update from 'upd' keyword", () => {
        const result = identifyFile("Game Name UPD [v3].nsp");
        
        expect(result.appType).toBe(2); // UPDATE
        expect(result.version).toBe("3");
      });
    });

    describe("DLC", () => {
      it("should identify DLC from title ID with odd digit at position 12", () => {
        const result = identifyFile("Game DLC [0100AEA0250EB001][v0].nsp");
        
        expect(result.titleId).toBe("0100AEA0250EB001");
        expect(result.appType).toBe(1); // DLC
        expect(result.isDLC).toBe(true);
        expect(result.isUpdate).toBe(false);
        expect(result.baseTitleId).toBe("0100AEA0250EA000");
      });

      it("should identify DLC from filename keyword", () => {
        const result = identifyFile("Game Name DLC Pack.nsp");
        
        expect(result.appType).toBe(1); // DLC
        expect(result.isDLC).toBe(true);
      });

      it("should identify DLC from 'aoc' keyword", () => {
        const result = identifyFile("Game Name AOC [v0].nsp");
        
        expect(result.appType).toBe(1); // DLC
        expect(result.isDLC).toBe(true);
      });
    });

    describe("version extraction", () => {
      it("should extract version from [vN] format", () => {
        const result = identifyFile("Game [0100000000000000][v5].nsp");
        
        expect(result.version).toBe("5");
      });

      it("should default to version 0 when no version tag", () => {
        const result = identifyFile("Game [0100000000000000].nsp");
        
        expect(result.version).toBe("0");
      });

      it("should handle case-insensitive version tags", () => {
        const result1 = identifyFile("Game [V3].nsp");
        const result2 = identifyFile("Game [v3].nsp");
        
        expect(result1.version).toBe("3");
        expect(result2.version).toBe("3");
      });
    });

    describe("title ID extraction", () => {
      it("should extract title ID with brackets", () => {
        const result = identifyFile("Game [0123456789ABCDEF].nsp");
        
        expect(result.titleId).toBe("0123456789ABCDEF");
      });

      it("should extract title ID without brackets", () => {
        const result = identifyFile("Game 0123456789ABCDEF.nsp");
        
        expect(result.titleId).toBe("0123456789ABCDEF");
      });

      it("should handle lowercase title IDs", () => {
        const result = identifyFile("Game [0123456789abcdef].nsp");
        
        expect(result.titleId).toBe("0123456789ABCDEF");
      });

      it("should return null for files without title ID", () => {
        const result = identifyFile("Game Name Only.nsp");
        
        expect(result.titleId).toBeNull();
      });
    });
  });

  describe("parseGameName", () => {
    it("should remove file extension", () => {
      const name = parseGameName("Game Name.nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should remove title ID in brackets", () => {
      const name = parseGameName("Game Name [0100000000000000].nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should remove version tags", () => {
      const name = parseGameName("Game Name [v5].nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should remove all metadata and clean the name", () => {
      const name = parseGameName("Game Name [0100ED100B160000][v0].nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should handle NSZ files", () => {
      const name = parseGameName("Game Name.nsz");
      
      expect(name).toBe("Game Name");
    });

    it("should handle XCI files", () => {
      const name = parseGameName("Game Name.xci");
      
      expect(name).toBe("Game Name");
    });

    it("should handle XCIZ files", () => {
      const name = parseGameName("Game Name.xciz");
      
      expect(name).toBe("Game Name");
    });

    it("should remove region codes in parentheses", () => {
      const name = parseGameName("Game Name (USA).nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should remove multiple bracketed metadata", () => {
      const name = parseGameName("Game Name [DLC] [UPDATE] [0100000000000000].nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should clean up multiple spaces", () => {
      const name = parseGameName("Game    Name   [0100000000000000].nsp");
      
      expect(name).toBe("Game Name");
    });

    it("should handle complex filenames", () => {
      const name = parseGameName("[0100AEA0250EA000][v0] The Legend of Game (USA).nsp");
      
      expect(name).toBe("The Legend of Game");
    });
  });

  describe("getDisplayName", () => {
    it("should return name with version when version present", () => {
      const name = getDisplayName("Game [0100000000000000][v3].nsp");
      
      expect(name).toBe("Game (v3)");
    });

    it("should return name without version suffix when version is 0", () => {
      const name = getDisplayName("Game [0100000000000000][v0].nsp");
      
      expect(name).toBe("Game");
    });

    it("should use titleName when provided", () => {
      const name = getDisplayName("Game [0100000000000000][v2].nsp", "Official Game Title");
      
      expect(name).toBe("Official Game Title (v2)");
    });

    it("should fall back to parsed filename when no titleName", () => {
      const name = getDisplayName("Game Name [0100000000000000][v1].nsp");
      
      expect(name).toBe("Game Name (v1)");
    });
  });
});
