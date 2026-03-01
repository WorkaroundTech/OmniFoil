/**
 * Route handler utilities
 */

import { SUCCESS_MESSAGE } from "../config";

export interface IndexPayload {
  files: Array<{ url: string; size: number }>;
  directories: string[];
  success?: string;
}

/**
 * Builds the index payload for the root and /tinfoil endpoints
 * @param isCyberFoil - If true, always includes success key (even if empty). If false, omits it when empty.
 */
export function buildIndexPayload(isCyberFoil: boolean = false): IndexPayload {
  const payload: IndexPayload = {
    files: [
      { url: "shop.json", size: 0 },
      { url: "shop.tfl", size: 0 },
    ],
    directories: [],
  };

  // CyberFoil always wants the success key (even if empty) for consistent API contracts
  // Tinfoil omits it when empty to avoid rendering empty banners on client side
  if (isCyberFoil || SUCCESS_MESSAGE) {
    payload.success = SUCCESS_MESSAGE || "";
  }

  return payload;
}
