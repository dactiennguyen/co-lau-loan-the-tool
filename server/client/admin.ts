// The script of the admin page, bundled by esbuild into public/assets/admin.js (scripts/build-client.mjs) and loaded with
// the nonce of the page's Content-Security-Policy (views/layout.tsx), which runs no inline script: all the page does on
// its own is here, on plain HTML. Toasts (the server's notices, Đã chép); Hiện/Ẩn and Chép of secrets; the native
// dialogs (data-open): the action dialog of every page, Tạo key, Sửa and Khoá of the Key page, and the key just made;
// the menu of a key (a popover, placed under its button, arrow keys between its items); the state filter and search box
// of a table; the two ways to end a key, with "Số ngày" and "Ngày hết hạn" linked both ways; the filters of the Nick and
// Log pages, sent as they change.
const HIDDEN = '••••••••';
const DAY = 86_400_000;
const TOAST_MS = 3200;

const field = (root: ParentNode, name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
const dialogOf = (id: string) => document.getElementById(id) as HTMLDialogElement | null;

// ---- Toasts ----------------------------------------------------------------------------------------------------------

const toasts = document.getElementById('toasts');

/** Hides a toast after a while (sooner when the pointer is not on it). */
function fade(toast: HTMLElement) {
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 200);
  }, TOAST_MS);
}
toasts?.querySelectorAll<HTMLElement>('.toast').forEach(fade);

/** A toast of the page, as the server draws them (views/layout.tsx), with the icon of the first one of its kind. */
function toast(text: string) {
  if (!toasts) return;
  const el = document.createElement('div');
  el.className = 'toast ok';
  el.setAttribute('role', 'status');
  el.innerHTML = '<svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';
  const span = document.createElement('span');
  span.textContent = text;
  el.append(span);
  toasts.append(el);
  fade(el);
}

// ---- Secrets ---------------------------------------------------------------------------------------------------------

/** Shows or hides the secret of a Hiện button (aria-pressed: shown); hidden, it shows its data-hidden (a proxy with its
 * password masked) or dots. */
function reveal(button: HTMLElement, on: boolean) {
  const secret = document.getElementById(button.dataset.reveal!);
  if (!secret) return;
  secret.textContent = on ? (secret.dataset.secret ?? '') : (secret.dataset.hidden ?? HIDDEN);
  button.setAttribute('aria-pressed', String(on));
}

/** Chép: the text to the clipboard; the button says so for a while, and a toast. */
function copy(button: HTMLElement) {
  void navigator.clipboard.writeText(button.dataset.copy ?? '').then(() => {
    button.classList.add('done');
    const label = button.querySelector<HTMLElement>('[data-label]');
    const was = label?.textContent;
    if (label && button.dataset.copied) label.textContent = button.dataset.copied;
    toast('Đã chép');
    setTimeout(() => {
      button.classList.remove('done');
      if (label && was) label.textContent = was;
    }, 1600);
  });
}

// ---- Days and date: "Số ngày" from today (Vietnam, data-today) and "Ngày hết hạn", each set from the other -------------

const dayText = (date: string) => date.split('-').reverse().join('/');
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

function untilText(box: HTMLElement, date: string) {
  const hint = field(box, 'date')?.closest('.field')?.querySelector('[data-hint]');
  if (hint) hint.textContent = date ? `Dùng tới hết ngày ${dayText(date)} (giờ Việt Nam)` : 'Dùng tới hết ngày đó (giờ Việt Nam)';
}

/** Puts `date` in a days-and-date box, and the days from today that it is. */
function setDate(box: HTMLElement, date: string) {
  field(box, 'date')!.value = date;
  field(box, 'days')!.value = date ? String(Math.round((Date.parse(date) - Date.parse(box.dataset.today!)) / DAY)) : '';
  untilText(box, date);
}

document.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement;
  const box = target.closest<HTMLElement>('[data-days-date]');
  if (box && target.name === 'days') {
    const n = Number(target.value);
    if (target.value !== '' && Number.isInteger(n)) {
      const date = addDays(box.dataset.today!, n);
      field(box, 'date')!.value = date;
      untilText(box, date);
    }
  } else if (box && target.name === 'date') {
    setDate(box, target.value);
  }
  if (target.id === 'find') filterRows();
});

// ---- Groups of fields of which only one is sent ----------------------------------------------------------------------

/** Shows `on` and hides `off`; the fields of a hidden group are turned off, so they are not sent. */
function showGroup(on: HTMLElement | null, off: HTMLElement | null) {
  for (const [group, shown] of [
    [on, true],
    [off, false],
  ] as const) {
    if (!group) continue;
    group.hidden = !shown;
    group.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((f) => (f.disabled = !shown));
  }
}

/** Tạo key: the group of the way to end it that is chosen (the radios "mode"). */
function modes(form: HTMLFormElement) {
  const mode = form.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value ?? 'activation';
  const group = (m: string) => form.querySelector<HTMLElement>(`[data-mode="${m}"]`);
  showGroup(group(mode), group(mode === 'fixed' ? 'activation' : 'fixed'));
}
document.querySelectorAll<HTMLFormElement>('form[data-modes]').forEach(modes);

// ---- Dialogs ---------------------------------------------------------------------------------------------------------

type Act = { action: string; title: string; text: string; ok?: string; danger?: boolean };
type License = { action: string; title: string; note: string; maxAccounts: number; date: string | null; duration: number | null; unit: string | null; bachHo: boolean };

/** The action dialog (and Khoá): its title, text, button and the action of its form, from the button that opened it. */
function fillAct(dialog: HTMLDialogElement, act: Act) {
  dialog.querySelector('[data-title]')!.textContent = act.title;
  const text = dialog.querySelector('[data-text]');
  if (text) text.textContent = act.text;
  dialog.querySelector('form')!.action = act.action;
  const ok = dialog.querySelector<HTMLElement>('[data-ok]');
  if (ok) {
    ok.textContent = act.ok ?? 'Đồng ý';
    ok.classList.toggle('danger', !!act.danger);
    ok.classList.toggle('primary', !act.danger);
  }
  const reason = field(dialog, 'reason');
  if (reason) reason.value = '';
}

/** Sửa: the key's note, accounts and end; the end is a date (with days) for a key that has one, else a duration. */
function fillEdit(dialog: HTMLDialogElement, l: License) {
  const form = dialog.querySelector('form')!;
  form.action = l.action;
  dialog.querySelector('[data-title]')!.textContent = l.title;
  field(form, 'note')!.value = l.note;
  field(form, 'maxAccounts')!.value = String(l.maxAccounts);
  form.querySelector<HTMLInputElement>(`input[name="bachHo"][value="${l.bachHo ? '1' : '0'}"]`)!.checked = true;
  const date = form.querySelector<HTMLElement>('[data-end="date"]');
  const duration = form.querySelector<HTMLElement>('[data-end="duration"]');
  if (l.date !== null) {
    showGroup(date, duration);
    setDate(date!.querySelector<HTMLElement>('[data-days-date]')!, l.date);
  } else {
    showGroup(duration, date);
    field(duration!, 'duration')!.value = String(l.duration ?? '');
    field(duration!, 'unit')!.value = l.unit ?? 'year';
  }
}

document.querySelectorAll<HTMLDialogElement>('dialog[data-autoopen]').forEach((d) => d.showModal());
// The key just made: closed, the page no longer opens it again when loaded again.
dialogOf('created')?.addEventListener('close', () => history.replaceState(null, '', location.pathname));
// A click on the backdrop (outside the dialog's box) closes it.
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  }),
);

// ---- The menu of a key: a popover placed under its button ------------------------------------------------------------

document.querySelectorAll<HTMLElement>('.menu[popover]').forEach((menu) => {
  menu.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    const button = document.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`);
    if (!button) return;
    const r = button.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const below = r.bottom + 4 + h <= innerHeight;
    menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    menu.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - h - 4)}px`;
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  });
  // Arrow keys between its items, Home and End; Escape closes it and gives the focus back to its button.
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      menu.hidePopover();
      document.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`)?.focus();
      return;
    }
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  });
});
// The page scrolls: an open menu would no longer sit under its button.
addEventListener('scroll', () => document.querySelectorAll<HTMLElement>('.menu:popover-open').forEach((m) => m.hidePopover()), { passive: true });

// ---- Clicks ----------------------------------------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const target = e.target as Element;

  // A button or menu item with data-open opens that dialog, filled from its data.
  const opener = target.closest<HTMLElement>('[data-open]');
  if (opener) {
    opener.closest<HTMLElement>('.menu:popover-open')?.hidePopover();
    const dialog = dialogOf(opener.dataset.open!);
    if (dialog) {
      if (opener.dataset.act) fillAct(dialog, JSON.parse(opener.dataset.act) as Act);
      if (opener.dataset.license) fillEdit(dialog, JSON.parse(opener.dataset.license) as License);
      dialog.showModal();
    }
    return;
  }
  // Huỷ, Xong.
  const close = target.closest('[data-close]');
  if (close) {
    close.closest('dialog')?.close();
    return;
  }
  const one = target.closest<HTMLElement>('[data-reveal]');
  if (one) {
    reveal(one, one.getAttribute('aria-pressed') !== 'true');
    return;
  }
  const all = target.closest<HTMLElement>('[data-reveal-all]');
  if (all) {
    const on = all.getAttribute('aria-pressed') !== 'true';
    all.setAttribute('aria-pressed', String(on));
    all.querySelector('[data-text]')!.textContent = on ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((b) => reveal(b, on));
    return;
  }
  const copier = target.closest<HTMLElement>('[data-copy]');
  if (copier) {
    copy(copier);
    return;
  }
  // Tải .txt of the keys just made: the text as a file, made here (nothing goes to the server).
  const saver = target.closest<HTMLElement>('[data-download]');
  if (saver) {
    const url = URL.createObjectURL(new Blob([`${saver.dataset.download ?? ''}\n`], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: saver.dataset.filename ?? 'key.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  // The state filter: one at a time.
  const pill = target.closest<HTMLElement>('[data-filter] [data-state]');
  if (pill) {
    pill.parentElement!.querySelectorAll('[data-state]').forEach((b) => b.setAttribute('aria-pressed', String(b === pill)));
    state = pill.dataset.state ?? '';
    filterRows();
  }
});

// ---- Changes: the way to end a key, the filters of the Nick and Log pages --------------------------------------------

document.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'mode') {
    const form = target.closest<HTMLFormElement>('form[data-modes]');
    if (form) modes(form);
  }
  const auto = target.closest<HTMLFormElement>('form[data-autosubmit]');
  if (auto) auto.requestSubmit();
});

// ---- The rows of a table: the state filter (data-state) and the search box (data-find) -------------------------------

const find = document.getElementById('find') as HTMLInputElement | null;
let state = '';

function filterRows() {
  const q = find?.value.trim().toLowerCase() ?? '';
  let n = 0;
  document.querySelectorAll<HTMLTableRowElement>('tbody tr[data-find]').forEach((tr) => {
    const show = (!q || tr.dataset.find!.includes(q)) && (!state || tr.dataset.state === state);
    tr.hidden = !show;
    if (show) n++;
  });
  const none = document.querySelector<HTMLElement>('[data-none]');
  if (none) none.hidden = n > 0;
}
