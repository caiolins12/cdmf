import { getDatabaseHealth } from "../../server/db";
import { ApiRequest, ApiResponse, assertMethod, sendJson } from "../../server/http";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  assertMethod(req, "GET");

  const health = await getDatabaseHealth();
  sendJson(res, health.ok ? 200 : 503, {
    ok: health.ok,
    data: health,
  });
}
