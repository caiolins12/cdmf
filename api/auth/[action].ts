import { createPasswordUser, getSessionUser, mapAuthErrorCode, requireRole, signInWithEmailPassword, signInWithGoogleCode, signInWithGoogleCredential, signOutUser } from "../../server/auth";
import { ApiError } from "../../server/errors";
import { ApiRequest, ApiResponse, assertMethod, readJsonBody, sendError, sendOk, validateEmail } from "../../server/http";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

    switch (action) {
      case "session": {
        assertMethod(req, "GET");
        const user = await getSessionUser(req);
        sendOk(res, { user });
        return;
      }

      case "password-signin": {
        assertMethod(req, "POST");
        const body = await readJsonBody<{ email?: string; password?: string }>(req);
        const email = body.email?.trim() || "";
        const password = body.password || "";
        if (!validateEmail(email) || !password) {
          throw new ApiError(400, "invalid-argument", "Email e senha são obrigatórios");
        }
        const user = await signInWithEmailPassword(req, res, email, password);
        sendOk(res, { user });
        return;
      }

      case "create-user": {
        assertMethod(req, "POST");
        await requireRole(req, ["master"]);
        const body = await readJsonBody<{ email?: string; password?: string; displayName?: string }>(req);
        const email = body.email?.trim() || "";
        const password = body.password || "";
        if (!validateEmail(email) || !password) {
          throw new ApiError(400, "invalid-argument", "Email e senha são obrigatórios");
        }
        const user = await createPasswordUser(email, password, { displayName: body.displayName || null });
        sendOk(res, { user });
        return;
      }

      case "google-signin": {
        assertMethod(req, "POST");
        const body = await readJsonBody<{ code?: string; credential?: string }>(req);
        if (!body.code && !body.credential) {
          throw new ApiError(400, "invalid-argument", "Authorization code é obrigatório");
        }
        const user = body.credential
          ? await signInWithGoogleCredential(req, res, body.credential)
          : await signInWithGoogleCode(req, res, body.code as string);
        sendOk(res, { user });
        return;
      }

      case "signout": {
        assertMethod(req, "POST");
        await signOutUser(req, res);
        sendOk(res, { success: true });
        return;
      }

      default:
        throw new ApiError(404, "not-found", "Rota de autenticação não encontrada");
    }
  } catch (error) {
    if (error instanceof ApiError && error.code.startsWith("auth/")) {
      sendError(res, error);
      return;
    }

    if (error instanceof ApiError && ["wrong-password", "user-not-found", "email-already-in-use", "invalid-email"].includes(error.code)) {
      sendError(res, new ApiError(error.status, mapAuthErrorCode(error.code), error.message, error.details));
      return;
    }

    sendError(res, error);
  }
}
