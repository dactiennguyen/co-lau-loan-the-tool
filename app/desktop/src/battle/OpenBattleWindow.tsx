import { api } from "@/api";
import { Button } from "@/components/Button";
import { useStore } from "@/store";
import { recalled } from "@/utils/remember";
import { isAndroid } from "@/utils/platform";

/** localStorage keys of the battle window's Luôn trên cùng and Nền xanh (BattleWindow.tsx), shared by every window. */
export const ON_TOP = "battleWindow.onTop";
export const CHROMA = "battleWindow.chroma";

/**
 * "Cửa sổ trận" at the right of the title of Tự đánh and Nhiệm vụ: opens the battle window of the account, or brings it
 * to the front. It works before a battle too: the window waits for one, so OBS can be set up first.
 */
export function OpenBattleWindow({ id, label }: { id: number; label: string }) {
  const toast = useStore((s) => s.toast);
  const open = () =>
    api.openBattleWindow(id, recalled(ON_TOP) === "1", recalled(CHROMA) === "1").catch((e: unknown) =>
      toast({ tone: "warn", title: label, text: `Không mở được cửa sổ trận: ${e instanceof Error ? e.message : String(e)}` }),
    );
  // The Android app has one window only: no Cửa sổ trận for OBS there.
  if (isAndroid()) return null;
  return (
    <Button kind="tonal" small icon="popout" onClick={open} title="Mở cửa sổ nhỏ vẽ trận của nick này, để OBS bắt hình">
      Cửa sổ trận
    </Button>
  );
}
