// API tokens made on the admin page (README.md#bảo-mật): "cllt_" and 43 random characters, kept as their SHA-256 and
// their first characters only, so a token is shown once.
import { eq } from 'drizzle-orm';
import { TOKEN_PREFIX, TOKEN_SHOWN } from '../config/constants.ts';
import type { Db } from '../db/client.ts';
import { tokens } from '../db/schema.ts';
import type { Token } from '../models/index.ts';
import { b64url, random, sha256 } from '../utils/crypto.ts';

const tokenColumns = { id: tokens.id, name: tokens.name, prefix: tokens.prefix, createdAt: tokens.createdAt, lastUsedAt: tokens.lastUsedAt };

/** A new API token named `name`: "cllt_" and 43 characters. Only its SHA-256 is kept, so it is shown once. */
export async function create(db: Db, name: string): Promise<string> {
  const token = `${TOKEN_PREFIX}${b64url(random(32))}`;
  await db.insert(tokens).values({ name, hash: await sha256(token), prefix: token.slice(0, TOKEN_SHOWN), createdAt: Date.now() });
  return token;
}

export async function list(db: Db): Promise<Token[]> {
  return db.select(tokenColumns).from(tokens).orderBy(tokens.id);
}

export async function remove(db: Db, id: number): Promise<void> {
  await db.delete(tokens).where(eq(tokens.id, id));
}

/** The token of "Authorization: Bearer <token>", its last use noted; null without a known one. */
export async function fromBearer(db: Db, req: Request): Promise<Token | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!m) return null;
  const token = await db.select(tokenColumns).from(tokens).where(eq(tokens.hash, await sha256(m[1]))).get();
  if (!token) return null;
  await db.update(tokens).set({ lastUsedAt: Date.now() }).where(eq(tokens.id, token.id));
  return token;
}
