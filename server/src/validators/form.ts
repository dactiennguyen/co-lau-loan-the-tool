// What every validator shares: checking a value with a Zod schema into its data or the messages of what is wrong, the
// fields of an admin form as an object, and a text cut to a length.
import { z } from 'zod';

/** The data a schema made of a value, or what is wrong: the first message of each field (by its path, "a.b") and the
 * first message of all. */
export type Checked<T> = { ok: true; data: T } | { ok: false; error: string; fields: Record<string, string> };

export function check<S extends z.ZodType>(schema: S, value: unknown): Checked<z.output<S>> {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) fields[issue.path.join('.')] ??= issue.message;
  return { ok: false, error: r.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', fields };
}

/** The fields of a form as an object, each name with its last value as text. */
export const formObject = (form: FormData | undefined): Record<string, string> =>
  Object.fromEntries(form ? [...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']) : []);

/** A text trimmed and cut to `max`; anything that is not text reads as ''. Long texts are cut, not refused. */
export const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((s) => s.slice(0, max))
    .catch('');

/** JSON.parse that says what is wrong instead of throwing. */
export function json(body: string, error: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, error: error.replace('{reason}', (e as Error).message) };
  }
}
