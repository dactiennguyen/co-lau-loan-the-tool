// Headless counterpart of the desktop app, for checks against the live server:
//   cllt status                                       log in every account, print its status, log out
//   cllt fight --account=NAME --target="X" --count=N [--max-losses=1] [--auto-repair] [--no-pickup]
//   cllt quest --account=NAME [--max-losses=1] [--auto-repair] [--no-pickup]
//                                                       "Tự làm nhiệm vụ" until it stops, then log out; --auto-repair
//                                                       turns on Tự sửa đồ for the run (uses the hammers of the bag),
//                                                       --no-pickup turns off Tự nhặt đồ (the own drops of a won battle)
//                                                       fight and quest keep each battle as captures/battles/<day>/
//                                                       <time>-<character>-<mob>.jsonl.gz of the repository, as the TS
//                                                       bot does (UTC day and time); --no-record keeps none.
//                                                       Battles play v3, the app's algorithm; --algo=v1 plays the v1
//                                                       kept for comparison (runner.rs, BotOptions::algorithm)
//   cllt skill --account=NAME [--id=1001]               print the skill tree; with --id, Nâng cấp that skill once
//                                                       (c2s/1191, spends skill points), print the tree again
//   cllt item --account=NAME [--equip=SLOT | --unequip=SLOT | --use=SLOT | --repair=SLOT | --discard=SLOT | --sort]
//                                                       print gear, bag and stats; with a button, press it once (bag
//                                                       slots for equip, use and discard, gear slots for unequip and
//                                                       repair; --discard throws the item away for good)
//   cllt zone --account=NAME [--zone=4]                 print the zones of the map (c2s/1172); with --zone, move there
//   cllt goto --account=NAME --map=M1                   walk through portals to that map ("Đổi map")
//   cllt buy --account=NAME [--item=2] [--pay=khoa|xu] [--qty=1] [--confirm]
//                                                       open the Dược phẩm shop of Lái Buôn (on M1) and print it; with
//                                                       --confirm buy that item (2 Búa Sửa Chữa), which spends money
//   cllt smith --account=NAME --quote=SLOT [--careful]  Pháp sư (on M1): print the stones and gear of the bag, ask the
//                                                       price and odds of the next level of bag slot SLOT (free)
//   cllt smith --account=NAME [--merge=12 | --upgrade=SLOT [--to=4] [--rate=100] [--careful] [--charm=never] |
//              --separate=SLOT | --transmute=SRC:DST | --exchange=OPT:TIMES] --confirm
//                                                       Gộp đá, Nâng cấp, Tách đá, Chuyển hoá, Đổi lượng: spends money
//                                                       and stones; without --confirm only what it would do is printed
//                                                       --worn: SLOT of --quote, --upgrade is a gear slot; the item is
//                                                       taken off, upgraded, then worn again
//   cllt market --account=NAME [--tab=N [--page=1]] [--sell=SLOT --price=N | --withdraw=UUID | --extend=UUID |
//               --buy=UUID --price=N] [--confirm]
//                                                       Chợ trời (anywhere): print the fee, the tabs, the items of the bag
//                                                       that can be listed (not locked) and Đang bán; --tab also prints
//                                                       that page of tab N (0–8). --sell lists one of bag slot SLOT at N
//                                                       Xu (the fee is spent), --withdraw takes a listing of Đang bán
//                                                       back, --extend adds 24 h to it (the fee), --buy (with --tab of its
//                                                       page) buys the listing if it still costs N Xu; without --confirm
//                                                       only what it would do is printed
// Accounts: --accounts=FILE, else accounts.json of app/, else CLLT_USERNAME/CLLT_PASSWORD of the repository .env;
// --account=NAME also finds the one of .env when the file lacks it, and CLLT_USERNAME/CLLT_PASSWORD of the process
// environment come first of all.
// Passwords are never printed.
use cllt_core::accounts::{self, Account};
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::battle_record::BattleData;
use cllt_core::bot::{ItemAct, MarketTask, SmithTask, Snapshot};
use cllt_core::items::book;
use cllt_core::market::MARKET_MINE_TAB;
use cllt_core::net::{Command, ConnState, Event, Manager};
use cllt_core::npc::MergeOptions;
use cllt_core::skills::skill_tree;
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// A battle of Lưu dữ liệu trận as a battle file of the TS bot (src/bot/battle-record.ts): captures/battles of the
/// repository, the day and time of its header's `at` (UTC), the character and mob names without diacritics.
fn save_battle(d: &BattleData) -> std::io::Result<std::path::PathBuf> {
    let header: serde_json::Value = serde_json::from_str(&d.header).unwrap_or_default();
    let at = header["at"].as_str().unwrap_or("0000-00-00T00:00:00");
    let name = format!(
        "{}-{}-{}.jsonl.gz",
        at.get(11..19).unwrap_or("000000").replace(':', ""),
        slug(header["character"].as_str().unwrap_or("x")),
        slug(header["mob"]["name"].as_str().unwrap_or("x"))
    );
    let root = find_upwards("data/items.json")
        .and_then(|p| Some(p.parent()?.parent()?.to_path_buf()))
        .unwrap_or_else(|| ".".into());
    let dir = root
        .join("captures/battles")
        .join(at.get(..10).unwrap_or("0000-00-00"));
    std::fs::create_dir_all(&dir)?;
    // Two battles opened in the same second (a late s2c/22): the second gets "-2".
    let mut file = dir.join(&name);
    for n in 2.. {
        if !file.exists() {
            break;
        }
        file = dir.join(name.replace(".jsonl.gz", &format!("-{n}.jsonl.gz")));
    }
    std::fs::write(&file, &d.packets)?;
    Ok(file)
}

/// fileSlug of battle-record.ts: lower case, Vietnamese letters without their marks, words joined by "-".
fn slug(text: &str) -> String {
    const PLAIN: [(&str, char); 7] = [
        ("àáạảãâầấậẩẫăằắặẳẵ", 'a'),
        ("èéẹẻẽêềếệểễ", 'e'),
        ("ìíịỉĩ", 'i'),
        ("òóọỏõôồốộổỗơờớợởỡ", 'o'),
        ("ùúụủũưừứựửữ", 'u'),
        ("ỳýỵỷỹ", 'y'),
        ("đ", 'd'),
    ];
    let mut out = String::new();
    for c in text.to_lowercase().chars() {
        let c = PLAIN
            .iter()
            .find(|(set, _)| set.contains(c))
            .map_or(c, |p| p.1);
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "x".into()
    } else {
        out
    }
}

/// The task of `cllt smith` from its flags. A slot or option out of range is an error, never wrapped to another slot.
fn smith_task(
    arg: &dyn Fn(&str) -> Option<String>,
    careful: bool,
    worn: bool,
) -> Result<Option<SmithTask>, String> {
    let int = |k: &str| -> Result<Option<i32>, String> {
        arg(k)
            .map(|v| {
                v.parse::<i32>()
                    .map_err(|_| format!("--{k}={v}: không phải số"))
            })
            .transpose()
    };
    let slot = |k: &str| -> Result<Option<u8>, String> {
        arg(k)
            .map(|v| {
                v.parse::<u8>()
                    .map_err(|_| format!("--{k}={v}: ô túi phải từ 0 tới 255"))
            })
            .transpose()
    };
    let pair = |k: &str| -> Result<Option<(u8, u32)>, String> {
        let Some(v) = arg(k) else { return Ok(None) };
        let bad = || format!("--{k}={v}: cần dạng A:B, A từ 0 tới 255");
        let (a, b) = v.split_once(':').ok_or_else(bad)?;
        Ok(Some((
            a.parse().map_err(|_| bad())?,
            b.parse().map_err(|_| bad())?,
        )))
    };
    // --charm=never: no Bùa bảo vệ, a failure from +5 and up drops the item and ends the task.
    let charm = match arg("charm").as_deref() {
        None | Some("auto") => true,
        Some("never") => false,
        Some(v) => return Err(format!("--charm={v}: chỉ auto hoặc never")),
    };
    if let Some(slot) = slot("quote")? {
        return Ok(Some(SmithTask::Upgrade {
            slot,
            careful,
            rate: 100,
            to_level: 16,
            unlocked: true,
            quote: true,
            worn,
            charm,
            stones: vec![],
        }));
    }
    if let Some(slot) = slot("upgrade")? {
        return Ok(Some(SmithTask::Upgrade {
            slot,
            careful,
            rate: int("rate")?.unwrap_or(100).clamp(1, 100),
            to_level: int("to")?.unwrap_or(4),
            unlocked: false,
            quote: false,
            worn,
            charm,
            stones: vec![],
        }));
    }
    if let Some(up_to) = int("merge")? {
        return Ok(Some(SmithTask::Merge(MergeOptions {
            up_to,
            ..MergeOptions::default()
        })));
    }
    if let Some(slot) = slot("separate")? {
        return Ok(Some(SmithTask::Separate { slot }));
    }
    if let Some((source, target)) = pair("transmute")? {
        let target =
            u8::try_from(target).map_err(|_| format!("--transmute: ô đích {target} quá 255"))?;
        return Ok(Some(SmithTask::Transmute { source, target }));
    }
    Ok(pair("exchange")?.map(|(option, times)| SmithTask::Exchange { option, times }))
}

/// The stones (by level, locked or not), the gear (+level) of the bag and the gear worn, for `cllt smith`.
fn stones_and_gear(s: &Snapshot) -> Vec<String> {
    let Some(bag) = &s.bag else {
        return vec!["Chưa có túi đồ".into()];
    };
    let b = book();
    let mut counts = [[0; 2]; 13];
    let mut gear = vec![];
    for i in &bag.items {
        let level = cllt_core::npc::stone_level(i.item_id);
        if level > 0 {
            counts[level as usize][(i.field1 == 0) as usize] += i.quantity.max(1);
        } else if b
            .get(i.item_id)
            .is_some_and(|d| cllt_core::npc::upgradable(d.kind))
        {
            let name = b
                .get(i.item_id)
                .map_or_else(|| format!("#{}", i.item_id), |d| d.name.clone());
            let lock = if i.field1 == 0 { ", khoá" } else { "" };
            gear.push(format!("ô {} {} +{}{lock}", i.slot, name, i.field0));
        }
    }
    let worn: Vec<String> = s
        .gear
        .iter()
        .flatten()
        .filter(|i| {
            b.get(i.item_id)
                .is_some_and(|d| cllt_core::npc::upgradable(d.kind))
        })
        .map(|i| {
            let name = b
                .get(i.item_id)
                .map_or_else(|| format!("#{}", i.item_id), |d| d.name.clone());
            format!("ô {} {} +{}", i.slot, name, i.field0)
        })
        .collect();
    let stones: Vec<String> = (1..13)
        .filter(|&l| counts[l][0] + counts[l][1] > 0)
        .map(|l| {
            format!(
                "Đá cấp {l}: {} khoá, {} chưa khoá",
                counts[l][1], counts[l][0]
            )
        })
        .collect();
    let money = s.currencies.as_ref().map_or_else(String::new, |c| {
        format!("{} Xu, {} Xu khóa, {} Lượng", c.xu, c.xu_khoa, c.luong)
    });
    vec![
        format!("Túi {}/{} ô; {money}", bag.items.len(), bag.capacity),
        format!(
            "Đá: {}",
            if stones.is_empty() {
                "không có".into()
            } else {
                stones.join("; ")
            }
        ),
        format!(
            "Trang bị: {}",
            if gear.is_empty() {
                "không có".into()
            } else {
                gear.join("; ")
            }
        ),
        format!(
            "Đang mặc (ô trang bị, cho --worn): {}",
            match worn.is_empty() {
                true => "không có".into(),
                false => worn.join("; "),
            }
        ),
    ]
}

/// The accounts of the file (`--accounts`, app/accounts.json, else .env), with the account of CLLT_USERNAME and
/// CLLT_PASSWORD first when the process has them, so `--account=NAME` finds either.
fn load(path: Option<String>) -> Vec<Account> {
    let file = path
        .map(Into::into)
        .or_else(|| find_upwards("app/accounts.json"))
        .or_else(|| find_upwards("accounts.json"));
    let mut all: Vec<Account> = match file {
        Some(f) => accounts::load(&f).unwrap_or_else(|e| panic!("{e}")),
        None => find_upwards(".env")
            .and_then(|p| accounts::from_env(&p))
            .into_iter()
            .collect(),
    };
    if let Some(a) = accounts::from_process() {
        all.retain(|x| x.username != a.username);
        all.insert(0, a);
    }
    all
}

fn line(a: &Account, s: &Snapshot) -> String {
    let targets: Vec<String> = s
        .targets
        .iter()
        .map(|t| {
            format!(
                "{} {}{}",
                t.name,
                t.level,
                if t.boss { " (boss)" } else { "" }
            )
        })
        .collect();
    let exp = match (s.exp, s.level_exp) {
        (Some(e), Some([_, hi])) => format!(" EXP {e}/{hi}"),
        _ => String::new(),
    };
    let quest = s.quest.as_ref().map_or(String::new(), |q| {
        let step = q.steps.get(q.current.max(0) as usize);
        format!(
            " | nhiệm vụ {} {}: bước {}/{} {} ({}/{})",
            q.id,
            q.title,
            q.current as i64 + 1,
            q.steps.len(),
            step.map_or("", |s| &s.text),
            q.progress,
            step.map_or(0, |s| s.required)
        )
    });
    format!(
        "{}: {} cấp {} HP {}/{}{exp} | {} {} khu {}, {} người khác | {}{quest}",
        if a.label.is_empty() {
            &a.username
        } else {
            &a.label
        },
        s.name,
        s.level,
        s.hp,
        s.max_hp,
        s.map_id,
        s.map_name,
        s.zone,
        s.players.len(),
        targets.join(", ")
    )
}

/// The skill tree as `npm run skills` prints it, one skill a line.
fn skills(s: &Snapshot) -> Vec<String> {
    let points = s.skill_points.unwrap_or(0);
    let mut out = vec![format!("cấp {}, {points} điểm kỹ năng", s.level)];
    out.extend(
        skill_tree(&s.skills, &s.skill_levels, s.level, points)
            .iter()
            .map(|n| format!("  {}", n.line())),
    );
    out
}

/// Gear, bag and the stats they change, with the slots `cllt item` takes.
/// "Xu 500, Xu khóa 8437; Búa Sửa Chữa trong túi: 1", for `cllt buy`.
fn wallet(s: &Snapshot, item_id: i32) -> String {
    let have: i32 = s.bag.as_ref().map_or(0, |b| {
        b.items
            .iter()
            .filter(|i| i.item_id == item_id)
            .map(|i| i.quantity)
            .sum()
    });
    let name = book()
        .get(item_id)
        .map_or_else(|| format!("#{item_id}"), |d| d.name.clone());
    match &s.currencies {
        Some(c) => format!(
            "Xu {}, Xu khóa {}; {name} trong túi: {have}",
            c.xu, c.xu_khoa
        ),
        None => format!("{name} trong túi: {have}"),
    }
}

/// `cllt market`: the fee and rules of s2c/116, the bag items that can be listed (not locked) and Đang bán.
fn market_lines(s: &Snapshot) -> Vec<String> {
    let b = book();
    let name = |id: i32| {
        b.get(id)
            .map_or_else(|| format!("#{id}"), |d| d.name.clone())
    };
    let mut out = vec![];
    if let Some(t) = &s.market.tabs {
        out.push(format!(
            "Chợ trời: phí đăng bán {} Xu, bán trong {} giờ, giá tối đa {} Xu; Xu đang có {}",
            t.fee,
            t.hours,
            t.max_price,
            s.currencies.as_ref().map_or(-1, |c| c.xu)
        ));
        let tabs: Vec<_> = t
            .tabs
            .iter()
            .map(|t| format!("{} {} ({})", t.tab, t.name, t.listings))
            .collect();
        out.push(format!("mục: {}", tabs.join(", ")));
    }
    out.push("bán được (chưa khoá):".into());
    for i in s
        .bag
        .iter()
        .flat_map(|b| &b.items)
        .filter(|i| i.field1 != 0)
    {
        out.push(format!(
            "  ô túi {} (slot {}): {} ×{}",
            i.slot as u32 + 1,
            i.slot,
            name(i.item_id),
            i.quantity
        ));
    }
    let mine: Vec<_> = s.market.mine.iter().flat_map(|p| &p.listings).collect();
    out.push(format!("đang bán ({}):", mine.len()));
    for l in mine {
        out.push(format!(
            "  {} ×{} giá {} Xu, uuid {}",
            name(l.item_id),
            l.quantity,
            l.price,
            l.uuid
        ));
    }
    out
}

/// `cllt market --tab=N`: the page read, one listing per line with what --buy needs (uuid, price).
fn market_page_lines(p: &cllt_core::market::MarketPage) -> Vec<String> {
    let b = book();
    let mut out = vec![format!(
        "mục {} {}: trang {}/{}, {} món",
        p.tab,
        p.tab_name,
        p.page,
        p.pages,
        p.listings.len()
    )];
    for l in &p.listings {
        let name = b
            .get(l.item_id)
            .map_or_else(|| format!("#{}", l.item_id), |d| d.name.clone());
        out.push(format!(
            "  {name} ×{} giá {} Xu, người bán {}, uuid {}",
            l.quantity, l.price, l.seller, l.uuid
        ));
    }
    out
}

fn gear_and_bag(s: &Snapshot) -> Vec<String> {
    let b = book();
    let name = |id: i32| {
        b.get(id)
            .map_or_else(|| format!("#{id}"), |d| d.name.clone())
    };
    let mut out = vec![format!(
        "HP {}/{}; tấn công, phòng thủ, chính xác, né tránh, chí mạng: {:?}",
        s.hp, s.max_hp, s.combat
    )];
    out.push("trang bị:".into());
    for (n, g) in s.gear.iter().enumerate() {
        if let Some(i) = g {
            let wear = match i.durability {
                d if d >= 0 => format!(", độ bền {d}"),
                _ => String::new(),
            };
            out.push(format!("  ô {n}: {}{wear}", name(i.item_id)));
        }
    }
    if let Some(bag) = &s.bag {
        out.push(format!("túi ({}/{}):", bag.items.len(), bag.capacity));
        for i in &bag.items {
            // "ô túi 3" as the app and the log number it; slot 2 is what --equip and --use take.
            out.push(format!(
                "  ô túi {} (slot {}): {} ×{}",
                i.slot as u32 + 1,
                i.slot,
                name(i.item_id),
                i.quantity
            ));
        }
    }
    out
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let arg = |name: &str| {
        args.iter()
            .find_map(|a| a.strip_prefix(&format!("--{name}=")).map(String::from))
    };
    let all = load(arg("accounts"));
    if all.is_empty() {
        eprintln!("Không có tài khoản: tạo app/accounts.json (xem app/accounts.example.json) hoặc điền .env");
        std::process::exit(2);
    }
    let atlas = find_upwards("data/maps.json")
        .map(|p| Atlas::load(&p))
        .unwrap_or_default();
    let (tx, rx) = mpsc::channel();
    let mut manager = Manager::new(atlas, move |id, e| {
        let _ = tx.send((id, e));
    })
    .expect("tokio runtime");

    let command = args.first().map(String::as_str);
    let quest = command == Some("quest");
    let skill = command == Some("skill");
    let upgrade: Option<i32> = arg("id").and_then(|v| v.parse().ok());
    let item = command == Some("item");
    let slot = |k: &str| arg(k).and_then(|v| v.parse::<u8>().ok());
    let press = slot("equip")
        .map(ItemAct::Equip)
        .or_else(|| slot("unequip").map(ItemAct::Unequip))
        .or_else(|| slot("use").map(ItemAct::Use))
        .or_else(|| slot("repair").map(ItemAct::Repair))
        .or_else(|| slot("discard").map(ItemAct::Discard))
        .or_else(|| args.iter().any(|a| a == "--sort").then_some(ItemAct::Sort));
    let zone = command == Some("zone");
    let zone_to: Option<i32> = arg("zone").and_then(|v| v.parse().ok());
    let goto = command == Some("goto");
    let buy = command == Some("buy");
    let buy_item: i32 = arg("item").and_then(|v| v.parse().ok()).unwrap_or(2);
    let buy_currency = if arg("pay").as_deref() == Some("xu") {
        0
    } else {
        1
    };
    let buy_quantity: i32 = arg("qty").and_then(|v| v.parse().ok()).unwrap_or(1);
    let confirm = args.iter().any(|a| a == "--confirm");
    let fight = command == Some("fight") || quest;
    let smith = command == Some("smith");
    let market = command == Some("market");
    let market_price = arg("price").map(|p| match p.replace('.', "").parse::<i64>() {
        Ok(price) => price,
        Err(_) => {
            eprintln!("--price: một số Xu, như --price=50000");
            std::process::exit(2);
        }
    });
    // --tab (0–8) and --page: the page of a tab read with Đang bán, where --buy finds its listing.
    let market_tab: Option<i32> = arg("tab").and_then(|v| v.parse().ok());
    let market_page: i32 = arg("page").and_then(|v| v.parse().ok()).unwrap_or(1);
    let market_task = match (
        slot("sell"),
        market_price,
        arg("withdraw"),
        arg("buy"),
        arg("extend"),
    ) {
        (Some(slot), Some(price), None, None, None) => Some(MarketTask::Sell {
            slot,
            price,
            uuid: None,
        }),
        (None, None, Some(uuid), None, None) => Some(MarketTask::Withdraw(uuid)),
        (None, Some(price), None, Some(uuid), None) if market_tab.is_some() => {
            Some(MarketTask::Buy {
                uuid,
                price: price as i32,
            })
        }
        (None, None, None, None, Some(uuid)) => Some(MarketTask::Extend(uuid)),
        (None, None, None, None, None) => None,
        _ if market => {
            eprintln!("cllt market: --sell=SLOT --price=N, --withdraw=UUID, --extend=UUID, hoặc --tab=N --buy=UUID --price=N");
            std::process::exit(2);
        }
        _ => None,
    };
    // `cllt market`: Đang bán is being read (after the login, or after the task), then the lines are printed.
    let mut market_reading = false;
    let mut market_page_asked = false;
    let mut market_done: Option<Instant> = None;
    let flag = |f: &str| args.iter().any(|a| a == f);
    let smith_task = match smith_task(&arg, flag("--careful"), flag("--worn")) {
        Ok(t) => t,
        Err(e) if smith => {
            eprintln!("{e}");
            std::process::exit(2);
        }
        Err(_) => None,
    };
    let chosen: Vec<(u64, Account)> =
        if fight || skill || item || zone || goto || buy || smith || market {
            let name = arg("account").unwrap_or_else(|| all[0].username.clone());
            let env = || find_upwards(".env").and_then(|p| accounts::from_env(&p));
            all.iter()
                .find(|a| a.username == name || a.label == name)
                .cloned()
                .or_else(|| env().filter(|a| a.username == name))
                .map(|a| (0, a))
                .into_iter()
                .collect()
        } else {
            all.iter()
                .cloned()
                .enumerate()
                .map(|(i, a)| (i as u64, a))
                .collect()
        };
    if chosen.is_empty() {
        eprintln!("Không có tài khoản tên đó");
        std::process::exit(2);
    }
    // Tự sửa đồ on, or Tự nhặt đồ off, for this run, as when ticked in the Cài đặt tab; accounts.json is left as it is.
    let auto_repair = args.iter().any(|a| a == "--auto-repair");
    let no_pickup = args.iter().any(|a| a == "--no-pickup");
    let no_record = args.iter().any(|a| a == "--no-record");
    let algorithm = match args.iter().find_map(|a| a.strip_prefix("--algo=")) {
        None | Some("v3") => cllt_core::bot::Algorithm::V3,
        Some("v1") => cllt_core::bot::Algorithm::V1,
        Some(other) => {
            eprintln!("--algo: v1 hay v3, không có {other}");
            std::process::exit(2);
        }
    };
    manager.set_record(!no_record);
    for (id, a) in &chosen {
        let mut a = a.clone();
        a.fight.repair |= auto_repair && fight;
        a.fight.pickup &= !no_pickup;
        a.algorithm = algorithm;
        manager.login(*id, a);
    }
    let mut snaps: Vec<Snapshot> = vec![Snapshot::default(); chosen.len()];
    let mut online: Vec<Option<Instant>> = vec![None; chosen.len()];
    let (mut ended, mut started, mut failed) = (0, false, false);
    // When the Nâng cấp went out; the session logs out on its answer, or 10 s later without one.
    let mut upgrading: Option<Instant> = None;
    // When the item button went out, and when its answer came: gear and bag are printed a second later (s2c/10, s2c/37
    // and s2c/42 come with it), or 10 s after the button without an answer.
    let (mut pressed, mut answered): (Option<Instant>, Option<Instant>) = (None, None);
    // `cllt zone` waits for s2c/1172 after its c2s/1172; zone and goto log out a second after their last line.
    let mut listing = false;
    // `cllt buy` waits for the shop (s2c/1190) after its Command::OpenShop.
    let mut shopping = false;
    let mut moved: Option<Instant> = None;
    while ended < chosen.len() {
        let Ok((id, event)) = rx.recv_timeout(Duration::from_millis(200)) else {
            let late = pressed.is_some_and(|t| t.elapsed() > Duration::from_secs(10));
            if late || answered.is_some_and(|t| t.elapsed() > Duration::from_secs(1)) {
                if late {
                    println!("Server không trả lời sau 10 s");
                }
                (pressed, answered) = (None, None);
                gear_and_bag(&snaps[0]).iter().for_each(|l| println!("{l}"));
                manager.send(0, Command::Logout);
            }
            if moved.is_some_and(|t| t.elapsed() > Duration::from_secs(1)) {
                moved = None;
                println!("{}", line(&chosen[0].1, &snaps[0]));
                if buy {
                    println!("{}", wallet(&snaps[0], buy_item));
                }
                manager.send(0, Command::Logout);
            }
            // Xong or Chưa of the market task: a moment later Đang bán has been read again (Bot::market_listed).
            if market_done.is_some_and(|t| t.elapsed() > Duration::from_secs(2)) {
                market_done = None;
                market_lines(&snaps[0]).iter().for_each(|l| println!("{l}"));
                manager.send(0, Command::Logout);
            }
            if upgrading.is_some_and(|t| t.elapsed() > Duration::from_secs(10)) {
                upgrading = None;
                println!("Server không trả lời lần nâng cấp sau 10 s");
                manager.send(0, Command::Logout);
            }
            // A moment after the login the bosses (s2c/1177) have come too.
            for (i, at) in online.iter_mut().enumerate() {
                if at.is_some_and(|t| t.elapsed() > Duration::from_millis(1500)) {
                    *at = None;
                    if zone {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        listing = true;
                        manager.send(i as u64, Command::ListZones);
                    } else if buy {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        println!("{}", wallet(&snaps[i], buy_item));
                        shopping = true;
                        manager.send(i as u64, Command::OpenShop);
                    } else if smith {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        stones_and_gear(&snaps[i])
                            .iter()
                            .for_each(|l| println!("{l}"));
                        match &smith_task {
                            Some(t)
                                if confirm
                                    || matches!(t, SmithTask::Upgrade { quote: true, .. }) =>
                            {
                                manager.send(i as u64, Command::Smith(t.clone()));
                            }
                            Some(t) => {
                                println!("Sẽ làm: {t:?}; thêm --confirm để làm (tốn tiền và đá)");
                                manager.send(i as u64, Command::Logout);
                            }
                            None => {
                                eprintln!("Thiếu việc: --quote=SLOT, --merge=12, --upgrade=SLOT, --separate=SLOT, --transmute=SRC:DST hay --exchange=OPT:TIMES");
                                manager.send(i as u64, Command::Logout);
                            }
                        }
                    } else if market {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        market_reading = true;
                        manager.send(
                            i as u64,
                            Command::Market(MarketTask::Open {
                                tab: MARKET_MINE_TAB,
                                page: 1,
                            }),
                        );
                    } else if goto {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        match arg("map") {
                            Some(map) => manager.send(i as u64, Command::GoTo(map)),
                            None => {
                                eprintln!("Thiếu --map=M1");
                                manager.send(i as u64, Command::Logout)
                            }
                        };
                    } else if item {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        gear_and_bag(&snaps[i]).iter().for_each(|l| println!("{l}"));
                        match press {
                            Some(act) => {
                                pressed = Some(Instant::now());
                                manager.send(i as u64, Command::Item(act));
                            }
                            None => {
                                manager.send(i as u64, Command::Logout);
                            }
                        }
                    } else if skill {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        skills(&snaps[i]).iter().for_each(|l| println!("{l}"));
                        match upgrade {
                            Some(id) => {
                                upgrading = Some(Instant::now());
                                manager.send(i as u64, Command::UpgradeSkill(id));
                            }
                            None => {
                                manager.send(i as u64, Command::Logout);
                            }
                        }
                    } else if fight && !started {
                        started = true;
                        let target = arg("target").unwrap_or_default();
                        let count = arg("count").and_then(|v| v.parse().ok()).unwrap_or(1);
                        let max_losses =
                            arg("max-losses").and_then(|v| v.parse().ok()).unwrap_or(1);
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        let command = if quest {
                            Command::Quest {
                                max_losses,
                                step: None,
                            }
                        } else {
                            Command::Fight {
                                target,
                                count,
                                max_losses,
                            }
                        };
                        manager.send(i as u64, command);
                    } else if !fight {
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        manager.send(i as u64, Command::Logout);
                    }
                }
            }
            continue;
        };
        let i = id as usize;
        match event {
            Event::State(ConnState::Online) => online[i] = Some(Instant::now()),
            Event::State(ConnState::Offline) => ended += 1,
            Event::State(ConnState::Error(e)) => {
                println!("{}: lỗi: {e}", chosen[i].1.username);
                failed = true;
                ended += 1;
            }
            Event::State(ConnState::Connecting) => {}
            Event::Battle(_) | Event::BattleEvent(_) => {}
            // Log lỗi is the app's: its line was printed as it came.
            Event::Fault(_) => {}
            Event::ProxyIp(ip) => println!("{}: proxy ra IP {ip}", chosen[i].1.username),
            Event::Pickup(p) => println!("{}: nhặt {}", chosen[i].1.username, p.item.label()),
            Event::BattleData(d) => match save_battle(&d) {
                Ok(file) => println!("{}: lưu trận vào {}", chosen[i].1.username, file.display()),
                Err(e) => println!("{}: không lưu được trận: {e}", chosen[i].1.username),
            },
            Event::Log(_, text) => {
                println!("{}: {text}", chosen[i].1.username);
                // Bot::smith refused the task ("Chưa Gộp đá …: <why>"): no run starts, so none ends; log out now.
                if smith
                    && text.starts_with("Chưa ")
                    && snaps[i].smith.as_ref().is_none_or(|r| r.done.is_some())
                {
                    manager.send(id, Command::Logout);
                }
                // Bot::upgrade_skill refused it, or s2c/1191 answered it.
                if upgrading.is_some()
                    && (text.starts_with("Chưa nâng") || text.starts_with("Đã nâng"))
                {
                    upgrading = None;
                    manager.send(id, Command::Logout);
                }
                // The end of a zone change (Bot::change_zone) or of a trip (Bot::go_to), done or refused.
                let over = (zone
                    && [
                        "Đã sang khu",
                        "Chưa sang khu",
                        "Server không trả lời khi sang khu",
                    ]
                    .iter()
                    .any(|v| text.starts_with(v)))
                    || (goto && (text.starts_with("Kết thúc") || text.starts_with("Chưa đi tới")))
                    || (buy
                        && [
                            "Đã mua",
                            "Chưa mua",
                            "Chưa mở cửa hàng",
                            "Không mở được",
                            "Lái Buôn không trả lời",
                        ]
                        .iter()
                        .any(|v| text.starts_with(v)));
                if over {
                    moved = Some(Instant::now());
                }
                if market
                    && [
                        "Xong đăng bán",
                        "Chưa đăng bán",
                        "Xong thu hồi",
                        "Chưa thu hồi",
                        "Xong mua",
                        "Chưa mua",
                        "Xong gia hạn",
                        "Chưa gia hạn",
                        "Chưa mở Chợ trời",
                        "Chợ trời không trả lời",
                    ]
                    .iter()
                    .any(|v| text.starts_with(v))
                {
                    market_done = Some(Instant::now());
                }
                // Bot::item echoes the button ("Mặc Áo Hào Kiệt (ô túi 3)"); the next line is its refusal, the answer
                // ("Đã mặc …") or a notice of the server.
                let echo = ["Mặc ", "Cởi ", "Dùng ", "Sửa ", "Vứt ", "Sắp xếp "]
                    .iter()
                    .any(|v| text.starts_with(v));
                if pressed.is_some() && answered.is_none() && !echo {
                    answered = Some(Instant::now());
                }
            }
            Event::Snapshot(s) => {
                // `cllt market`: the tabs and Đang bán have come; with --tab its page is read next. Print them, then the
                // task (with --confirm) or log out.
                if let Some(tab) = market_tab.filter(|_| market_reading && !market_page_asked) {
                    if s.market.tabs.is_some()
                        && s.market.mine.is_some()
                        && s.market.doing.is_none()
                    {
                        market_page_asked = true;
                        manager.send(
                            id,
                            Command::Market(MarketTask::Page {
                                tab,
                                page: market_page,
                            }),
                        );
                    }
                }
                if market_reading
                    && s.market.tabs.is_some()
                    && s.market.mine.is_some()
                    && s.market.doing.is_none()
                    && market_tab.is_some() == s.market.page.is_some()
                {
                    market_reading = false;
                    market_lines(&s).iter().for_each(|l| println!("{l}"));
                    if let Some(p) = &s.market.page {
                        market_page_lines(p).iter().for_each(|l| println!("{l}"));
                    }
                    match &market_task {
                        Some(t) if confirm => {
                            manager.send(id, Command::Market(t.clone()));
                        }
                        Some(t) => {
                            println!("Sẽ làm: {t:?}; thêm --confirm để làm (đăng bán tốn phí)");
                            manager.send(id, Command::Logout);
                        }
                        None => {
                            manager.send(id, Command::Logout);
                        }
                    }
                }
                let done = if quest {
                    s.quest_run.as_ref().is_some_and(|r| r.done.is_some())
                } else {
                    s.job.as_ref().is_some_and(|j| j.done.is_some())
                };
                if fight && done {
                    println!("{}", line(&chosen[i].1, &s));
                    manager.send(id, Command::Logout);
                }
                // `cllt smith` logs out once its task ended, with the bag as it is then.
                if let (true, Some(run)) = (smith, s.smith.as_ref().filter(|r| r.done.is_some())) {
                    if snaps[i].smith.as_ref().is_none_or(|r| r.done.is_none()) {
                        println!(
                            "{}: {} lần, {} được, {} trượt",
                            run.title, run.steps, run.ok, run.failed
                        );
                        stones_and_gear(&s).iter().for_each(|l| println!("{l}"));
                        manager.send(id, Command::Logout);
                    }
                }
                if let (true, Some(zones)) = (zone && listing, &s.zones) {
                    listing = false;
                    let mut busy: Vec<_> = zones.iter().filter(|z| z.players > 0).collect();
                    busy.sort_by_key(|z| -z.players);
                    let busy: Vec<String> = busy
                        .iter()
                        .take(8)
                        .map(|z| format!("khu {} {}/{}", z.zone, z.players, z.capacity))
                        .collect();
                    println!(
                        "{} khu, {} người; đông nhất: {}; {} khu trống",
                        zones.len(),
                        zones.iter().map(|z| z.players).sum::<i32>(),
                        busy.join(", "),
                        zones.iter().filter(|z| z.players == 0).count()
                    );
                    match zone_to {
                        Some(z) => manager.send(id, Command::ChangeZone(z)),
                        None => manager.send(id, Command::Logout),
                    };
                }
                if let (true, Some(shop)) = (buy && shopping, &s.shop) {
                    shopping = false;
                    let name = |id: i32| {
                        book()
                            .get(id)
                            .map_or_else(|| format!("#{id}"), |d| d.name.clone())
                    };
                    let money = |c: u8| if c == 1 { "Xu khóa" } else { "Xu" };
                    for l in &shop.items {
                        println!(
                            "  ô {}: {} {} {}",
                            l.shop_id,
                            name(l.item_id),
                            l.price,
                            money(l.currency)
                        );
                    }
                    match shop
                        .items
                        .iter()
                        .find(|l| l.item_id == buy_item && l.currency == buy_currency)
                    {
                        Some(l) if confirm => {
                            manager.send(
                                id,
                                Command::Buy {
                                    shop_id: l.shop_id,
                                    quantity: buy_quantity,
                                },
                            );
                        }
                        Some(l) => {
                            println!(
                                "Chạy thử: sẽ mua {buy_quantity} {} ở ô {} giá {} {}; thêm --confirm để mua",
                                name(buy_item),
                                l.shop_id,
                                l.price as i64 * buy_quantity as i64,
                                money(l.currency)
                            );
                            manager.send(id, Command::Logout);
                        }
                        None => {
                            println!(
                                "Cửa hàng không bán {} bằng {}",
                                name(buy_item),
                                money(buy_currency)
                            );
                            manager.send(id, Command::Logout);
                        }
                    }
                }
                if skill
                    && upgrade.is_some()
                    && s.skill_levels != snaps[i].skill_levels
                    && !snaps[i].skills.is_empty()
                {
                    skills(&s).iter().for_each(|l| println!("{l}"));
                }
                snaps[i] = *s;
            }
        }
    }
    if failed {
        std::process::exit(1);
    }
}
