/**
 * Better Auth web client. Talks to the cloud (same origin set used by the rest of the app);
 * the session cookie is managed automatically (credentials included). On sign-in/up the bearer
 * token is surfaced via the `set-auth-token` response header — captured by callers to show for
 * pasting into the desktop app. Dancers sign in via magic link (Slice B).
 */

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getApiBaseUrl } from "./api";

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  fetchOptions: { credentials: "include" },
  plugins: [magicLinkClient()],
});
