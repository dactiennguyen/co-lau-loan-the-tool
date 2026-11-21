import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Popover } from "@/components/Popover";
import type { ProxyInfo } from "@/api/types";
import { cn } from "@/utils/cn";

const KIND: Record<ProxyInfo["kind"], string> = { http: "HTTP", socks5: "SOCKS5" };

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] items-baseline gap-2">
      <dt className="text-11 text-fg-3">{name}</dt>
      <dd className="m-0 text-12 font-bold text-fg break-all">{children}</dd>
    </div>
  );
}

/**
 * The proxy an account connects through, as a green shield alone (the account list, the character card); a click opens
 * what it is: HTTP or SOCKS5, the server, the user, and the IP the game sees (asked through the proxy soon after login).
 * Clicks inside do not reach the card around it, so they do not select the account. `className` is on the button (its
 * size and frame), `frameClassName` on the box around it (its place in a row).
 */
export function ProxyButton({ proxy, className, frameClassName }: { proxy: ProxyInfo; className?: string; frameClassName?: string }) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLSpanElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) frame.current?.querySelector("button")?.focus();
  }, []);
  const label = `Proxy ${KIND[proxy.kind]}${proxy.ip ? `, IP ${proxy.ip}` : ""}`;
  return (
    <span
      ref={frame}
      className={cn("inline-flex flex-none", frameClassName)}
      // The card around it selects the account on a click; the panel is drawn on the body but its events still bubble here.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          "grid place-items-center p-0 border-0 bg-transparent text-good cursor-pointer hover:text-fg",
          "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
          open && "text-fg",
          className,
        )}
        aria-label={label}
        title={`${label}: bấm để xem chi tiết`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="shield" size={12} />
      </button>
      {open && (
        <Popover anchor={frame} label="Proxy" onClose={close} className="w-[250px]">
          <p className="m-0 flex items-center gap-1.5 font-display font-extrabold text-[10.5px] tracking-[0.06em] uppercase text-good">
            <Icon name="shield" size={12} /> Kết nối qua proxy
          </p>
          <dl className="grid gap-1 m-0">
            <Row name="Loại">{KIND[proxy.kind]}</Row>
            <Row name="Máy chủ">
              {proxy.host}:{proxy.port}
            </Row>
            {proxy.username && <Row name="Tài khoản">{proxy.username}</Row>}
            <Row name="IP ra ngoài">
              {proxy.ip ?? <span className="font-normal text-fg-3">chưa biết (hỏi qua proxy sau khi đăng nhập)</span>}
            </Row>
          </dl>
        </Popover>
      )}
    </span>
  );
}
