import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { PAIR_CODE_TTL_MS } from "./constants.js";
import { AuthenticationError, OriginError } from "./errors.js";
import type { PairingRecord, StateStore } from "./storage.js";

const EXTENSION_ORIGIN = /^chrome-extension:\/\/([a-z]{32})$/u;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalDigests(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateExtensionOrigin(origin: string, extensionId?: string): string {
  const match = EXTENSION_ORIGIN.exec(origin);
  if (match === null) throw new OriginError();
  const originExtensionId = match[1];
  if (
    originExtensionId === undefined ||
    (extensionId !== undefined && originExtensionId !== extensionId)
  ) {
    throw new OriginError("Extension ID does not match the request origin.");
  }
  return originExtensionId;
}

export async function issuePairingCode(
  store: StateStore
): Promise<{ code: string; expiresAt: string }> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MS).toISOString();
  await store.updateState((state) => ({
    ...state,
    pair_code: { hash: digest(code), expires_at: expiresAt }
  }));
  return { code, expiresAt };
}

export async function consumePairingCode(
  store: StateStore,
  code: string,
  origin: string,
  extensionId: string
): Promise<string> {
  validateExtensionOrigin(origin, extensionId);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digest(token);
  let accepted = false;

  await store.updateState((state) => {
    const record = state.pair_code;
    if (
      record === undefined ||
      Date.parse(record.expires_at) <= Date.now() ||
      !equalDigests(record.hash, digest(code))
    ) {
      return state;
    }

    accepted = true;
    const pairing: PairingRecord = {
      extension_id: extensionId,
      origin,
      token_hash: tokenHash,
      paired_at: new Date().toISOString()
    };
    const { pair_code: _consumedPairCode, ...stateWithoutPairCode } = state;
    return {
      ...stateWithoutPairCode,
      pairings: [...state.pairings.filter((item) => item.origin !== origin), pairing]
    };
  });

  if (!accepted) throw new AuthenticationError("Pairing code is invalid or expired.");
  return token;
}

export async function isPairedOrigin(store: StateStore, origin: string): Promise<boolean> {
  return (await store.readState()).pairings.some((pairing) => pairing.origin === origin);
}

export async function verifyPairingToken(
  store: StateStore,
  origin: string,
  authorization: string | undefined
): Promise<void> {
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw new AuthenticationError();
  }
  const token = authorization.slice("Bearer ".length);
  const pairing = (await store.readState()).pairings.find((item) => item.origin === origin);
  if (pairing === undefined || !equalDigests(pairing.token_hash, digest(token))) {
    throw new AuthenticationError();
  }
}
