// The Drizzle client of the Worker's D1 binding (a request's c.var.db, middlewares/context.middleware.ts).
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { schema } from './schema.ts';

export type Db = DrizzleD1Database<typeof schema>;

export const database = (d1: D1Database): Db => drizzle(d1, { schema });
