import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { SETTING_FACT, SETTING_FACT_BAD, SettingRow } from "@/components/SettingRow";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { useStore } from "@/store";
import { GENDER_ICON, GENDER_WORD, misfit } from "@/game/gender";
import type { Account, FightSettings, Item } from "@/api/types";

/** Item id of the Búa Sửa Chữa. */
const HAMMER = 2;

/**
 * Cài đặt tab: what the bot does on its own around the battles it plays (FightSettings of cllt-core), per account. A
 * change is saved to accounts.json and reaches a session at once; it shows as chosen while it saves. Beside Tự sửa đồ,
 * once in the game: the hammers of the bag and the worn items that are broken, with Mua búa when none is left (the bot
 * never buys one itself). Tự nhặt đồ is on unless turned off, and so is Nhặt cả đồ khác giới tính under it: off, gear
 * the character cannot wear stays on the ground. Lưu dữ liệu trận is not here: it is the same for every account, in
 * the Cài đặt of the app (SettingsDialog).
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
    if (saving && saving.repair === saved.repair && saving.pickup === saved.pickup && saving.pickupOtherGender === saved.pickupOtherGender) {
      setSaving(null);
    }
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
  const unwearable = c?.bag?.items.filter((i) => misfit(i, c.gender)).length ?? 0;
  return (
    <Card title="Cài đặt đánh" icon="settings" tone="var(--primary)" subtitle="Bot làm theo khi tự đánh quái và tự làm nhiệm vụ">
      <SettingRow
        id={`${id}repair`}
        on={settings.repair}
        disabled={!!saving}
        onChange={(repair) => save({ ...settings, repair })}
        icon="hammer"
        title="Tự sửa đồ"
        hint="Trước mỗi trận, món đang mặc bị hỏng (độ bền 0) được sửa bằng Búa Sửa Chữa trong túi, mỗi lần 1 búa. Hết búa thì vẫn đánh tiếp, bot không tự mua búa."
      >
        {c && (
          <>
            <span className={SETTING_FACT}>
              <Icon name="hammer" size={12} />
              Búa trong túi <b className="px">{num(hammers)}</b>
            </span>
            <span className={cn(SETTING_FACT, broken.length > 0 && SETTING_FACT_BAD)}>
              <Icon name={broken.length ? "close" : "check"} size={12} />
              {broken.length ? `Đang hỏng: ${broken.map((g) => `${g.name} 0/${g.durability[1]}`).join(", ")}` : "Không có món nào hỏng"}
            </span>
            {hammers === 0 && (
              <Button kind="outline" small icon="cart" onClick={() => open({ kind: "shop", id: account.id, item: HAMMER })}>
                Mua búa
              </Button>
            )}
          </>
        )}
      </SettingRow>
      <SettingRow
        id={`${id}pickup`}
        on={settings.pickup}
        disabled={!!saving}
        onChange={(pickup) => save({ ...settings, pickup })}
        icon="gem"
        title="Tự nhặt đồ"
        hint="Sau mỗi trận thắng, bot nhặt ngay đồ của mình vừa rơi (Xu khóa, đá, trang bị…) từ chỗ đang đứng, không cần đi tới hòm. Không nhặt đồ người khác làm rơi. Đồ nhặt được ghi ở Nhật ký, loại Vật phẩm."
      />
      {/* Part of Tự nhặt đồ: indented under it, and greyed while it is off. */}
      <div className="ml-6">
        <SettingRow
          id={`${id}gender`}
          on={settings.pickupOtherGender}
          disabled={!!saving || !settings.pickup}
          onChange={(pickupOtherGender) => save({ ...settings, pickupOtherGender })}
          icon={c?.gender != null && GENDER_ICON[c.gender] ? GENDER_ICON[1 - c.gender] : "swap"}
          title="Nhặt cả đồ khác giới tính"
          hint="Nhiều trang bị có hai bản cùng tên, một cho nhân vật nam, một cho nữ; đồ rơi có thể là bản kia, nhân vật không mặc được (game báo Trang bị không phù hợp). Bật: vẫn nhặt để bán ở Chợ trời. Tắt: bỏ lại dưới đất, Nhật ký ghi Bỏ qua. Vũ khí, nhẫn và đồ không phải trang bị luôn được nhặt."
        >
          {c?.gender != null && GENDER_WORD[c.gender] && (
            <span className={SETTING_FACT}>
              <Icon name={GENDER_ICON[c.gender]} size={12} />
              Nhân vật {GENDER_WORD[c.gender]}
              {unwearable > 0 && (
                <>
                  {" "}
                  · trong túi <b className="px">{num(unwearable)}</b> món không mặc được
                </>
              )}
            </span>
          )}
        </SettingRow>
      </div>
      {error && (
        <p className="text-[11.5px] text-danger select-text" role="alert">
          Chưa lưu được: {error}
        </p>
      )}
    </Card>
  );
}
