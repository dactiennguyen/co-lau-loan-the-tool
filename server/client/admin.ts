// The script of the admin page, bundled by esbuild into public/assets/admin.js (scripts/build-client.mjs) and loaded with
// the nonce of the page's Content-Security-Policy (views/layout.tsx). It defines the Material Web components the pages
// use (Material Design 3 by Google, @material/web), then: Hiện/Ẩn and Chép of secrets, the Material dialog that asks
// before a form with data-confirm is sent, and the search box of a table (rows with data-find).
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/dialog/dialog.js';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/textfield/outlined-text-field.js';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdIconButton } from '@material/web/iconbutton/icon-button.js';
import type { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';

const HIDDEN = '••••••••';

/** Shows or hides the secret of a Hiện button (an md-icon-button toggle: selected is shown; its aria-label-selected
 * says Ẩn). */
function reveal(button: MdIconButton, on: boolean) {
  const secret = document.getElementById(button.dataset.reveal!);
  if (!secret) return;
  secret.textContent = on ? (secret.dataset.secret ?? '') : HIDDEN;
  button.selected = on;
}

// A toggle md-icon-button changes `selected` after its click has gone round, then sends change.
document.addEventListener('change', (e) => {
  const one = (e.target as Element).closest<MdIconButton>('[data-reveal]');
  if (one) reveal(one, one.selected);
});

document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const all = target.closest<HTMLElement>('[data-reveal-all]');
  if (all) {
    const on = all.getAttribute('aria-pressed') !== 'true';
    all.setAttribute('aria-pressed', String(on));
    all.querySelector('[data-text]')!.textContent = on ? 'Ẩn mọi mật khẩu' : 'Hiện mọi mật khẩu';
    document.querySelectorAll<MdIconButton>('[data-reveal]').forEach((b) => reveal(b, on));
  }
  const copy = target.closest<HTMLElement>('[data-copy]');
  if (copy) {
    void navigator.clipboard.writeText(copy.dataset.copy ?? '').then(() => {
      copy.classList.add('copied');
      copy.title = 'Đã chép';
      setTimeout(() => copy.classList.remove('copied'), 1500);
    });
  }
});

// A form with data-confirm asks first in the Material dialog of the page; Đồng ý sends it.
const dialog = document.getElementById('confirm') as MdDialog | null;
let asking: HTMLFormElement | null = null;
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  const question = form.dataset.confirm;
  if (!question || !dialog || form.dataset.confirmed === '1') return;
  e.preventDefault();
  asking = form;
  dialog.querySelector('[data-question]')!.textContent = question;
  void dialog.show();
});
dialog?.addEventListener('closed', () => {
  const form = asking;
  asking = null;
  if (form && dialog.returnValue === 'ok') {
    form.dataset.confirmed = '1';
    form.requestSubmit();
  }
});

// The search box of a table: rows whose data-find holds what is typed.
const find = document.getElementById('find') as MdOutlinedTextField | null;
find?.addEventListener('input', () => {
  const q = find.value.trim().toLowerCase();
  let n = 0;
  document.querySelectorAll<HTMLTableRowElement>('tbody tr[data-find]').forEach((tr) => {
    const show = !q || tr.dataset.find!.includes(q);
    tr.hidden = !show;
    if (show) n++;
  });
  document.getElementById('shown')!.textContent = q ? `${n} dòng khớp` : '';
});
