// The Log page: what happened (services/log.service.ts), filtered on the server by its query, newest first.
import * as licenses from '../services/license.service.ts';
import * as logs from '../services/log.service.ts';
import type { Ctx } from '../types/app.ts';
import { render } from '../utils/render.ts';
import { logFilter } from '../validators/log.validator.ts';
import { LogsView } from '../views/logs.view.tsx';

/** The Log page; the rows older than LOG_KEEP_MS go first. Two D1 queries. */
export async function page(c: Ctx) {
  const filter = logFilter.parse(c.req.query());
  const now = Date.now();
  const [{ rows, stats, more }, keys] = await Promise.all([logs.page(c.var.db, filter, now), licenses.names(c.var.db)]);
  return render(c, (n) => <LogsView nonce={n} rows={rows} stats={stats} more={more} filter={filter} keys={keys} now={now} />);
}
