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
