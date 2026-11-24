// QR nick (QrAccountsDialog): the accounts and their settings in one QR, read by another copy of the app without the
// network. What Xuất JSON gives (backup.rs: every account with its password, proxy, Cài đặt đánh, Số trận, Thua tối đa,
// the target of each map, the plan of points; the Cài đặt of the app when ticked) plus the open tab of each account,
// written without spaces, deflated (fflate) and written in base45 (RFC 9285), whose 45 characters are those of the
// alphanumeric mode of QR: 5.5 bits a character, and every scanner gives the text back as it is (bytes of the byte mode
// may not survive one that reads them as text). The deflate starts from QR_DICT, the shape of an export with the names
// of every setting, so what each account repeats costs almost nothing: the 15 accounts of 24/11 took 2,051 characters
// (2,814 without it) of the 4,296 a QR holds (version 40, level L), about 95 more for each account, so 35–38 fit.
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

/** The start of the text of a QR nick: the app and the version of the format. */
export const QR_PREFIX = "CLLT1:";
/** The characters a QR holds in the alphanumeric mode (version 40, error correction L). */
export const QR_MAX = 4296;

const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** The preset dictionary of the deflate of a QR nick: an export of two accounts with the settings of 24/11 and nothing of
 * anyone's (no username, password or proxy). A QR is read only with the very same bytes: never change it for CLLT1;
 * another one needs another QR_PREFIX (CLLT2:), this one kept to read the QRs made before. */
const QR_DICT = strToU8(
  "{\"app\":\"Co Lau Tool\",\"format\":1,\"exportedAt\":\"2026-11-24T00:00:00+07:00\",\"accounts\":[{\"label\":\"\",\"username\":\"\",\"password\":\"\",\"serverId\":24,\"stats\":\"auto\",\"fight\":{\"repair\":true,\"pickup\":true,\"pickupOtherGender\":false,\"pickupOthers\":true,\"pickupOwnElement\":true,\"pickupCommon\":false,\"pickupRare\":true,\"pickupPrecious\":true,\"pickupEpic\":true,\"hpPotion\":true,\"hpPotionMax\":1,\"hpPotionKeep\":20,\"mpPotion\":false,\"mpPotionMax\":2,\"mpPotionKeep\":30,\"autoMerge\":true,\"mergeUpTo\":12,\"mergeEvery\":5,\"mobDelay\":false,\"mobDelaySecs\":1,\"turnDelay\":false,\"turnDelaySecs\":1,\"stepDelay\":false,\"stepDelaySecs\":1,\"restBreak\":false,\"breakEvery\":100,\"breakMinutes\":2,\"delayRandom\":true,\"humanPace\":false,\"wander\":false,\"waitsSet\":true,\"fightCount\":2000,\"fightLosses\":1000,\"questLosses\":100,\"autoSkills\":true,\"autoWelfare\":true,\"quietZone\":true,\"quietZoneFrom\":10,\"quietZoneTo\":12},\"fightTargets\":{\"M1\":\"\",\"M12\":\"\"},\"proxy\":null},{\"label\":\"\",\"username\":\"\",\"password\":\"\",\"serverId\":24,\"stats\":\"auto\",\"fight\":{\"repair\":true,\"pickup\":true,\"pickupOtherGender\":false,\"pickupOthers\":true,\"pickupOwnElement\":true,\"pickupCommon\":false,\"pickupRare\":true,\"pickupPrecious\":true,\"pickupEpic\":true,\"hpPotion\":true,\"hpPotionMax\":1,\"hpPotionKeep\":20,\"mpPotion\":false,\"mpPotionMax\":2,\"mpPotionKeep\":30,\"autoMerge\":true,\"mergeUpTo\":12,\"mergeEvery\":5,\"mobDelay\":false,\"mobDelaySecs\":1,\"turnDelay\":false,\"turnDelaySecs\":1,\"stepDelay\":false,\"stepDelaySecs\":1,\"restBreak\":false,\"breakEvery\":100,\"breakMinutes\":2,\"delayRandom\":true,\"humanPace\":false,\"wander\":false,\"waitsSet\":true,\"fightCount\":2000,\"fightLosses\":1000,\"questLosses\":100,\"autoSkills\":true,\"autoWelfare\":true,\"quietZone\":true,\"quietZoneFrom\":10,\"quietZoneTo\":12},\"fightTargets\":{\"M1\":\"\",\"M12\":\"\"},\"proxy\":null}],\"settings\":{\"server\":{\"host\":\"play.colauloanthe.vn\",\"port\":1688},\"record\":true,\"onClose\":\"tray\",\"notifyDone\":true,\"notifyLost\":true},\"tabs\":{\"@24\":\"fight\",\"@24\":\"quest\"}}",
);

/** RFC 9285: each two bytes as three characters (n = 256a + b = c + 45d + 2025e), a last single byte as two. */
export function base45(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i] * 256 + bytes[i + 1];
    out += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
  }
  if (bytes.length % 2) {
    const n = bytes[bytes.length - 1];
    out += B45[n % 45] + B45[Math.floor(n / 45)];
  }
  return out;
}

/** The bytes of a base45 text; an error for a character outside the set or a group that does not fit. */
export function unbase45(text: string): Uint8Array {
  const v = [...text].map((ch) => {
    const n = B45.indexOf(ch);
    if (n < 0) throw new Error(`Ký tự lạ trong QR: "${ch}"`);
    return n;
  });
  if (v.length % 3 === 1) throw new Error("QR bị cắt mất một phần");
  const out: number[] = [];
  for (let i = 0; i < v.length; i += 3) {
    if (i + 2 < v.length) {
      const n = v[i] + v[i + 1] * 45 + v[i + 2] * 2025;
      if (n > 0xffff) throw new Error("QR không hợp lệ");
      out.push(n >> 8, n & 0xff);
    } else {
      const n = v[i] + v[i + 1] * 45;
      if (n > 0xff) throw new Error("QR không hợp lệ");
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}

/** The open tab of an account in a QR, keyed by its login (the ids of the list differ from one copy of the app to another). */
export const tabOwner = (username: string, serverId: number) => `${username}@${serverId}`;
/** Where a QR nick scanned leaves the tab of each account (localStorage, + tabOwner), until its page first opens
 * (AccountPage takes it as the account's own). */
export const QR_TAB = "tab.qr.";

/** What a QR nick carries: the JSON of Xuất JSON, and the open tab of each account by tabOwner. */
export interface QrContent {
  json: string;
  tabs: Record<string, string>;
}

/** The text of the QR of `json` (Xuất JSON) and `tabs`. */
export function encodeQr({ json, tabs }: QrContent): string {
  const backup = JSON.parse(json) as Record<string, unknown>;
  const text = JSON.stringify(Object.keys(tabs).length ? { ...backup, tabs } : backup);
  return QR_PREFIX + base45(deflateSync(strToU8(text), { level: 9, dictionary: QR_DICT }));
}

/** The JSON (for Nhập) and the tabs of the text a QR gave; an error that says why it is not a QR nick. */
export function decodeQr(text: string): QrContent {
  const t = text.trim();
  if (!t.startsWith(QR_PREFIX)) throw new Error("Đây không phải QR nick của Co Lau Tool");
  let backup: Record<string, unknown>;
  try {
    backup = JSON.parse(strFromU8(inflateSync(unbase45(t.slice(QR_PREFIX.length)), { dictionary: QR_DICT })));
  } catch (e) {
    throw new Error(`Không đọc được QR: ${e instanceof Error ? e.message : String(e)}`);
  }
  const { tabs, ...rest } = backup;
  const kept = tabs && typeof tabs === "object" ? Object.fromEntries(Object.entries(tabs).filter(([, v]) => typeof v === "string")) : {};
  return { json: JSON.stringify(rest), tabs: kept as Record<string, string> };
}
