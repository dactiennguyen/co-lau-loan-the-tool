import { useState, type ClipboardEvent } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { PasswordField } from "../components/PasswordField";
import { TextField } from "../components/TextField";
import { num } from "../format";
import { PROXY_FORMATS, parseProxyText, type ParsedProxy } from "../proxyText";
import type { ProxyForm, ProxyInfo, ProxyKind } from "../types";
import "./ProxyFields.css";

interface Props {
  value: ProxyForm;
  onChange: (proxy: ProxyForm) => void;
  /** The proxy saved for the account being edited. */
  saved?: ProxyInfo | null;
  accountId?: number;
}

type Check = { state: "idle" } | { state: "testing" } | { state: "ok"; ms: number } | { state: "fail"; text: string };

const KINDS: { kind: ProxyKind; name: string; port: number }[] = [
  { kind: "socks5", name: "SOCKS5", port: 1080 },
  { kind: "http", name: "HTTP", port: 8080 },
];
/** The usual port of a kind, for a new proxy. */
export const defaultPort = (kind: ProxyKind) => KINDS.find((k) => k.kind === kind)!.port;

export const proxyLabel = (p: ProxyForm) => `${p.kind} ${p.host.includes(":") ? `[${p.host}]` : p.host}:${p.port}`;

/**
 * The proxy of the add and edit form: on or off (saved either way), type, address, port, username, password. A pasted
 * proxy string fills them all (proxyText.ts). Kiểm tra reaches the game server through it; Lưu does the same before
 * saving a proxy turned on or changed.
 */
export function ProxyFields({ value: p, onChange, saved, accountId }: Props) {
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [paste, setPaste] = useState("");
  const [pasted, setPasted] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<ProxyForm>) => {
    onChange({ ...p, ...patch });
    setCheck({ state: "idle" });
  };
  /** Fills the fields from a proxy string; false when it is none. */
  const fill = (text: string) => {
    const r = parseProxyText(text);
    if (r == null) {
      setPasted({ ok: false, text: "Không nhận ra chuỗi proxy này. Các dạng đọc được ở dưới." });
      return false;
    }
    if (typeof r === "string") {
      setPasted({ ok: false, text: r });
      return false;
    }
    const filled: ParsedProxy = r;
    set({ ...filled, kind: filled.kind ?? p.kind });
    setPaste("");
    const kind = filled.kind ? "" : ` (loại ${p.kind === "http" ? "HTTP" : "SOCKS5"} như đang chọn: đổi nếu sai)`;
    const who = filled.username ? `, tài khoản ${filled.username}` : ", không tài khoản";
    setPasted({ ok: true, text: `Đã điền ${filled.host}:${filled.port}${who}${kind}` });
    return true;
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (fill(e.clipboardData.getData("text"))) e.preventDefault();
  };
  const test = () => {
    setCheck({ state: "testing" });
    api.testProxy(p, accountId).then(
      (ms) => setCheck({ state: "ok", ms }),
      (err) => setCheck({ state: "fail", text: String(err instanceof Error ? err.message : err) }),
    );
  };
  const keepsPassword = !!saved?.hasPassword && !!p.username && p.username.trim() === saved.username;

  return (
    <fieldset className={`proxy${p.enabled ? " proxy--on" : ""}`}>
      <label className="proxy__switch">
        <input type="checkbox" role="switch" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span className="proxy__track" aria-hidden="true" />
        <span className="proxy__title">
          <Icon name="shield" size={13} /> Kết nối qua proxy
        </span>
        <span className="proxy__state">{p.enabled ? "Bật" : "Tắt"}</span>
      </label>

      {!p.enabled && (
        <p className="proxy__off">
          {p.host.trim()
            ? `Đã có ${proxyLabel(p)}, đang tắt: nick kết nối thẳng tới server game. Bật lại để dùng.`
            : "Nick kết nối thẳng tới server game. Bật để đi qua proxy SOCKS5 hoặc HTTP."}
        </p>
      )}

      {p.enabled && (
        <div className="proxy__body">
          <div className="proxy__paste">
            <TextField className="min-w-0" inputClassName="w-full min-w-0"
              label="Dán proxy"
              placeholder="vd. 1.2.3.4:8080:user:pass"
              value={paste}
              onPaste={onPaste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fill(paste);
                }
              }}
            />
            <Button kind="outline" small className="h-[34px]" onClick={() => fill(paste)} disabled={!paste.trim()}>
              Điền
            </Button>
          </div>
          {pasted ? (
            <p className={`proxy__note${pasted.ok ? " proxy__note--ok" : " proxy__note--bad"}`} role="status">
              {pasted.text}
            </p>
          ) : null}
          {pasted && !pasted.ok && (
            <ul className="proxy__formats" aria-label="Các dạng proxy đọc được">
              {PROXY_FORMATS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}

          <div className="proxy__kinds" role="radiogroup" aria-label="Loại proxy">
            {KINDS.map((k) => (
              <label key={k.kind} className={`proxy__kind${p.kind === k.kind ? " proxy__kind--on" : ""}`}>
                <input
                  type="radio"
                  name="proxy-kind"
                  value={k.kind}
                  checked={p.kind === k.kind}
                  // With nothing typed in yet, the port follows the kind.
                  onChange={() => set({ kind: k.kind, port: !p.host && p.port === defaultPort(p.kind) ? k.port : p.port })}
                />
                {k.name}
              </label>
            ))}
          </div>
          <div className="proxy__row">
            <TextField className="min-w-0" inputClassName="w-full min-w-0" label="Địa chỉ proxy" placeholder="vd. 1.2.3.4" value={p.host} onPaste={onPaste} onChange={(e) => set({ host: e.target.value })} />
            <TextField className="min-w-0" inputClassName="w-full min-w-0"
              label="Cổng"
              type="number"
              min={1}
              max={65535}
              value={p.port || ""}
              onChange={(e) => set({ port: Number(e.target.value) })}
            />
          </div>
          <div className="proxy__row proxy__row--even">
            <TextField className="min-w-0" inputClassName="w-full min-w-0" label="Tài khoản (tuỳ chọn)" value={p.username} onChange={(e) => set({ username: e.target.value })} />
            <PasswordField className="min-w-0"
              label="Mật khẩu"
              placeholder={keepsPassword ? "Để trống nếu không đổi" : ""}
              disabled={!p.username.trim()}
              value={p.password}
              onChange={(e) => set({ password: e.target.value })}
            />
          </div>
          <div className="proxy__check">
            <Button kind="tonal" small icon="bolt" onClick={test} disabled={!p.host.trim() || !p.port || check.state === "testing"}>
              {check.state === "testing" ? "Đang kiểm tra…" : "Kiểm tra"}
            </Button>
            <span className={`proxy__result proxy__result--${check.state}`} role="status">
              {check.state === "ok" && (
                <>
                  <Icon name="check" size={12} /> Tới được server game qua proxy, {num(check.ms)} ms
                </>
              )}
              {check.state === "fail" && check.text}
              {check.state === "idle" && "Bấm Lưu cũng kiểm tra trước khi lưu."}
            </span>
          </div>
        </div>
      )}
    </fieldset>
  );
}
