// Hashes and random values (README.md#bảo-mật): admin passwords with PBKDF2-SHA256; cookies and tokens kept as their
// SHA-256 only, so the database alone opens nothing.
import { PBKDF2_ITERATIONS } from '../config/constants.ts';

const text = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function sha256(value: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', text.encode(value)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The same in a time that does not depend on where they differ. */
export function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64url(new Uint8Array(bits));
}

/** "pbkdf2$100000$<salt>$<hash>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = random(16);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${await derive(password, salt, PBKDF2_ITERATIONS)}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iterations, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !salt || !hash) return false;
  return same(await derive(password, fromB64url(salt), Number(iterations)), hash);
}
