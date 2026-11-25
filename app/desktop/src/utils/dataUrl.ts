/**
 * The PNG `bytes` as a data: URL. Not a blob: URL: the app's CSP (src-tauri/tauri.conf.json, img-src 'self' data:) lets
 * no blob: picture in, which showed the captcha of 2.2.22 and 2.2.23 as a black box (the browser preview has no CSP;
 * test/desktop-csp.test.ts keeps the two in step).
 */
export function pngDataUrl(bytes: readonly number[]) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return `data:image/png;base64,${btoa(text)}`;
}
