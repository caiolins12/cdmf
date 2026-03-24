import { ApiRequest, ApiResponse, assertMethod, readJsonBody, sendError } from "../../server/http";
import { handleMercadoPagoWebhook } from "../../server/payments";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (req.method === "GET") {
      res.status(200).send("OK");
      return;
    }

    assertMethod(req, "POST");
    const body = await readJsonBody<any>(req);
    const result = await handleMercadoPagoWebhook(body);
    res.status(200).send(result);
  } catch (error) {
    sendError(res, error);
  }
}
