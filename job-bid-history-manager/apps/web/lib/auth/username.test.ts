import { describe, expect, it } from "vitest";

import { isValidUsernameFormat, normalizeUsername } from "@/lib/auth/username";

describe("username helpers", () => {
  it("normalizes case and trims spaces", () => {
    expect(normalizeUsername("  Alice_User  ")).toBe("alice_user");
  });

  it("accepts valid usernames", () => {
    expect(isValidUsernameFormat("abc")).toBe(true);
    expect(isValidUsernameFormat("user_123-name")).toBe(true);
  });

  it("rejects invalid usernames", () => {
    expect(isValidUsernameFormat("ab")).toBe(false);
    expect(isValidUsernameFormat("UPPER")).toBe(false);
    expect(isValidUsernameFormat("with space")).toBe(false);
    expect(isValidUsernameFormat("toolongtoolongtoolongtoolongtoolong")).toBe(false);
  });
});
