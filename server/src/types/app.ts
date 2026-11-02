// The Hono app's bindings and per-request variables, shared by every route, middleware and controller.
import type { Context } from 'hono';
import type { Db } from '../db/client.ts';
import type { Admin } from '../models/index.ts';

export interface Env {
  DB: D1Database;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: Db;
    /** The fields of an admin form (POST), read by middlewares/admin.middleware.ts. */
    form: FormData;
    /** The admin of the session, on admin pages after the login. */
    me: Admin;
    /** The name of the API token of the request (/api/accounts). */
    source: string;
  };
};

export type Ctx = Context<AppEnv>;
