import { ApiError } from "../../server/errors";
import { ApiRequest, ApiResponse, assertMethod, readJsonBody, sendError } from "../../server/http";
import { handleWebhook } from "../../server/whatsapp";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    // Evolution API only sends POST webhooks
    assertMethod(req, "POST");
    const body = await readJsonBody<any>(req);
    await handleWebhook(body);
    res.status(200).send("OK");
  } catch (error) {
    sendError(res, error);
  }
}
