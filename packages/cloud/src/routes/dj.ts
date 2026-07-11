/**
 * DJ routes — composed from focused concern modules in `./dj/`.
 *
 * Split (2026-07) from a single ~800-line god-router into: public profile read, session curation,
 * external-playlist embeds, Booth (bio/gigs), and the musical-identity engine. **Behavior-
 * preserving** — every `/api/dj/*` path + method is unchanged.
 *
 * Registration order is load-bearing: the authed `/me/*` routers mount BEFORE the public profile
 * router so the `:slug` param route can never shadow a static `/me/*` route (Hono matches in
 * registration order — hono.dev/docs/api/routing; general/param routes register last). CSRF
 * (`X-Pika-Client`) is enforced at the mount in index.ts (`app.use("/api/dj/*", csrfCheck)`),
 * so it stays split-agnostic here.
 */

import { Hono } from "hono";
import { boothRoutes } from "./dj/booth";
import { embedRoutes } from "./dj/embeds";
import { identityRoutes } from "./dj/identity";
import { profileRoutes } from "./dj/profile";
import { sessionRoutes } from "./dj/sessions";

const dj = new Hono();

// Static `/me/*` routers first …
dj.route("/", sessionRoutes);
dj.route("/", embedRoutes);
dj.route("/", boothRoutes);
dj.route("/", identityRoutes);
// … then the param `/:slug` profile route LAST (the fallback/general route).
dj.route("/", profileRoutes);

export { dj };
