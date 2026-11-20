//! Kết nối: the TCP connection to the game server, directly or through the proxy of the account, and its check.
use super::*;

/// The TCP connection to the game server, through `proxy` when the account has one turned on; with the bytes the proxy
/// passed on after its last reply.
pub(super) async fn connect(
    server: (&str, u16),
    proxy: Option<&Proxy>,
    emit: &Emit,
) -> Result<(TcpStream, Vec<u8>), Error> {
    let Some(p) = proxy else {
        let stream = timeout(STEP, TcpStream::connect(server))
            .await
            .map_err(|_| "Hết giờ kết nối".to_string())?
            .map_err(|e| e.to_string())?;
        stream.set_nodelay(true).map_err(|e| e.to_string())?;
        return Ok((stream, vec![]));
    };
    emit(Event::Log(
        LogKind::Connection,
        format!("Kết nối qua proxy {}", p.label()),
    ));
    let through = tunnel(p, server).await?;
    emit(Event::Log(
        LogKind::Connection,
        format!("Proxy {} đã mở đường tới server game", p.label()),
    ));
    // The IP the game sees, for the account's badge: asked on the side, the login does not wait for it.
    let (proxy, emit) = (p.clone(), emit.clone());
    tokio::spawn(async move {
        if let Ok(ip) = proxy_exit_ip(&proxy).await {
            emit(Event::ProxyIp(ip));
        }
    });
    Ok(through)
}

/// Connects to the proxy and opens its tunnel to `server`, each within STEP. Errors name the proxy, not its password.
pub(super) async fn tunnel(p: &Proxy, server: (&str, u16)) -> Result<(TcpStream, Vec<u8>), Error> {
    let mut stream = timeout(STEP, TcpStream::connect((p.host.as_str(), p.port)))
        .await
        .map_err(|_| format!("Hết giờ kết nối proxy {}", p.label()))?
        .map_err(|e| format!("Không kết nối được proxy {}: {e}", p.label()))?;
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    let early = timeout(STEP, open_tunnel(&mut stream, p, server.0, server.1))
        .await
        .map_err(|_| format!("Proxy {} không trả lời", p.label()))??;
    Ok((stream, early))
}

/// "Kiểm tra" of the proxy in the add and edit form, and the test before saving: reaches the game server through
/// `proxy` and waits for its 4-byte seed, then closes without logging in. How long that took.
pub async fn check_proxy(server: &Server, proxy: &Proxy) -> Result<Duration, Error> {
    let start = Instant::now();
    let (mut stream, early) = tunnel(proxy, server.addr()).await?;
    if early.len() < 4 {
        let mut rest = vec![0u8; 4 - early.len()];
        timeout(STEP, stream.read_exact(&mut rest))
            .await
            .map_err(|_| "Proxy đã mở đường nhưng server game không gửi seed".to_string())?
            .map_err(|e| format!("Proxy đã mở đường nhưng server game không trả lời: {e}"))?;
    }
    Ok(start.elapsed())
}

/// Where the IP the game sees is asked: a plain-HTTP echo of the caller's address, through the proxy's tunnel.
const IP_ECHO: (&str, u16) = ("api.ipify.org", 80);

/// The IP the proxy goes out with, as the game server sees it (a rotating proxy's differs from its host's): GET / of
/// IP_ECHO through `proxy`, each step within STEP. For Kiểm tra and the badge of the account; nothing else is sent.
pub async fn proxy_exit_ip(proxy: &Proxy) -> Result<String, Error> {
    let (mut stream, early) = tunnel(proxy, IP_ECHO).await?;
    let ask = format!(
        "GET / HTTP/1.1\r\nHost: {}\r\nUser-Agent: cllt\r\nConnection: close\r\n\r\n",
        IP_ECHO.0
    );
    stream
        .write_all(ask.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    let mut reply = early;
    let mut buf = [0u8; 1024];
    loop {
        let n = timeout(STEP, stream.read(&mut buf))
            .await
            .map_err(|_| "Không hỏi được IP qua proxy (hết giờ)".to_string())?
            .map_err(|e| e.to_string())?;
        if n == 0 || reply.len() > 8192 {
            break;
        }
        reply.extend_from_slice(&buf[..n]);
    }
    exit_ip_of(&reply).ok_or_else(|| "Không đọc được IP qua proxy".into())
}

/// The address in the body of IP_ECHO's answer ("HTTP/1.1 200 OK … \r\n\r\n203.0.113.7"), when it is one.
pub(super) fn exit_ip_of(reply: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(reply).ok()?;
    let (head, body) = text.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.") || head.split(' ').nth(1).is_none_or(|c| c != "200") {
        return None;
    }
    let ip = body.trim();
    ip.parse::<std::net::IpAddr>().ok().map(|_| ip.to_string())
}
