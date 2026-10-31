import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Hint } from "../components/Hint";
import { Icon } from "../components/Icon";
import { num } from "../format";
import { useStore } from "../store";
import type { Account, FightSettings, Item } from "../types";
import "./FightSettingsCard.css";

/** Item id of the Búa Sửa Chữa. */
const HAMMER = 2;

/**
 * Cài đặt tab: what the bot does on its own between the battles of Tự đánh and Tự làm nhiệm vụ (FightSettings of
 * cllt-core). A change is saved to accounts.json and reaches a session at once; it shows as chosen while it saves.
 * What a setting does is behind its "?". Beside Tự sửa đồ, once in the game: the hammers of the bag and the worn items
 * that are broken, with Mua búa when none is left (the bot never buys one itself).
 */
export function FightSettingsCard({ account }: { account: Account }) {
  const c = account.character;
  const saved = account.fightSettings;
  const open = useStore((s) => s.open);
  const id = useId();
  const [saving, setSaving] = useState<FightSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept until the account comes back with it, so the box does not flick back between the answer and the update.
  useEffect(() => {
    if (saving && saving.repair === saved.repair) setSaving(null);
  }, [saving, saved]);
  const settings = saving ?? saved;
  const save = (next: FightSettings) => {
    setSaving(next);
    setError(null);
    api.setFight(account.id, next).catch((err) => {
      setSaving(null);
      setError(String(err?.message ?? err));
    });
  };
  const hammers = c?.bag?.items.filter((i) => i.id === HAMMER).reduce((n, i) => n + Math.max(1, i.quantity), 0) ?? 0;
  const broken = (c?.gear ?? []).filter((g): g is Item & { durability: [number, number] } => g?.durability?.[0] === 0);
  return (
    <Card title="Cài đặt đánh" icon="settings" tone="var(--primary)" subtitle="Bot làm theo khi tự đánh quái và tự làm nhiệm vụ" className="settings">
      <div className={`setting${settings.repair ? " setting--on" : ""}`}>
        {/* The box, its name and the space up to Bật/Tắt toggle it; the "?" between them only explains. */}
        <div className="setting__row">
          <input
            id={`${id}repair`}
            type="checkbox"
            checked={settings.repair}
            disabled={!!saving}
            aria-describedby={`${id}repair-hint`}
            onChange={(e) => save({ ...settings, repair: e.target.checked })}
          />
          <label htmlFor={`${id}repair`} className="setting__pick">
            <span className="setting__box" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
            <span className="setting__icon" aria-hidden="true">
              <Icon name="hammer" size={14} />
            </span>
            <span className="setting__title">Tự sửa đồ</span>
          </label>
          <Hint label="Tự sửa đồ là gì?" id={`${id}repair-hint`}>
            Trước mỗi trận, món đang mặc bị hỏng (độ bền 0) được sửa bằng Búa Sửa Chữa trong túi, mỗi lần 1 búa. Hết búa thì
            vẫn đánh tiếp, bot không tự mua búa.
          </Hint>
          {c && (
            <span className="setting__facts">
              <span className="setting__fact">
                <Icon name="hammer" size={12} />
                Búa trong túi <b className="px">{num(hammers)}</b>
              </span>
              <span className={`setting__fact${broken.length ? " setting__fact--bad" : ""}`}>
                <Icon name={broken.length ? "close" : "check"} size={12} />
                {broken.length
                  ? `Đang hỏng: ${broken.map((g) => `${g.name} 0/${g.durability[1]}`).join(", ")}`
                  : "Không có món nào hỏng"}
              </span>
              {hammers === 0 && (
                <Button kind="outline" small icon="cart" onClick={() => open({ kind: "shop", id: account.id, item: HAMMER })}>
                  Mua búa
                </Button>
              )}
            </span>
          )}
          <label htmlFor={`${id}repair`} className="setting__state" aria-hidden="true">
            {settings.repair ? "Bật" : "Tắt"}
          </label>
        </div>
      </div>
      {error && (
        <p className="settings__error selectable" role="alert">
          Chưa lưu được: {error}
        </p>
      )}
    </Card>
  );
}
