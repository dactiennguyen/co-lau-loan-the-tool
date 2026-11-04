// The filter of the Log page, from its query (?level=warn&kind=key&key=3&q=…&before=<lastAt>-<id>), checked with Zod:
// what is not one of them reads as no filter.
import { z } from 'zod';
import { LOG_GROUPS, MAX_LOG_SEARCH } from '../config/constants.ts';
import type { Filter } from '../services/log.service.ts';
import { clipped } from './form.ts';

const id = z.coerce.number().int().positive().optional().catch(undefined);

/** Xem thêm: "<lastAt>-<id>" of the last row shown. */
const cursor = z
  .string()
  .regex(/^\d{1,15}-\d{1,15}$/)
  .transform((s) => {
    const [lastAt, id] = s.split('-').map(Number);
    return { lastAt: lastAt!, id: id! };
  })
  .optional()
  .catch(undefined);

export const logFilter = z
  .object({
    level: z.enum(['warn', 'danger']).optional().catch(undefined),
    kind: z.enum(LOG_GROUPS).optional().catch(undefined),
    key: id,
    q: clipped(MAX_LOG_SEARCH),
    before: cursor,
  })
  .transform((f): Filter => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')));
