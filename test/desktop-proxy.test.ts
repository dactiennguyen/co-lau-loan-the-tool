// The proxy text the add and edit form of the desktop app reads (app/desktop/src/proxyText.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProxyText } from '../app/desktop/src/proxyText.ts';

const p = (kind: string | undefined, host: string, port: number, username = '', password = '') => ({ kind, host, port, username, password });

test('the shapes proxy sellers hand out fill the same fields', () => {
  const full = p(undefined, '198.51.100.7', 6361, 'user-US', 'pa55');
  for (const text of ['198.51.100.7:6361:user-US:pa55', 'user-US:pa55@198.51.100.7:6361', 'user-US:pa55:198.51.100.7:6361',
    '198.51.100.7:6361@user-US:pa55', '  198.51.100.7\t6361\tuser-US\tpa55 ', '198.51.100.7:6361 user-US:pa55']) {
    assert.deepEqual(parseProxyText(text), full, text);
  }
  assert.deepEqual(parseProxyText('http://user-US:pa55@198.51.100.7:6361'), { ...full, kind: 'http' });
  assert.deepEqual(parseProxyText('HTTPS://user-US:pa55@198.51.100.7:6361/'), { ...full, kind: 'http' });
  assert.deepEqual(parseProxyText('socks5://198.51.100.7:6361:user-US:pa55'), { ...full, kind: 'socks5' });
  assert.deepEqual(parseProxyText('socks5h://u%40x:p%3Aw@proxy.example.com:1080'), p('socks5', 'proxy.example.com', 1080, 'u@x', 'p:w'));
  assert.deepEqual(parseProxyText('proxy.example.com:3128'), p(undefined, 'proxy.example.com', 3128));
  assert.deepEqual(parseProxyText('[2001:db8::1]:1080:u:p'), p(undefined, '2001:db8::1', 1080, 'u', 'p'));
  // A password with ":" after host:port:user.
  assert.deepEqual(parseProxyText('10.0.0.1:8080:bot:a:b'), p(undefined, '10.0.0.1', 8080, 'bot', 'a:b'));
  // Taken as typed without a scheme: % is part of the password.
  assert.equal((parseProxyText('bot:100%25@10.0.0.1:8080') as { password: string }).password, '100%25');
});

test('text that is no proxy is null, and SOCKS4 or an unknown scheme says why', () => {
  for (const text of ['', 'hello', '10.0.0.1', '10.0.0.1:99999', 'a:b:c:d', 'user:pass', 'one two three']) assert.equal(parseProxyText(text), null, text);
  assert.match(parseProxyText('socks4://10.0.0.1:1080') as string, /SOCKS4/);
  assert.match(parseProxyText('ftp://10.0.0.1:21') as string, /ftp/);
});

test('an account that falls into an error (a proxy that fails) brings one toast; a quest run it cut off has its own', async () => {
  const { errorToasts, questToasts } = await import('../app/desktop/src/toasts.ts');
  const account = (status: number, error = '', questRun: unknown = null) =>
    ({ id: 1, label: 'Nick farm', status, statusText: '', error, character: questRun ? { questRun } : null }) as never;
  const why = 'Proxy http 198.51.100.21:3128: proxy từ chối tài khoản hoặc mật khẩu';
  assert.deepEqual(errorToasts({ 1: account(1) }, [account(4, why)]), [{ tone: 'warn', title: 'Nick farm', text: `Lỗi: ${why}` }]);
  assert.deepEqual(errorToasts({ 1: account(4, why) }, [account(4, why)]), []);
  assert.deepEqual(errorToasts({}, [account(4, why)]), []);
  const running = account(3, '', { id: 7, done: null });
  assert.deepEqual(errorToasts({ 1: running }, [account(4, 'Server đã đóng kết nối')]), []);
  assert.equal(questToasts({ 1: running }, [account(4, 'Server đã đóng kết nối')]).length, 1);
});
