/**
 * Save synchronization endpoint handler
 * Handles GET /api/saves/list
 */

import { type RequestContext, type Handler } from "../../types";
import { methodValidator } from "../../middleware";

interface SaveListItem {
  title_id: string | number;
  name?: string;
  save_id?: string;
  note?: string;
  created_at?: string;
  created_ts?: number;
  download_url?: string;
  downloadUrl?: string;
  url?: string;
  size?: number;
}

interface SaveListResponse {
  saves: SaveListItem[];
}

const savesListHandlerImpl: Handler = async (req: Request, ctx: RequestContext) => {
  // For now, return empty saves list
  // TODO: Implement actual save data retrieval from storage/database
  
  const response: SaveListResponse = {
    saves: [],
  };

  return Response.json(response);
};

export const savesListHandler = methodValidator(["GET", "HEAD"])(savesListHandlerImpl);
