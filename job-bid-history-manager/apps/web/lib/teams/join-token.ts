import { createHash, randomBytes } from "crypto";

const JOIN_TOKEN_BYTES = 32;

export function generateJoinApproveToken(): string {
  return randomBytes(JOIN_TOKEN_BYTES).toString("base64url");
}

export function hashJoinApproveToken(raw: string): string {
  const secret = process.env.TEAM_JOIN_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("TEAM_JOIN_TOKEN_SECRET is not configured");
  }
  return createHash("sha256").update(`${secret}\n${raw}`).digest("hex");
}

export function joinApproveExpiresAt(hours = 48): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}
