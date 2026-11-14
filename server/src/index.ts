// cllt-server: a Cloudflare Worker with a D1 database that keeps the accounts and the keys of CLLT Tool (README.md).
//   /api/*    JSON for the app: /api/license/* take its key.
//   /admin/*  the admin page: login admin with the ADMIN_PASSWORD secret at first, which must be changed before anything else.
// Layers: routes/ → middlewares/ → controllers/ → services/ (+ validators/) → db/; views/ render the admin page.
import { createApp } from './app.ts';

export type { Env } from './types/app.ts';
export default createApp();
