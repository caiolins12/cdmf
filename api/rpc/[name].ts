import { ApiError } from "../../server/errors";
import { ApiRequest, ApiResponse, assertMethod, readJsonBody, sendError, sendOk } from "../../server/http";
import { runRpc } from "../../server/rpc";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    assertMethod(req, "POST");
    const name = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name;
    if (!name) {
      throw new ApiError(404, "not-found", "RPC não informada");
    }

    const payload = await readJsonBody<Record<string, unknown>>(req);
    const data = await runRpc(name, req, payload as any);
    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
}
