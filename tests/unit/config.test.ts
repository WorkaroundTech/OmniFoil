import { describe, it, expect } from "bun:test";
import { buildBaseAliases, buildAuthUsers } from "../../src/config";

describe("config", () => {
  describe("buildBaseAliases", () => {
    it("should create single alias for single directory", () => {
      const result = buildBaseAliases(["/data/games"]);
      expect(result).toHaveLength(1);
      expect(result[0]!.alias).toBe("games");
      expect(result[0]!.path).toBe("/data/games");
    });

    it("should extract basename from nested paths", () => {
      const result = buildBaseAliases(["/mnt/nas/switch_games"]);
      expect(result[0]!.alias).toBe("switch_games");
      expect(result[0]!.path).toBe("/mnt/nas/switch_games");
    });

    it("should number duplicate directory names", () => {
      const result = buildBaseAliases(["/mnt/games", "/usb/games"]);
      expect(result).toHaveLength(2);
      expect(result[0]!.alias).toBe("games");
      expect(result[1]!.alias).toBe("games-2");
    });

    it("should handle multiple duplicates correctly", () => {
      const result = buildBaseAliases([
        "/path1/games",
        "/path2/games",
        "/path3/games",
      ]);
      expect(result[0]!.alias).toBe("games");
      expect(result[1]!.alias).toBe("games-2");
      expect(result[2]!.alias).toBe("games-3");
    });

    it("should handle mixed unique and duplicate names", () => {
      const result = buildBaseAliases([
        "/data/games",
        "/data/backups",
        "/usb/games",
      ]);
      expect(result[0]!.alias).toBe("games");
      expect(result[1]!.alias).toBe("backups");
      expect(result[2]!.alias).toBe("games-2");
    });

    it("should default to 'games' for root directory", () => {
      const result = buildBaseAliases(["/"]);
      expect(result[0]!.alias).toBe("games");
    });

    it("should handle empty array", () => {
      const result = buildBaseAliases([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("buildAuthUsers", () => {
    it("should return empty list when no vars are set", () => {
      expect(buildAuthUsers(undefined, undefined, undefined)).toHaveLength(0);
    });

    it("should return single user from AUTH_USER + AUTH_PASS", () => {
      const users = buildAuthUsers("alice", "pass1", undefined);
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({ user: "alice", pass: "pass1" });
    });

    it("should ignore AUTH_USER/AUTH_PASS when either is missing", () => {
      expect(buildAuthUsers("alice", undefined, undefined)).toHaveLength(0);
      expect(buildAuthUsers(undefined, "pass1", undefined)).toHaveLength(0);
    });

    it("should return single user from AUTH_CREDENTIALS", () => {
      const users = buildAuthUsers(undefined, undefined, "alice:pass1");
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({ user: "alice", pass: "pass1" });
    });

    it("should support passwords containing colons", () => {
      const users = buildAuthUsers(undefined, undefined, "alice:p:a:s:s");
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual({ user: "alice", pass: "p:a:s:s" });
    });

    it("should return multiple users from comma-separated AUTH_CREDENTIALS", () => {
      const users = buildAuthUsers(undefined, undefined, "alice:pass1,bob:pass2,carol:pass3");
      expect(users).toHaveLength(3);
      expect(users[0]).toEqual({ user: "alice", pass: "pass1" });
      expect(users[1]).toEqual({ user: "bob", pass: "pass2" });
      expect(users[2]).toEqual({ user: "carol", pass: "pass3" });
    });

    it("should trim whitespace around comma-separated entries", () => {
      const users = buildAuthUsers(undefined, undefined, "alice:pass1, bob:pass2");
      expect(users).toHaveLength(2);
      expect(users[1]).toEqual({ user: "bob", pass: "pass2" });
    });

    it("should skip malformed entries in AUTH_CREDENTIALS", () => {
      const users = buildAuthUsers(undefined, undefined, "alice:pass1,badentry,bob:pass2");
      expect(users).toHaveLength(2);
      expect(users[0]).toEqual({ user: "alice", pass: "pass1" });
      expect(users[1]).toEqual({ user: "bob", pass: "pass2" });
    });

    it("should combine AUTH_USER/AUTH_PASS with AUTH_CREDENTIALS", () => {
      const users = buildAuthUsers("alice", "pass1", "bob:pass2");
      expect(users).toHaveLength(2);
      expect(users[0]).toEqual({ user: "alice", pass: "pass1" });
      expect(users[1]).toEqual({ user: "bob", pass: "pass2" });
    });
  });
});
