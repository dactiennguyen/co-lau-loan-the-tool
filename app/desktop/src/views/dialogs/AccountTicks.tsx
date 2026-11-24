import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { useStore } from "@/store";

/**
 * The accounts of the list with a tick each, and Chọn hết / Bỏ chọn hết (Xuất JSON, QR nick). `unticked` are the ids left
 * out, so an account added while the dialog is open is ticked.
 */
export function AccountTicks({ unticked, onChange, what }: { unticked: number[]; onChange: (unticked: number[]) => void; what: string }) {
  const order = useStore((s) => s.order);
  const byId = useStore((s) => s.byId);
  const count = order.filter((id) => !unticked.includes(id)).length;
  const all = count === order.length;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-11 font-bold text-fg-2">
          Nick ({count}/{order.length})
        </span>
        {order.length > 0 && (
          <Button kind="ghost" small onClick={() => onChange(all ? order : [])}>
            {all ? "Bỏ chọn hết" : "Chọn hết"}
          </Button>
        )}
      </div>
      <div className="grid gap-1 max-h-[220px] px-2.5 py-2 bg-ink scroll">
        {order.length === 0 && <p className="m-0 text-12 text-fg-3">Chưa có nick nào để {what}.</p>}
        {order.map((id) => {
          const a = byId[id];
          return (
            <CheckRow key={id} checked={!unticked.includes(id)} onChange={(on) => onChange(on ? unticked.filter((x) => x !== id) : [...unticked, id])} className="min-w-0">
              <b className="text-fg truncate">{a?.label}</b>
              {a && a.label !== a.username && <span className="text-fg-3 truncate">{a.username}</span>}
            </CheckRow>
          );
        })}
      </div>
    </div>
  );
}
