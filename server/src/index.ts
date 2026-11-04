// cllt-server: a Cloudflare Worker with a D1 database that keeps the accounts and the keys of CLLT Tool (README.md).
//   /api/*    JSON, with an API token (Authorization: Bearer cllt_…) made on the admin page; /api/license/* take the key.
//   /admin/*  the admin page: login admin / admin at first, which must be changed before anything else.
// Layers: routes/ → middlewares/ → controllers/ → services/ (+ validators/) → db/; views/ render the admin page.
import { createApp } from './app.ts';

export type { Env } from './types/app.ts';
export default createApp();
