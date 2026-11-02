// The one script of the admin page, inline with the nonce of the page's Content-Security-Policy: Hiện/Ẩn and Chép of
// secrets, the question of a form with data-confirm, and the search box of a table (rows with data-find).
export const SCRIPT = `
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-reveal]');
  if (b) { const s = document.getElementById(b.dataset.reveal); const on = s.dataset.on !== '1';
    s.textContent = on ? s.dataset.secret : '••••••••'; s.dataset.on = on ? '1' : '0'; b.textContent = on ? 'Ẩn' : 'Hiện'; b.setAttribute('aria-pressed', String(on)); }
  const all = e.target.closest('[data-reveal-all]');
  if (all) { const on = all.getAttribute('aria-pressed') !== 'true'; all.setAttribute('aria-pressed', String(on)); all.textContent = on ? 'Ẩn mọi mật khẩu' : 'Hiện mọi mật khẩu';
    document.querySelectorAll('[data-reveal]').forEach((x) => { const s = document.getElementById(x.dataset.reveal);
      s.textContent = on ? s.dataset.secret : '••••••••'; s.dataset.on = on ? '1' : '0'; x.textContent = on ? 'Ẩn' : 'Hiện'; x.setAttribute('aria-pressed', String(on)); }); }
  const copy = e.target.closest('[data-copy]');
  if (copy) navigator.clipboard.writeText(copy.dataset.copy).then(() => { copy.textContent = 'Đã chép'; });
});
document.addEventListener('submit', (e) => { const m = e.target.dataset.confirm; if (m && !confirm(m)) e.preventDefault(); });
const find = document.getElementById('find');
if (find) find.addEventListener('input', () => { const q = find.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('tbody tr[data-find]').forEach((tr) => { const show = !q || tr.dataset.find.includes(q); tr.hidden = !show; if (show) n++; });
  document.getElementById('shown').textContent = q ? n + ' dòng khớp' : ''; });
`;
