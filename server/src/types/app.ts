// The Hono app's bindings and per-request variables, shared by every route, middleware and controller.
import type { Context } from 'hono';
import type { Db } from '../db/client.ts';
import type { Admin } from '../models/index.ts';

export interface Env {
  DB: D1Database;
  /** The first password of the admin (`wrangler secret put ADMIN_PASSWORD`; .dev.vars for `yarn dev`), read only while
   * the database has no admin yet. */
  ADMIN_PASSWORD?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: Db;
    /** The fields of an admin form (POST), read by middlewares/admin.middleware.ts. */
    form: FormData;
    /** The admin of the session, on admin pages after the login. */
    me: Admin;
  };
};

export type Ctx = Context<AppEnv>;
