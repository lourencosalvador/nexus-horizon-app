import crypto from "node:crypto";

const KEY_ENV = "NEXUS_SKOOL_ENCRYPTION_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`Missing ${KEY_ENV}. Set it to a base64-encoded 32-byte key.`);
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(`Invalid ${KEY_ENV} (must be base64).`);
  }
  if (key.length !== 32) {
    throw new Error(`Invalid ${KEY_ENV} length (expected 32 bytes after base64 decode).`);
  }
  return key;
}

export function encryptString(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  // v1:<iv>:<tag>:<ciphertext>
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptString(payload: string): string {
  const key = getKey();
  const p = (payload ?? "").trim();
  const parts = p.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid encrypted payload.");
  const iv = Buffer.from(parts[1]!, "base64");
  const tag = Buffer.from(parts[2]!, "base64");
  const data = Buffer.from(parts[3]!, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}


