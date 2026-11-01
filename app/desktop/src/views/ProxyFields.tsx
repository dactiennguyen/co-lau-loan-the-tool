import { useState, type ClipboardEvent } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { cn } from "../cn";
import { Icon } from "../components/Icon";
import { PasswordField } from "../components/PasswordField";
import { TextField } from "../components/TextField";
import { num } from "../format";
import { PROXY_FORMATS, parseProxyText, type ParsedProxy } from "../proxyText";
import type { ProxyForm, ProxyInfo, ProxyKind } from "../types";

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

/** Address and port, or username and password: the inputs shrink with their column, a disabled one is dimmed. */
const ROW = "grid gap-2.5 [&_input:disabled]:opacity-50 [&_input:disabled]:cursor-not-allowed";
/** The radio or checkbox of a label drawn as a switch or a chip: out of sight, still focusable. */
const HIDDEN_INPUT = "absolute opacity-0 w-px h-px";

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
    // A switch row, then (on) a dark plate with the paste field, the kind, the address and the check; off, one line on
    // what the account does instead.
    <fieldset className="grid gap-2.5 m-0 p-0 border-0 min-w-0">
      <label
        className={cn(
          "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2 bg-ink cursor-pointer hover:bg-bg-2",
          p.enabled && "shadow-[inset_3px_0_0_var(--good)]",
        )}
      >
        <input type="checkbox" role="switch" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} className={cn(HIDDEN_INPUT, "peer")} />
        {/* A pixel switch: a notched track and a square knob that steps across. */}
        <span
          className={
            "relative w-[30px] h-4 bg-bg-2 shadow-[inset_0_0_0_2px_var(--line-strong)] " +
            "after:content-[''] after:absolute after:top-1 after:left-1 after:size-2 after:bg-fg-3 " +
            "after:transition-[transform,background] after:duration-(--fast) after:ease-step " +
            "peer-checked:bg-good-shade peer-checked:shadow-[inset_0_0_0_2px_var(--good)] peer-checked:after:[transform:translateX(14px)] peer-checked:after:bg-fg " +
            "peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2"
          }
          aria-hidden="true"
        />
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-fg">
          <Icon name="shield" size={13} /> Kết nối qua proxy
        </span>
        <span className={cn("font-pixel font-normal text-11 leading-none text-fg-3", p.enabled && "text-good")}>{p.enabled ? "Bật" : "Tắt"}</span>
      </label>

      {!p.enabled && (
        <p className="m-0 text-11 leading-[1.45] text-fg-2">
          {p.host.trim()
            ? `Đã có ${proxyLabel(p)}, đang tắt: nick kết nối thẳng tới server game. Bật lại để dùng.`
            : "Nick kết nối thẳng tới server game. Bật để đi qua proxy SOCKS5 hoặc HTTP."}
        </p>
      )}

      {p.enabled && (
        <div className="grid gap-2.5 p-2.5 bg-bg-2 shadow-[inset_3px_0_0_var(--good)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] [align-items:end] gap-1.5">
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
            <p className={cn("-mt-1 mx-0 mb-0 text-11 leading-[1.4] wrap-anywhere", pasted.ok ? "text-good" : "text-danger")} role="status">
              {pasted.text}
            </p>
          ) : null}
          {pasted && !pasted.ok && (
            <ul className="flex flex-wrap gap-1 -mt-1 mx-0 mb-0 p-0 list-none" aria-label="Các dạng proxy đọc được">
              {PROXY_FORMATS.map((f) => (
                <li key={f} className="px-[5px] py-px bg-ink font-mono font-normal text-[10.5px] leading-[1.5] text-fg-2">
                  {f}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-1.5" role="radiogroup" aria-label="Loại proxy">
            {KINDS.map((k) => (
              <label
                key={k.kind}
                className={cn(
                  "inline-flex items-center h-[26px] px-2.5 py-0 bg-ink font-pixel font-normal text-12 leading-none text-fg-2 cursor-pointer notch-sm",
                  "hover:text-fg has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:-outline-offset-4",
                  p.kind === k.kind && "bg-primary text-on-primary",
                )}
              >
                <input
                  className={HIDDEN_INPUT}
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
          <div className={cn(ROW, "grid-cols-[minmax(0,1fr)_92px]")}>
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
          <div className={cn(ROW, "grid-cols-[1fr_1fr]")}>
            <TextField className="min-w-0" inputClassName="w-full min-w-0" label="Tài khoản (tuỳ chọn)" value={p.username} onChange={(e) => set({ username: e.target.value })} />
            <PasswordField className="min-w-0"
              label="Mật khẩu"
              placeholder={keepsPassword ? "Để trống nếu không đổi" : ""}
              disabled={!p.username.trim()}
              value={p.password}
              onChange={(e) => set({ password: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2.5 min-h-7">
            <Button kind="tonal" small icon="bolt" onClick={test} disabled={!p.host.trim() || !p.port || check.state === "testing"}>
              {check.state === "testing" ? "Đang kiểm tra…" : "Kiểm tra"}
            </Button>
            <span
              className={cn(
                "inline-flex items-center gap-1 min-w-0 text-11 leading-[1.4] text-fg-3 wrap-anywhere",
                check.state === "ok" && "text-good font-semibold",
                check.state === "fail" && "text-danger",
              )}
              role="status"
            >
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
