// What the web UI can ask for (window.__TAURI__.core.invoke). Accounts are named by their stable id. The commands only
// change the App; the flusher of app.rs tells the UI. Adding and removing an account write accounts.json, so they are
// async: Tauri runs them off the main thread, and the file is written outside the App lock.
use crate::app::Shared;
use crate::backup;
use crate::license::{self, LicenseView, Licenses};
use crate::settings::{self, Exported, ExportedFaults, OnClose, Settings, SettingsView};
use crate::store::{BattleFilter, BattleStats, FaultList, StoredBattle};
use crate::update::{self, UpdateView};
use crate::view::{LogLine, LogTone};
use cllt_core::accounts::Account;
use cllt_core::bot::{
    BachHoPace, BattleSource, DailyAction, FightSettings, ItemAct, LogKind, MailDraft, MailTask,
    MarketTask, SmithTask, BREAK_EVERY_MAX, BREAK_MINUTES_MAX, MERGE_EVERY_MAX, MOB_DELAY_MAX,
    POTION_MAX, STEP_DELAY_MAX,
};
use cllt_core::net::Command;
use cllt_core::npc::{MergeForecast, MergeOptions};
use cllt_core::potentials::StatPlan;
use cllt_core::proxy::{Proxy, ProxyKind};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager as _, State};

#[tauri::command]
pub fn state(shared: State<Shared>) -> Value {
    shared.with(|app| {
        json!({
            "rev": app.rev(),
            "accounts": app.views(),
            "accountsError": app.load_error,
        })
    })
}

#[tauri::command]
pub fn logs(shared: State<Shared>, id: u64) -> Vec<LogLine> {
    shared.with(|app| app.logs(id))
}

#[tauri::command]
pub fn login(shared: State<Shared>, licenses: State<Licenses>, id: u64) {
    if licenses.valid() {
        shared.with(|app| app.login(id));
    }
}

#[tauri::command]
pub fn logout(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Logout));
}

#[tauri::command]
pub fn login_all(shared: State<Shared>, licenses: State<Licenses>) {
    if licenses.valid() {
        shared.with(|app| app.login_all());
    }
}

#[tauri::command]
pub fn logout_all(shared: State<Shared>) {
    shared.with(|app| app.send_all(Command::Logout));
}

#[tauri::command]
pub fn fight(shared: State<Shared>, id: u64, target: String, count: u32, max_losses: u32) {
    shared.with(|app| {
        if target.is_empty() {
            return app.log(id, LogKind::Battle, "Chọn một quái hoặc boss trước");
        }
        let command = Command::Fight {
            target,
            count: count.max(1),
            max_losses: max_losses.max(1),
        };
        app.send(id, command);
    });
}

/// "Tự làm nhiệm vụ": plays the steps of the current main quest it knows until Stop, a step it does not know, or
/// `max_losses` lost battles. With `step` = [quest id, step index] (▶ on a step), only that step, which must be the
/// current one of that quest.
#[tauri::command]
pub fn quest(shared: State<Shared>, id: u64, max_losses: u32, step: Option<(i32, i32)>) {
    shared.with(|app| {
        let command = Command::Quest {
            max_losses: max_losses.max(1),
            step,
        };
        app.send(id, command);
    });
}

/// Dừng: ends the job or quest run; with `surrender` ("Đầu hàng") a battle in progress is left too, else played out.
#[tauri::command]
pub fn stop(shared: State<Shared>, id: u64, surrender: bool) {
    shared.with(|app| app.send(id, Command::Stop { surrender }));
}

/// How the account spends potential points on its own: null for not at all, "auto" (the main stat of its element) or
/// {"weights": [Cường lực, Nội lực, Thân pháp, Thể lực]}. Saved to accounts.json; the error is shown in a toast.
#[tauri::command]
pub async fn set_stats(
    shared: State<'_, Shared>,
    id: u64,
    plan: Option<StatPlan>,
) -> Result<(), String> {
    shared.set_stats(id, plan).await
}

/// "Lượt thua còn lại" of the fight job or quest run going on: it ends after that many more losses
/// (Bot::set_losses_left).
#[tauri::command]
pub fn set_losses_left(shared: State<Shared>, id: u64, left: u32) {
    shared.with(|app| app.send(id, Command::LossesLeft(left.max(1))));
}

/// Cài đặt đánh of the account: Tự sửa đồ, Tự nhặt đồ, and the numbers last chosen in the Đánh quái and Nhiệm vụ tabs,
/// kept within what fight and quest take. Saved to accounts.json; the error is shown in a toast.
/// `settings` holds only the fields the tab changed (Shared::set_fight).
#[tauri::command]
pub async fn set_fight(
    shared: State<'_, Shared>,
    id: u64,
    settings: serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    shared.set_fight(id, settings, bounded_fight).await
}

/// Cài đặt đánh within what fight and quest take.
fn bounded_fight(mut settings: FightSettings) -> FightSettings {
    settings.fight_count = settings.fight_count.max(1);
    settings.fight_losses = settings.fight_losses.max(1);
    settings.quest_losses = settings.quest_losses.max(1);
    settings.hp_potion_max = settings.hp_potion_max.clamp(1, POTION_MAX);
    settings.mp_potion_max = settings.mp_potion_max.clamp(1, POTION_MAX);
    settings.merge_up_to = settings.merge_up_to.clamp(2, 12);
    settings.merge_every = settings.merge_every.clamp(1, MERGE_EVERY_MAX);
    settings.mob_delay_secs = settings.mob_delay_secs.clamp(1, MOB_DELAY_MAX);
    settings.turn_delay_secs = settings.turn_delay_seconds();
    settings.step_delay_secs = settings.step_delay_secs.clamp(1, STEP_DELAY_MAX);
    settings.break_every = settings.break_every.clamp(1, BREAK_EVERY_MAX);
    settings.break_minutes = settings.break_minutes.clamp(1, BREAK_MINUTES_MAX);
    settings
}

/// The target the Đánh quái tab chose on a map, chosen again back on that map. Saved to accounts.json.
#[tauri::command]
pub async fn set_fight_target(
    shared: State<'_, Shared>,
    id: u64,
    map_id: String,
    target: String,
) -> Result<(), String> {
    if map_id.is_empty() || target.is_empty() {
        return Err("Không có map hay quái để nhớ".into());
    }
    shared.set_fight_target(id, map_id, target).await
}

/// "Cộng +1" on one potential, by c2s/10 index: 0 Cường lực, 1 Nội lực, 2 Thân pháp, 3 Thể lực.
#[tauri::command]
pub fn add_stat(shared: State<Shared>, id: u64, stat: usize) {
    shared.with(|app| app.send(id, Command::AddStat(stat)));
}

/// Xóa nhiều of the Túi đồ tab: throw away these bag items, each a bag slot and the uuid the window showed. The bot keeps
/// only gear and items still in their slot, and throws them one after the other (Bot::discard_many).
#[tauri::command]
pub fn discard_many(shared: State<Shared>, id: u64, items: Vec<(u8, String)>) {
    shared.with(|app| app.send(id, Command::DiscardMany(items)));
}

/// Đập hết of the Túi đồ tab: every Trứng Gà of this bag slot, the uuid the window showed, one after the other; Dừng
/// ends it (Bot::break_all).
#[tauri::command]
pub fn break_all(shared: State<Shared>, id: u64, slot: u8, uuid: String) {
    shared.with(|app| app.send(id, Command::BreakAll(slot, uuid)));
}

/// Bảng xếp hạng: read tab `tab` (0 Cao thủ, 1 Sứ quân, 2 12 châu, 3 Cường hoá, 4 Hỏa, 5 Lôi, 6 Thủy) for this account
/// (Bot::ranking); the answer comes in the account's `ranking`.
#[tauri::command]
pub fn ranking(shared: State<Shared>, id: u64, tab: u8) {
    shared.with(|app| app.send(id, Command::Ranking(tab.min(6))));
}

/// Nhận ngay of the Phúc lợi window: Điểm danh, Quà online and Quà thăng cấp now, Tự điểm danh và nhận quà on or not
/// (Bot::welfare).
#[tauri::command]
pub fn welfare(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Welfare));
}

/// Bắt đầu of the Bạch Hổ window: each account picked tries to get into the boss's battle from `from_ms` until
/// `until_ms` (ms since 1970), waiting until then (Bot::bach_ho), with the window's waits in ms: between swaps
/// (`move_ms`) and between a battle and the next try (`rejoin_ms`).
#[tauri::command]
pub fn bach_ho_start(
    shared: State<Shared>,
    ids: Vec<u64>,
    from_ms: u64,
    until_ms: u64,
    move_ms: u32,
    rejoin_ms: u32,
) {
    let pace = BachHoPace { move_ms, rejoin_ms };
    shared.with(|app| {
        for id in ids {
            app.send(
                id,
                Command::BachHo {
                    from_ms,
                    until_ms,
                    pace,
                },
            );
        }
    });
}

/// Dừng of the Bạch Hổ window, for these accounts (Bot::bach_ho_stop).
#[tauri::command]
pub fn bach_ho_stop(shared: State<Shared>, ids: Vec<u64>) {
    shared.with(|app| {
        for id in ids {
            app.send(id, Command::BachHoStop);
        }
    });
}

/// Quay về chỗ cũ: back where Bạch Hổ took the account from (Bot::go_back).
#[tauri::command]
pub fn go_back(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::GoBack));
}

/// Nâng cấp on one skill of the Kỹ năng tab: one level, c2s/1191 (id, 1).
#[tauri::command]
pub fn upgrade_skill(shared: State<Shared>, id: u64, skill: i32) {
    shared.with(|app| app.send(id, Command::UpgradeSkill(skill)));
}

/// A button of the item detail in the Túi đồ tab: "equip" the item of a bag slot, "unequip" the one of a gear slot,
/// "use" a bag slot, "repair" a gear slot, "discard" (Vứt bỏ) a bag slot; "sort" is Sắp xếp of the bag, `slot` unused.
/// `uuid` is the item the window showed: the bot does nothing when the slot holds another by now (Bot::item_of).
#[tauri::command]
pub fn item_action(
    shared: State<Shared>,
    id: u64,
    action: String,
    slot: u8,
    uuid: Option<String>,
) -> Result<(), String> {
    let act = match action.as_str() {
        "equip" => ItemAct::Equip(slot),
        "unequip" => ItemAct::Unequip(slot),
        "use" => ItemAct::Use(slot),
        "repair" => ItemAct::Repair(slot),
        "discard" => ItemAct::Discard(slot),
        "sort" => ItemAct::Sort,
        other => return Err(format!("Không biết thao tác {other}")),
    };
    let command = match uuid {
        Some(uuid) => Command::ItemOf(act, uuid),
        None => Command::Item(act),
    };
    shared.with(|app| app.send(id, command));
    Ok(())
}

/// Đổi khu / map: asks the zones of the map and their players again (c2s/1172).
#[tauri::command]
pub fn list_zones(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::ListZones));
}

/// Đổi khu / map: another zone of the map (c2s/1173, Bot::change_zone).
#[tauri::command]
pub fn change_zone(shared: State<Shared>, id: u64, zone: i32) {
    shared.with(|app| app.send(id, Command::ChangeZone(zone)));
}

/// Đổi khu / map: another map, through the portals of the atlas (Bot::go_to).
#[tauri::command]
pub fn go_to_map(shared: State<Shared>, id: u64, map_id: String) {
    shared.with(|app| app.send(id, Command::GoTo(map_id)));
}

/// Cửa hàng: "Đi tới Làng Thanh Khê"; with `back` ("Mua xong quay về chỗ cũ") the bot walks back to where it started
/// once the dialog closes (Bot::go_to_shop).
#[tauri::command]
pub fn shop_trip(shared: State<Shared>, id: u64, back: bool) {
    shared.with(|app| app.send(id, Command::ShopTrip { back }));
}

/// Cửa hàng: the dialog closed, however; after a trip with "Mua xong quay về chỗ cũ" the bot walks back
/// (Bot::shop_closed).
#[tauri::command]
pub fn shop_closed(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::ShopClosed));
}

/// Cửa hàng: opens the Dược phẩm shop of Lái Buôn (on M1); the account's `shop` then lists it.
#[tauri::command]
pub fn open_shop(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::OpenShop));
}

/// Tiện ích, Mua: opens shop `kind` of npc::SHOPS (on M1); the account's `shop` then lists it.
#[tauri::command]
pub fn open_shop_kind(shared: State<Shared>, id: u64, kind: u8) {
    shared.with(|app| app.send(id, Command::OpenShopKind(kind)));
}

/// Gộp đá: sets of 4 stones of a level at 100%, up to Đá cấp `upTo` (unlocked stones too with `unlocked`); or, from the
/// Gộp button of a row, only `level` and `locked`, at most `sets` merges (npc::MergeOptions).
#[tauri::command]
pub fn smith_merge(shared: State<Shared>, id: u64, options: MergeOptions) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Merge(options))));
}

/// Luyện tự chọn: the stones picked (a bag slot per stone, a stack's slot once per stone of it), of any levels, in Luyện
/// đá with one press at the odds npc::fuse_quote says, above 40% only (SmithTask::Fuse).
#[tauri::command]
pub fn smith_fuse(shared: State<Shared>, id: u64, stones: Vec<i32>) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Fuse { stones })));
}

/// What Gộp đá would do with these options on the bag as it is now; None without a bag.
#[tauri::command]
pub fn merge_forecast(
    shared: State<Shared>,
    id: u64,
    options: MergeOptions,
) -> Option<MergeForecast> {
    shared.with(|app| app.merge_forecast(id, options))
}

/// Nâng cấp the item of bag slot `slot` (gear slot with `worn`: taken off first, worn again after) up to +`to_level` with
/// stones up to `rate` % each level ([Cẩn thận] with `careful`); `quote` only asks the price and odds of the next level.
/// `charm` (default true): Bùa bảo vệ on every press a failure would lose levels on. `stones` (Tự chọn đá): the bag slot of
/// each stone the player picked, a stack's slot once per stone; exactly those go in and one level is tried at most.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn smith_upgrade(
    shared: State<Shared>,
    id: u64,
    slot: u8,
    careful: bool,
    rate: i32,
    to_level: i32,
    unlocked: bool,
    quote: bool,
    worn: Option<bool>,
    charm: Option<bool>,
    stones: Option<Vec<i32>>,
) {
    let task = SmithTask::Upgrade {
        slot,
        careful,
        rate,
        to_level,
        unlocked,
        quote,
        worn: worn.unwrap_or(false),
        charm: charm.unwrap_or(true),
        stones: stones.unwrap_or_default(),
    };
    shared.with(|app| app.send(id, Command::Smith(task)));
}

/// Chế tạo trang bị: read the recipes of item kind `kind` (0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn), or with `tier` make `times`
/// items of that tier (1 when left out).
#[tauri::command]
pub fn smith_craft(
    shared: State<Shared>,
    id: u64,
    kind: u8,
    tier: Option<i32>,
    times: Option<u32>,
) {
    let task = match tier {
        Some(tier) => SmithTask::Craft {
            kind,
            tier,
            times: times.unwrap_or(1),
        },
        None => SmithTask::Recipes { kind },
    };
    shared.with(|app| app.send(id, Command::Smith(task)));
}

/// Đổi Băng Tâm lấy bình rỗng: line `option` of its menu (0 one bottle, 1 five, 2 all).
#[tauri::command]
pub fn smith_ice(shared: State<Shared>, id: u64, option: u8) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Ice { option })));
}

/// Điểm năng động of Hương Lão, reading only; Cách tính điểm too with `rules`.
#[tauri::command]
pub fn elder_points(shared: State<Shared>, id: u64, rules: bool) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Points { rules })));
}

/// Nhiệm vụ hàng ngày of Hương Lão: "show" reads how many were taken today; "accept", "cancel" or "complete" picks Nhận,
/// Hủy or Hoàn thành once the menu and the quest held allow it.
#[tauri::command]
pub fn elder_daily(shared: State<Shared>, id: u64, action: String) -> Result<(), String> {
    let action = match action.as_str() {
        "show" => DailyAction::Show,
        "accept" => DailyAction::Accept,
        "cancel" => DailyAction::Cancel,
        "complete" => DailyAction::Complete,
        other => return Err(format!("không có việc nhiệm vụ ngày \"{other}\"")),
    };
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Daily { action })));
    Ok(())
}

/// Tách đá of the item of bag slot `slot`.
#[tauri::command]
pub fn smith_separate(shared: State<Shared>, id: u64, slot: u8) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Separate { slot })));
}

/// Chuyển hoá from bag slot `source` to bag slot `target`.
#[tauri::command]
pub fn smith_transmute(shared: State<Shared>, id: u64, source: u8, target: u8) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Transmute { source, target })));
}

/// The bag slots Chuyển hoá may move the level of bag slot `source` to.
#[tauri::command]
pub fn transmute_targets(shared: State<Shared>, id: u64, source: u8) -> Vec<i32> {
    shared.with(|app| app.transmute_targets(id, source))
}

/// Đổi lượng: `times` × 50 Lượng for 50.000 Xu (option 0) or 55.000 Xu khóa (option 1).
#[tauri::command]
pub fn exchange_luong(shared: State<Shared>, id: u64, option: u8, times: u32) {
    shared.with(|app| app.send(id, Command::Smith(SmithTask::Exchange { option, times })));
}

/// Mã quà tặng: the codes as typed, sent one by one from wherever the character stands (Bot::redeem); the log and
/// `character.gift` tell how each went.
#[tauri::command]
pub fn redeem_codes(shared: State<Shared>, id: u64, codes: Vec<String>) {
    shared.with(|app| app.send(id, Command::Gift(codes)));
}

/// Mã quà tặng, Đếm lại từ 0: forgets the codes refused in a row of the account (Bot::gift_reset).
#[tauri::command]
pub fn reset_gift_count(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::GiftReset));
}

/// Hòm thư, from wherever the character stands (Bot::mail); `character.mailbox` and the log tell how it went. The list.
#[tauri::command]
pub fn mail_list(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::List)));
}

/// Hòm thư: what mail `mail` says and holds; the server marks it read.
#[tauri::command]
pub fn mail_open(shared: State<Shared>, id: u64, mail: i64) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::Open(mail))));
}

/// Hòm thư, Nhận: the gift of mail `mail`, once the bag has the room for it.
#[tauri::command]
pub fn mail_claim(shared: State<Shared>, id: u64, mail: i64) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::Claim(mail))));
}

/// Hòm thư, Nhận hết: every gift that fits.
#[tauri::command]
pub fn mail_claim_all(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::ClaimAll)));
}

/// Hòm thư, Xóa: these mails one by one, only those whose gift is taken or that had none. There is no Xóa hết.
#[tauri::command]
pub fn mail_delete(shared: State<Shared>, id: u64, mails: Vec<i64>) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::Delete(mails))));
}

/// Hòm thư, Gửi thư: a mail to a character with up to 6 items of the bag (slot, how many); 1.000 Xu. The UI asks first.
#[tauri::command]
pub fn mail_send(shared: State<Shared>, id: u64, draft: MailDraft) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::Send(draft))));
}

/// Hòm thư, Thư đã gửi: the mails sent.
#[tauri::command]
pub fn mail_sent(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Mail(MailTask::Sent)));
}

/// Chợ trời, from wherever the character stands (Bot::market); `character.market` and the log tell how it went. Opens
/// the window (c2s/116) on page `page` of tab `tab` (-1 for Đang bán).
#[tauri::command]
pub fn market_open(shared: State<Shared>, id: u64, tab: i32, page: i32) {
    shared.with(|app| app.send(id, Command::Market(MarketTask::Open { tab, page })));
}

/// Chợ trời: page `page` of tab `tab` (-1 for Đang bán); also Làm mới.
#[tauri::command]
pub fn market_page(shared: State<Shared>, id: u64, tab: i32, page: i32) {
    shared.with(|app| app.send(id, Command::Market(MarketTask::Page { tab, page })));
}

/// Chợ trời, Mua: the listing `uuid` of the page shown, at `price` Xu as shown.
#[tauri::command]
pub fn market_buy(shared: State<Shared>, id: u64, uuid: String, price: i32) {
    shared.with(|app| app.send(id, Command::Market(MarketTask::Buy { uuid, price })));
}

/// Chợ trời, Đăng bán: `quantity` of the item of bag slot `slot` at `price` Xu for them all (the fee of s2c/116 is
/// taken); `uuid`, the item the window showed, refused when the slot holds another by now.
#[tauri::command]
pub fn market_sell(
    shared: State<Shared>,
    id: u64,
    slot: u8,
    quantity: i32,
    price: i64,
    uuid: Option<String>,
) {
    let task = MarketTask::Sell {
        slot,
        quantity,
        price,
        uuid,
    };
    shared.with(|app| app.send(id, Command::Market(task)));
}

/// Chợ trời, Gợi ý giá: the pages of the tabs item `item_id` is listed in, for the cheapest and dearest of one on sale.
#[tauri::command]
pub fn market_prices(shared: State<Shared>, id: u64, item_id: i32) {
    shared.with(|app| app.send(id, Command::Market(MarketTask::Prices { item_id })));
}

/// Chợ trời, Thu hồi: the listing `uuid` of Đang bán back to the bag.
#[tauri::command]
pub fn market_withdraw(shared: State<Shared>, id: u64, uuid: String) {
    shared.with(|app| app.send(id, Command::Market(MarketTask::Withdraw(uuid))));
}

/// Chợ trời, Gia hạn: 24 more hours on the listing `uuid` of Đang bán, for the fee.
#[tauri::command]
pub fn market_extend(shared: State<Shared>, id: u64, uuid: String) {
    shared.with(|app| app.send(id, Command::Market(MarketTask::Extend(uuid))));
}

/// Mua: `quantity` of the shop line `shop_id`; the log tells how it went.
#[tauri::command]
pub fn buy(shared: State<Shared>, id: u64, shop_id: i32, quantity: i32) {
    shared.with(|app| app.send(id, Command::Buy { shop_id, quantity }));
}

/// Older lines of the Nhật ký from cllt.db, oldest first as the card lists them: before row `before` (the oldest line
/// the card has), of `kinds` (all when empty), only the red ones with `bad`. None without the database.
/// The reads of cllt.db below run off the main thread: a long one would freeze the window.
#[tauri::command]
pub async fn log_history(
    shared: State<'_, Shared>,
    id: u64,
    before: Option<i64>,
    kinds: Vec<LogKind>,
    bad: bool,
    limit: u32,
) -> Result<Vec<LogLine>, String> {
    let (Some(store), Some(user)) = (shared.store_handle(), shared.with(|app| app.username(id)))
    else {
        return Ok(vec![]);
    };
    let tone = bad.then_some(LogTone::Bad as u8);
    tauri::async_runtime::spawn_blocking(move || {
        let mut lines: Vec<LogLine> = store
            .logs(&user, before, &kinds, tone, limit.clamp(1, 500))
            .map_err(|e| e.to_string())?
            .iter()
            .map(LogLine::stored)
            .collect();
        lines.reverse();
        Ok(lines)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Thống kê: the battles of the account ended since `since` (ms since 1970, all when None), of one source or all;
/// None without the database.
#[tauri::command]
pub async fn battle_stats(
    shared: State<'_, Shared>,
    id: u64,
    since: Option<u64>,
    source: Option<BattleSource>,
) -> Result<Option<BattleStats>, String> {
    let (Some(store), Some(user)) = (shared.store_handle(), shared.with(|app| app.username(id)))
    else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || {
        let filter = BattleFilter {
            username: &user,
            since,
            source,
        };
        store.stats(filter).map(Some).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Thống kê: the battles themselves, newest first, before row `before`.
#[tauri::command]
pub async fn battle_history(
    shared: State<'_, Shared>,
    id: u64,
    since: Option<u64>,
    source: Option<BattleSource>,
    before: Option<i64>,
    limit: u32,
) -> Result<Vec<StoredBattle>, String> {
    let (Some(store), Some(user)) = (shared.store_handle(), shared.with(|app| app.username(id)))
    else {
        return Ok(vec![]);
    };
    tauri::async_runtime::spawn_blocking(move || {
        let filter = BattleFilter {
            username: &user,
            since,
            source,
        };
        store
            .battles(filter, before, limit.clamp(1, 200))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Key: the key kept (its middle hidden) and where it stands.
#[tauri::command]
pub fn license_status(app: AppHandle) -> LicenseView {
    license::view(&app)
}

/// Kích hoạt of the key screen: the server checks the key with this device; its no is the error shown.
#[tauri::command]
pub async fn activate_license(app: AppHandle, key: String) -> Result<LicenseView, String> {
    license::activate(&app, key).await
}

/// Thử lại of the key screen: the key kept is checked again now.
#[tauri::command]
pub fn recheck_license(app: AppHandle) -> LicenseView {
    license::recheck(&app);
    license::view(&app)
}

/// Tự cập nhật: the version running and where its update stands.
#[tauri::command]
pub fn update_status(app: AppHandle) -> UpdateView {
    update::view(&app)
}

/// Kiểm tra cập nhật: checks now, and downloads a newer version; the "update" event tells how it went.
#[tauri::command]
pub async fn check_update(app: AppHandle) {
    update::check(&app).await;
}

/// Khởi động lại để cập nhật: off the main thread, which macOS needs free to ask for an admin password.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || update::install_now(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// The proxy part of the add and edit form. An empty password with a username keeps the saved one when editing.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyForm {
    enabled: bool,
    kind: ProxyKind,
    host: String,
    port: u32,
    username: String,
    password: String,
}
impl ProxyForm {
    /// None when off with no address: nothing to keep.
    fn proxy(self) -> Result<Option<Proxy>, String> {
        let host = self
            .host
            .trim()
            .trim_start_matches('[')
            .trim_end_matches(']');
        if !self.enabled && host.is_empty() {
            return Ok(None);
        }
        let username = self.username.trim().to_string();
        let proxy = Proxy {
            enabled: self.enabled,
            kind: self.kind,
            host: host.to_string(),
            port: u16::try_from(self.port).unwrap_or(0),
            password: if username.is_empty() {
                String::new()
            } else {
                self.password
            },
            username,
        };
        proxy.check_fields()?;
        Ok(Some(proxy))
    }
}

/// The account of the add and edit form; `password` may be empty only when editing (it then stays as it was).
fn form(
    username: String,
    password: String,
    server_id: i32,
    label: String,
    proxy: Option<ProxyForm>,
    editing: bool,
) -> Result<Account, String> {
    let username = username.trim().to_string();
    if username.is_empty() || (password.is_empty() && !editing) {
        return Err("Cần tên đăng nhập và mật khẩu".into());
    }
    if server_id <= 0 {
        return Err("Máy chủ phải là số dương".into());
    }
    Ok(Account {
        label: label.trim().to_string(),
        username,
        password,
        server_id,
        skill: None,
        stats: None,
        fight: Default::default(),
        fight_targets: Default::default(),
        proxy: proxy.map(ProxyForm::proxy).transpose()?.flatten(),
        algorithm: Default::default(),
    })
}

/// Saves the account to accounts.json and returns its id; a proxy turned on is tested first (Shared::add). The error
/// is shown in the dialog.
#[tauri::command]
pub async fn add_account(
    shared: State<'_, Shared>,
    username: String,
    password: String,
    server_id: i32,
    label: String,
    proxy: Option<ProxyForm>,
    licenses: State<'_, Licenses>,
) -> Result<u64, String> {
    shared
        .add(
            form(username, password, server_id, label, proxy, false)?,
            licenses.max_accounts(),
        )
        .await
}

/// Saves the changed account; an empty password keeps the saved one, and a proxy turned on or changed is tested first
/// (Shared::update). The error is shown in the dialog.
#[tauri::command]
pub async fn update_account(
    shared: State<'_, Shared>,
    id: u64,
    username: String,
    password: String,
    server_id: i32,
    label: String,
    proxy: Option<ProxyForm>,
) -> Result<(), String> {
    shared
        .update(id, form(username, password, server_id, label, proxy, true)?)
        .await
}

/// The game password and the proxy password of the account, which the edit form shows (hidden until its eye button is
/// pressed). Asked when Sửa nick opens; nothing else sends them to the UI.
#[tauri::command]
pub fn account_secrets(shared: State<Shared>, id: u64) -> Result<crate::app::Secrets, String> {
    shared
        .with(|app| app.secrets(id))
        .ok_or_else(|| "Nick này không còn trong danh sách".into())
}

/// What Kiểm tra found: the time to the game server's seed through the proxy, and the IP the proxy goes out with (None
/// when that could not be asked).
#[derive(Debug, Serialize)]
pub struct ProxyCheck {
    pub ms: u64,
    pub ip: Option<String>,
}

/// "Kiểm tra" next to the proxy of the form: reaches the game server through it, on or off, then asks the IP it goes
/// out with (cllt_core::net::proxy_exit_ip). With `id`, an empty password is the one saved for that account.
#[tauri::command]
pub async fn test_proxy(
    shared: State<'_, Shared>,
    id: Option<u64>,
    proxy: ProxyForm,
) -> Result<ProxyCheck, String> {
    let edit = proxy.proxy()?.ok_or("Nhập địa chỉ proxy trước")?;
    let saved = id.and_then(|id| shared.with(|app| app.proxy_of(id)));
    let proxy = crate::app::keep_password(saved.as_ref(), Some(edit)).unwrap();
    let took = cllt_core::net::check_proxy(&shared.server(), &proxy).await?;
    let ip = cllt_core::net::proxy_exit_ip(&proxy).await.ok();
    Ok(ProxyCheck {
        ms: took.as_millis() as u64,
        ip,
    })
}

/// Cài đặt: the settings, their defaults, and what Lưu dữ liệu trận has kept, counted off the main thread.
#[tauri::command]
pub async fn settings(shared: State<'_, Shared>) -> Result<SettingsView, String> {
    let settings = shared.with(|app| app.settings().clone());
    let store = shared.store_handle();
    let battle_data = tauri::async_runtime::spawn_blocking(move || store?.battle_data_size().ok())
        .await
        .map_err(|e| e.to_string())?;
    Ok(SettingsView {
        settings,
        defaults: Settings::default(),
        battle_data,
    })
}

/// Lưu of Cài đặt (Shared::set_settings); the error is shown in the dialog.
#[tauri::command]
pub async fn set_settings(shared: State<'_, Shared>, settings: Settings) -> Result<(), String> {
    shared.set_settings(settings).await
}

/// A choice of the Đóng cửa sổ dialog (tray.rs): Thu nhỏ vào khay or Thoát ứng dụng, saved first as what the close
/// button does from now on when Ghi nhớ is ticked. Nothing happens when that cannot be saved; the error is shown.
#[tauri::command]
pub async fn close_window(
    app: AppHandle,
    shared: State<'_, Shared>,
    action: OnClose,
    remember: bool,
) -> Result<(), String> {
    if remember {
        let settings = Settings {
            on_close: action,
            ..shared.with(|app| app.settings().clone())
        };
        shared.set_settings(settings).await?;
    }
    crate::tray::close(&app, action);
    Ok(())
}

/// Xuất dữ liệu trận: battle_data of cllt.db into a new file cllt-battles-<time>.db in Downloads, which `npm run
/// battles -- --db=<file>` reads (Store::export_battle_data). The error is shown under the button.
#[tauri::command]
pub async fn export_battles(app: AppHandle, shared: State<'_, Shared>) -> Result<Exported, String> {
    let store = shared
        .store_handle()
        .ok_or("Không mở được cllt.db nên không có dữ liệu trận")?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("Không thấy thư mục Downloads: {e}"))?;
    let time = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let size = store.battle_data_size().map_err(|e| e.to_string())?;
        if size.battles == 0 {
            return Err("Chưa có trận nào được lưu".to_string());
        }
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let path = settings::export_path(&dir, settings::Export::Battles, &time);
        let battles = store
            .export_battle_data(&path)
            .map_err(|e| format!("Chưa xuất được: {e}"))?;
        let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        Ok(Exported {
            path: path.display().to_string(),
            battles,
            bytes,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Xoá dữ liệu trận: every saved battle of every account (Store::clear_battle_data); how many. The error is shown under
/// the button.
#[tauri::command]
pub async fn clear_battles(shared: State<'_, Shared>) -> Result<usize, String> {
    let store = shared
        .store_handle()
        .ok_or("Không mở được cllt.db nên không có dữ liệu trận")?;
    tauri::async_runtime::spawn_blocking(move || {
        store
            .clear_battle_data()
            .map_err(|e| format!("Chưa xoá được: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Gửi thử of Cài đặt → Thông báo: one notification now, as a job that ends would show (notify.rs). The error is shown
/// under the button.
#[tauri::command]
pub async fn test_notification(app: AppHandle) -> Result<(), String> {
    crate::notify::show(
        &app,
        &crate::notify::Notice {
            kind: crate::notify::Kind::Done,
            title: "Co Lau Tool: thông báo đang bật".into(),
            body: "Đánh quái hay làm nhiệm vụ kết thúc, hoặc thua hết lượt, sẽ báo như thế này."
                .into(),
        },
    )
}

/// Characters kept of a note of Báo lỗi, of the message of an error of the UI, and of its stack.
const NOTE: usize = 2_000;
const STACK: usize = 8_000;
fn cut(text: &str, at: usize) -> String {
    text.trim().chars().take(at).collect()
}

/// Báo lỗi of the Nhật ký card: the note of the user, with the account's last lines, commands and packets (App::report).
/// Without cllt.db there is nowhere to keep it: the dialog says so.
#[tauri::command]
pub fn report_fault(shared: State<Shared>, id: u64, note: String) -> Result<(), String> {
    if shared.store_handle().is_none() {
        return Err("Không mở được cllt.db nên không lưu được log lỗi".into());
    }
    let note = match cut(&note, NOTE) {
        n if n.is_empty() => "Báo lỗi (không ghi chú)".to_string(),
        n => n,
    };
    shared.with(|app| app.report(id, &note));
    Ok(())
}

/// An error of the UI (an exception, a promise nobody caught): Log lỗi without an account.
#[tauri::command]
pub fn report_ui_error(shared: State<Shared>, text: String, detail: String) {
    let fault = cllt_core::net::Fault {
        reported: false,
        ..cllt_core::net::Fault::note(&cut(&text, NOTE))
    };
    shared.with(|app| app.add_fault(None, fault, Some(&cut(&detail, STACK))));
}

/// Log lỗi for the Cài đặt tab: how many, their size, the newest.
#[tauri::command]
pub async fn faults(shared: State<'_, Shared>) -> Result<FaultList, String> {
    let store = shared
        .store_handle()
        .ok_or("Không mở được cllt.db nên không có log lỗi")?;
    tauri::async_runtime::spawn_blocking(move || store.faults(20).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Xuất log lỗi: every Log lỗi into a new file cllt-errors-<time>.json in Downloads (Store::export_faults), to send to
/// whoever fixes the app. The error is shown under the button.
#[tauri::command]
pub async fn export_faults(
    app: AppHandle,
    shared: State<'_, Shared>,
) -> Result<ExportedFaults, String> {
    let store = shared
        .store_handle()
        .ok_or("Không mở được cllt.db nên không có log lỗi")?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("Không thấy thư mục Downloads: {e}"))?;
    let now = chrono::Local::now();
    let time = now.format("%Y%m%d-%H%M%S").to_string();
    let mut head = crate::app::app_info();
    head.insert("exportedAt".into(), now.to_rfc3339().into());
    tauri::async_runtime::spawn_blocking(move || {
        if store.faults(0).map_err(|e| e.to_string())?.count == 0 {
            return Err("Chưa có log lỗi nào".to_string());
        }
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let path = settings::export_path(&dir, settings::Export::Faults, &time);
        let faults = store
            .export_faults(&path, head)
            .map_err(|e| format!("Chưa xuất được: {e}"))?;
        let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        Ok(ExportedFaults {
            path: path.display().to_string(),
            faults,
            bytes,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Xoá log lỗi: all of them; how many.
#[tauri::command]
pub async fn clear_faults(shared: State<'_, Shared>) -> Result<usize, String> {
    let store = shared
        .store_handle()
        .ok_or("Không mở được cllt.db nên không có log lỗi")?;
    tauri::async_runtime::spawn_blocking(move || store.clear_faults().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// "Mở thư mục" after Xuất dữ liệu trận: the file selected in Finder or Explorer. Only a file the export wrote.
#[tauri::command]
pub fn reveal_export(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    if !settings::is_export(&path) {
        return Err("Không còn thấy file đã xuất".into());
    }
    settings::reveal(&path).map_err(|e| format!("Không mở được thư mục: {e}"))
}

/// Xuất JSON: the accounts `ids` (in the order of the list) as backup.rs writes them, passwords included, and the
/// Cài đặt of the app when `settings`. The dialog keeps it to copy at once on Sao chép JSON.
#[tauri::command]
pub fn export_accounts(
    shared: State<Shared>,
    ids: Vec<u64>,
    settings: bool,
) -> Result<String, String> {
    exported_accounts(&shared, &ids, settings).map(|(text, _)| text)
}

/// The JSON of Xuất and how many accounts it holds; an error when none of `ids` is in the list.
fn exported_accounts(
    shared: &Shared,
    ids: &[u64],
    settings: bool,
) -> Result<(String, usize), String> {
    shared.with(|app| {
        let accounts = app.accounts_of(ids);
        if accounts.is_empty() {
            return Err("Chọn ít nhất một nick".to_string());
        }
        let at = chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
        let text = backup::export(&accounts, settings.then(|| app.settings()), &at);
        Ok((text, accounts.len()))
    })
}

/// Lưu file of Xuất JSON: the same JSON into a new cllt-accounts-<time>.json in Downloads that only its owner can read.
/// "Mở thư mục" shows it (reveal_export).
#[tauri::command]
pub async fn save_accounts(
    app: AppHandle,
    shared: State<'_, Shared>,
    ids: Vec<u64>,
    settings: bool,
) -> Result<backup::Saved, String> {
    let (text, accounts) = exported_accounts(&shared, &ids, settings)?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("Không thấy thư mục Downloads: {e}"))?;
    let time = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let path = settings::export_path(&dir, settings::Export::Accounts, &time);
        settings::write_private(&path, &text).map_err(|e| format!("Chưa lưu được: {e}"))?;
        Ok(backup::Saved {
            path: path.display().to_string(),
            accounts,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Nhập JSON, before anything is saved: each account of the JSON, whether the list has it and whether it has a
/// password (never the password). The error says what is wrong with the JSON.
#[tauri::command]
pub fn preview_import(
    shared: State<Shared>,
    text: String,
) -> Result<backup::ImportPreview, String> {
    let parsed = backup::parse(&text)?;
    Ok(shared.with(|app| backup::preview(&parsed, |a| app.find(a))))
}

/// Nhập: adds the accounts of the JSON, replaces those the list has when `replace`, then applies the Cài đặt of the
/// JSON when `settings` (Shared::import, Shared::set_settings). The error is shown in the dialog.
#[tauri::command]
pub async fn import_accounts(
    shared: State<'_, Shared>,
    text: String,
    replace: bool,
    settings: bool,
    licenses: State<'_, Licenses>,
) -> Result<backup::Imported, String> {
    let parsed = backup::parse(&text)?;
    let mut done = shared
        .import(parsed.accounts, replace, licenses.max_accounts())
        .await?;
    // Old data, not an edit made now: it does not undo a later edit of another device (sync.rs).
    crate::sync::imported(&done.accounts);
    if let Some(s) = parsed.settings.filter(|_| settings) {
        shared
            .set_settings(s)
            .await
            .map_err(|e| format!("Đã nhập nick, nhưng chưa áp dụng được cài đặt: {e}"))?;
        done.settings = true;
    }
    Ok(done)
}

/// The sidebar after a drag: every account id in the new order (Shared::reorder). The error comes back to the sidebar,
/// which puts the cards back.
#[tauri::command]
pub async fn reorder_accounts(shared: State<'_, Shared>, ids: Vec<u64>) -> Result<(), String> {
    shared.reorder(ids).await
}

/// The error is shown in the dialog that asked; the account then stays.
#[tauri::command]
pub async fn remove_account(shared: State<'_, Shared>, id: u64) -> Result<(), String> {
    shared.remove(id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use cllt_core::bot::Tenths;

    #[test]
    fn set_fight_keeps_the_times_of_thoi_gian_cho_within_their_bounds() {
        let low = bounded_fight(FightSettings {
            mob_delay_secs: 0,
            turn_delay_secs: Tenths(0),
            step_delay_secs: 0,
            break_every: 0,
            break_minutes: 0,
            ..FightSettings::default()
        });
        assert_eq!(
            (
                low.mob_delay_secs,
                low.turn_delay_secs,
                low.step_delay_secs,
                low.break_every,
                low.break_minutes
            ),
            (1, Tenths(5), 1, 1, 1)
        );
        let high = bounded_fight(FightSettings {
            mob_delay_secs: 999,
            turn_delay_secs: Tenths::secs(999),
            step_delay_secs: 999,
            break_every: 99_999,
            break_minutes: 999,
            ..FightSettings::default()
        });
        assert_eq!(
            (
                high.mob_delay_secs,
                high.turn_delay_secs,
                high.step_delay_secs,
                high.break_every,
                high.break_minutes
            ),
            (60, Tenths::secs(10), 30, 1000, 120)
        );
    }
}
