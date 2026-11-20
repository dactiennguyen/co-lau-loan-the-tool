//! A proxy the session reaches the game server through: SOCKS5 (RFC 1928/1929) or an HTTP proxy with CONNECT, as
//! src/net/proxy.ts. Only the TCP connection changes; the game protocol runs inside the tunnel as it does without one.
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyKind {
    #[default]
    Socks5,
    Http,
}

/// The proxy of an account in accounts.json. Kept while `enabled` is off, so it can be turned on again; an empty
/// `username` means no authentication. The password is never logged; only the edit form gets it.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proxy {
    #[serde(default = "on")]
    pub enabled: bool,
    #[serde(default)]
    pub kind: ProxyKind,
    pub host: String,
    pub port: u16,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub username: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub password: String,
}
fn on() -> bool {
    true
}
impl std::fmt::Debug for Proxy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Proxy({}, enabled: {})", self.label(), self.enabled)
    }
}
impl Proxy {
    /// For logs and errors: kind and address, never the credentials.
    pub fn label(&self) -> String {
        let kind = match self.kind {
            ProxyKind::Socks5 => "socks5",
            ProxyKind::Http => "http",
        };
        if self.host.contains(':') {
            format!("{kind} [{}]:{}", self.host, self.port)
        } else {
            format!("{kind} {}:{}", self.host, self.port)
        }
    }
    /// What the add and edit form must fill in.
    pub fn check_fields(&self) -> Result<(), String> {
        if self.host.trim().is_empty() || self.host.contains(char::is_whitespace) {
            return Err("Proxy cần địa chỉ (host), không có dấu cách".into());
        }
        if self.port == 0 {
            return Err("Cổng proxy phải từ 1 đến 65535".into());
        }
        if self.kind == ProxyKind::Socks5
            && (self.username.len() > 255 || self.password.len() > 255)
        {
            return Err("Tài khoản và mật khẩu proxy SOCKS5 dài tối đa 255 byte".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Stage {
    Method,
    Auth,
    Connect,
    Http,
}

/// An HTTP proxy answer bigger than this without its blank line is not a CONNECT reply.
const HTTP_HEAD_MAX: usize = 16384;

/// Opens a tunnel to host:port through a proxy with no I/O of its own (ProxyTunnel of src/net/proxy.ts): send `start()`,
/// feed what the proxy answers to `receive`, write back what it returns, until `open`. Errors are the reason in
/// Vietnamese, without the proxy's name; `open_tunnel` adds it.
pub struct Tunnel<'a> {
    proxy: &'a Proxy,
    host: &'a str,
    port: u16,
    stage: Stage,
    buf: Vec<u8>,
    pub open: bool,
}
impl<'a> Tunnel<'a> {
    pub fn new(proxy: &'a Proxy, host: &'a str, port: u16) -> Self {
        Self {
            proxy,
            host,
            port,
            stage: Stage::Method,
            buf: vec![],
            open: false,
        }
    }

    pub fn start(&mut self) -> Vec<u8> {
        let p = self.proxy;
        if p.kind == ProxyKind::Http {
            self.stage = Stage::Http;
            let target = if self.host.contains(':') {
                format!("[{}]:{}", self.host, self.port)
            } else {
                format!("{}:{}", self.host, self.port)
            };
            let auth = if p.username.is_empty() {
                String::new()
            } else {
                let basic = base64(format!("{}:{}", p.username, p.password).as_bytes());
                format!("Proxy-Authorization: Basic {basic}\r\n")
            };
            return format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n{auth}\r\n")
                .into_bytes();
        }
        // No authentication (0), plus username/password (2) when there are credentials.
        if p.username.is_empty() {
            vec![5, 1, 0]
        } else {
            vec![5, 2, 0, 2]
        }
    }

    /// The bytes to send back (maybe none), and once `open`, whatever came after the proxy's last reply: the game
    /// server's 4-byte seed may share a chunk with it.
    pub fn receive(&mut self, chunk: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
        self.buf.extend_from_slice(chunk);
        let b = &self.buf;
        match self.stage {
            Stage::Method => {
                if b.len() < 2 {
                    return Ok((vec![], vec![]));
                }
                if b[0] != 5 {
                    return Err("không phải proxy SOCKS5".into());
                }
                let method = b[1];
                self.buf.drain(..2);
                match method {
                    0 => Ok((self.connect()?, vec![])),
                    2 if !self.proxy.username.is_empty() => {
                        self.stage = Stage::Auth;
                        let (u, p) = (
                            self.proxy.username.as_bytes(),
                            self.proxy.password.as_bytes(),
                        );
                        // RFC 1929 gives each one byte of length: a longer one would be cut, and the proxy would read
                        // the rest as something else (an account of Nhập JSON skips the form's check_fields).
                        if u.len() > 255 || p.len() > 255 {
                            return Err(
                                "Tài khoản và mật khẩu proxy SOCKS5 dài tối đa 255 byte".into()
                            );
                        }
                        let mut out = vec![1, u.len() as u8];
                        out.extend_from_slice(u);
                        out.push(p.len() as u8);
                        out.extend_from_slice(p);
                        Ok((out, vec![]))
                    }
                    0xff if self.proxy.username.is_empty() => Err(NEEDS_LOGIN.into()),
                    0xff => Err("proxy không nhận cách đăng nhập nào bot đưa ra".into()),
                    m => Err(format!(
                        "proxy SOCKS5 chọn cách đăng nhập {m}, bot không đưa ra cách đó"
                    )),
                }
            }
            Stage::Auth => {
                if b.len() < 2 {
                    return Ok((vec![], vec![]));
                }
                if b[1] != 0 {
                    return Err(REFUSED_LOGIN.into());
                }
                self.buf.drain(..2);
                Ok((self.connect()?, vec![]))
            }
            Stage::Connect => {
                if b.len() < 2 {
                    return Ok((vec![], vec![]));
                }
                if b[0] != 5 {
                    return Err("trả lời không phải của proxy SOCKS5".into());
                }
                if b[1] != 0 {
                    return Err(format!(
                        "không nối được tới server game ({})",
                        socks_reply(b[1])
                    ));
                }
                if b.len() < 5 {
                    return Ok((vec![], vec![]));
                }
                // VER REP RSV ATYP BND.ADDR BND.PORT: the bound address is IPv4 (1), a name with its length (3), IPv6 (4).
                let address = match b[3] {
                    1 => 4,
                    3 => 1 + b[4] as usize,
                    4 => 16,
                    t => return Err(format!("proxy SOCKS5 trả địa chỉ loại {t}")),
                };
                if b.len() < 4 + address + 2 {
                    return Ok((vec![], vec![]));
                }
                self.open = true;
                Ok((vec![], b[4 + address + 2..].to_vec()))
            }
            Stage::Http => {
                let Some(end) = b.windows(4).position(|w| w == b"\r\n\r\n") else {
                    if b.len() > HTTP_HEAD_MAX {
                        return Err("trả lời của proxy HTTP không có dòng trống kết thúc".into());
                    }
                    return Ok((vec![], vec![]));
                };
                let line_end = b.windows(2).position(|w| w == b"\r\n").unwrap_or(end);
                let line = String::from_utf8_lossy(&b[..line_end]).into_owned();
                let status = line
                    .strip_prefix("HTTP/1.1 ")
                    .or_else(|| line.strip_prefix("HTTP/1.0 "))
                    .and_then(|s| s.get(..3))
                    .and_then(|s| s.parse::<u16>().ok())
                    .ok_or("không phải proxy HTTP")?;
                match status {
                    200..=299 => {
                        self.open = true;
                        Ok((vec![], b[end + 4..].to_vec()))
                    }
                    407 if self.proxy.username.is_empty() => Err(NEEDS_LOGIN.into()),
                    407 => Err(REFUSED_LOGIN.into()),
                    _ => Err(format!("proxy HTTP từ chối: {}", line[9..].trim())),
                }
            }
        }
    }

    /// CONNECT host:port: IPv4 and IPv6 as addresses, anything else as a name the proxy resolves (the game's host).
    fn connect(&mut self) -> Result<Vec<u8>, String> {
        self.stage = Stage::Connect;
        let mut out = vec![5, 1, 0];
        match self.host.parse::<IpAddr>() {
            Ok(IpAddr::V4(ip)) => {
                out.push(1);
                out.extend_from_slice(&ip.octets());
            }
            Ok(IpAddr::V6(ip)) => {
                out.push(4);
                out.extend_from_slice(&ip.octets());
            }
            Err(_) => {
                let name = self.host.as_bytes();
                if name.len() > 255 {
                    return Err("tên server game quá dài cho SOCKS5".into());
                }
                out.extend_from_slice(&[3, name.len() as u8]);
                out.extend_from_slice(name);
            }
        }
        out.extend_from_slice(&self.port.to_be_bytes());
        Ok(out)
    }
}

const NEEDS_LOGIN: &str = "proxy cần tài khoản và mật khẩu";
const REFUSED_LOGIN: &str = "proxy từ chối tài khoản hoặc mật khẩu";

/// SOCKS5 replies other than 0 (RFC 1928 §6).
fn socks_reply(rep: u8) -> String {
    match rep {
        1 => "lỗi chung của proxy".into(),
        2 => "proxy không cho phép kết nối này".into(),
        3 => "không tới được mạng".into(),
        4 => "không tới được máy".into(),
        5 => "server game từ chối kết nối".into(),
        6 => "hết TTL".into(),
        7 => "proxy không hỗ trợ lệnh CONNECT".into(),
        8 => "proxy không hỗ trợ loại địa chỉ".into(),
        r => format!("mã {r}"),
    }
}

/// Runs the tunnel's handshake on a stream connected to the proxy; the bytes after the proxy's last reply.
pub async fn open_tunnel<S: AsyncRead + AsyncWrite + Unpin>(
    stream: &mut S,
    proxy: &Proxy,
    host: &str,
    port: u16,
) -> Result<Vec<u8>, String> {
    let fail = |e: String| format!("Proxy {}: {e}", proxy.label());
    let mut t = Tunnel::new(proxy, host, port);
    let io = |e: std::io::Error| fail(e.to_string());
    stream.write_all(&t.start()).await.map_err(io)?;
    let mut buf = [0u8; 2048];
    loop {
        let n = stream.read(&mut buf).await.map_err(io)?;
        if n == 0 {
            return Err(fail(
                "đóng kết nối trước khi mở đường tới server game".into(),
            ));
        }
        let (send, rest) = t.receive(&buf[..n]).map_err(fail)?;
        if !send.is_empty() {
            stream.write_all(&send).await.map_err(io)?;
        }
        if t.open {
            return Ok(rest);
        }
    }
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = u32::from(c[0]) << 16
            | u32::from(*c.get(1).unwrap_or(&0)) << 8
            | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..4 {
            out.push(if i <= c.len() {
                TABLE[(n >> (18 - 6 * i) & 63) as usize] as char
            } else {
                '='
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proxy(kind: ProxyKind, username: &str, password: &str) -> Proxy {
        Proxy {
            enabled: true,
            kind,
            host: "127.0.0.1".into(),
            port: 1080,
            username: username.into(),
            password: password.into(),
        }
    }

    #[test]
    fn socks5_offers_username_and_password_only_with_them_and_keeps_the_bytes_after_its_reply() {
        let p = proxy(ProxyKind::Socks5, "ab", "cd");
        let mut t = Tunnel::new(&p, "plays1.colauloanthe.vn", 1688);
        assert_eq!(t.start(), [5, 2, 0, 2]);
        assert_eq!(
            t.receive(&[5, 2]).unwrap().0,
            [1, 2, b'a', b'b', 2, b'c', b'd']
        );
        let mut connect = vec![5, 1, 0, 3, 22];
        connect.extend_from_slice(b"plays1.colauloanthe.vn");
        connect.extend_from_slice(&[0x06, 0x98]);
        assert_eq!(t.receive(&[1, 0]).unwrap().0, connect);
        // The reply one byte at a time, its last byte in the same chunk as the start of the seed.
        for b in [5, 0, 0, 1, 10, 0, 0, 1, 0x04] {
            assert!(t.receive(&[b]).unwrap().1.is_empty());
        }
        assert!(!t.open);
        assert_eq!(t.receive(&[0x38, 0xde, 0xad]).unwrap().1, [0xde, 0xad]);
        assert!(t.open);
        let plain = proxy(ProxyKind::Socks5, "", "");
        let mut t = Tunnel::new(&plain, "10.1.2.3", 80);
        assert_eq!(t.start(), [5, 1, 0]);
        assert_eq!(
            t.receive(&[5, 0]).unwrap().0,
            [5, 1, 0, 1, 10, 1, 2, 3, 0, 80]
        );
    }

    #[test]
    fn http_connect_sends_basic_auth_and_keeps_the_bytes_after_the_headers() {
        let p = proxy(ProxyKind::Http, "u", "p");
        let mut t = Tunnel::new(&p, "plays1.colauloanthe.vn", 1688);
        assert_eq!(
            String::from_utf8(t.start()).unwrap(),
            "CONNECT plays1.colauloanthe.vn:1688 HTTP/1.1\r\nHost: plays1.colauloanthe.vn:1688\r\nProxy-Authorization: Basic dTpw\r\n\r\n"
        );
        assert!(t.receive(b"HTTP/1.1 200 OK\r\n").unwrap().1.is_empty());
        assert_eq!(t.receive(b"Via: x\r\n\r\n\x01\x02").unwrap().1, [1, 2]);
        assert!(t.open);
        assert_eq!(base64(b"bot:s3cret"), "Ym90OnMzY3JldA==");
        assert_eq!(base64(b"ab"), "YWI=");
    }

    #[test]
    fn refusals_say_why() {
        let err = |p: &Proxy, replies: &[&[u8]]| {
            let mut t = Tunnel::new(p, "1.2.3.4", 1688);
            t.start();
            replies
                .iter()
                .find_map(|r| t.receive(r).err())
                .unwrap_or_default()
        };
        let none = proxy(ProxyKind::Socks5, "", "");
        let login = proxy(ProxyKind::Socks5, "u", "x");
        assert_eq!(err(&none, &[&[5, 0xff]]), NEEDS_LOGIN);
        assert_eq!(err(&login, &[&[5, 2], &[1, 1]]), REFUSED_LOGIN);
        assert_eq!(
            err(&none, &[&[5, 0], &[5, 5]]),
            "không nối được tới server game (server game từ chối kết nối)"
        );
        assert_eq!(err(&none, &[b"HT"]), "không phải proxy SOCKS5");
        let http = proxy(ProxyKind::Http, "", "");
        assert_eq!(
            err(
                &http,
                &[b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"]
            ),
            NEEDS_LOGIN
        );
        assert_eq!(
            err(&http, &[b"HTTP/1.0 403 Forbidden\r\n\r\n"]),
            "proxy HTTP từ chối: 403 Forbidden"
        );
        assert_eq!(err(&http, &[b"\x05\x00\r\n\r\n"]), "không phải proxy HTTP");
    }

    #[test]
    fn accounts_json_keeps_the_proxy_and_logs_never_show_its_password() {
        let p = proxy(ProxyKind::Http, "bot", "s3cret");
        let json = serde_json::to_string(&p).unwrap();
        assert_eq!(
            json,
            r#"{"enabled":true,"kind":"http","host":"127.0.0.1","port":1080,"username":"bot","password":"s3cret"}"#
        );
        assert_eq!(serde_json::from_str::<Proxy>(&json).unwrap(), p);
        let bare: Proxy = serde_json::from_str(r#"{"host":"::1","port":1080}"#).unwrap();
        assert_eq!(
            (bare.enabled, bare.kind, bare.label()),
            (true, ProxyKind::Socks5, "socks5 [::1]:1080".into())
        );
        assert_eq!(
            format!("{p:?}"),
            "Proxy(http 127.0.0.1:1080, enabled: true)"
        );
        assert!(Proxy {
            host: " ".into(),
            ..p.clone()
        }
        .check_fields()
        .is_err());
        assert!(Proxy { port: 0, ..p }.check_fields().is_err());
    }
}
