// Headless counterpart of the desktop app, for checks against the live server:
//   cllt status                                       log in every account, print its status, log out
//   cllt fight --account=NAME --target="X" --count=N [--max-losses=1] [--auto-repair]
//   cllt quest --account=NAME [--max-losses=1] [--auto-repair]
//                                                       "Tự làm nhiệm vụ" until it stops, then log out; --auto-repair
//                                                       turns on Tự sửa đồ for the run (uses the hammers of the bag)
//   cllt skill --account=NAME [--id=1001]               print the skill tree; with --id, Nâng cấp that skill once
//                                                       (c2s/1191, spends skill points), print the tree again
//   cllt item --account=NAME [--equip=SLOT | --unequip=SLOT | --use=SLOT | --repair=SLOT]
//                                                       print gear, bag and stats; with a button, press it once (bag
//                                                       slots for equip and use, gear slots for unequip and repair)
//   cllt zone --account=NAME [--zone=4]                 print the zones of the map (c2s/1172); with --zone, move there
//   cllt goto --account=NAME --map=M1                   walk through portals to that map ("Đổi map")
//   cllt buy --account=NAME [--item=2] [--pay=khoa|xu] [--qty=1] [--confirm]
//                                                       open the Dược phẩm shop of Lái Buôn (on M1) and print it; with
//                                                       --confirm buy that item (2 Búa Sửa Chữa), which spends money
// Accounts: --accounts=FILE, else accounts.json of app/, else CLLT_USERNAME/CLLT_PASSWORD of the repository .env;
// --account=NAME also finds the one of .env when the file lacks it.
// Passwords are never printed.
use cllt_core::accounts::{self, Account};
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::bot::{ItemAct, Snapshot};
use cllt_core::items::book;
use cllt_core::net::{Command, ConnState, Event, Manager};
use cllt_core::skills::skill_tree;
use std::sync::mpsc;
use std::time::{Duration, Instant};

fn load(path: Option<String>) -> Vec<Account> {
    let file = path
        .map(Into::into)
        .or_else(|| find_upwards("app/accounts.json"))
        .or_else(|| find_upwards("accounts.json"));
    match file {
        Some(f) => accounts::load(&f).unwrap_or_else(|e| panic!("{e}")),
        None => find_upwards(".env")
            .and_then(|p| accounts::from_env(&p))
            .into_iter()
            .collect(),
    }
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
            q.current + 1,
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
        .or_else(|| slot("repair").map(ItemAct::Repair));
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
    let chosen: Vec<(u64, Account)> = if fight || skill || item || zone || goto || buy {
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
    // Tự sửa đồ for this run, as when ticked in the Cài đặt tab; accounts.json is left as it is.
    let auto_repair = args.iter().any(|a| a == "--auto-repair");
    for (id, a) in &chosen {
        let mut a = a.clone();
        a.fight.repair |= auto_repair && fight;
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
            Event::Battle(_) => {}
            Event::Log(_, text) => {
                println!("{}: {text}", chosen[i].1.username);
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
                // Bot::item echoes the button ("Mặc Áo Hào Kiệt (ô túi 3)"); the next line is its refusal, the answer
                // ("Đã mặc …") or a notice of the server.
                let echo = ["Mặc ", "Cởi ", "Dùng ", "Sửa "]
                    .iter()
                    .any(|v| text.starts_with(v));
                if pressed.is_some() && answered.is_none() && !echo {
                    answered = Some(Instant::now());
                }
            }
            Event::Snapshot(s) => {
                let done = if quest {
                    s.quest_run.as_ref().is_some_and(|r| r.done.is_some())
                } else {
                    s.job.as_ref().is_some_and(|j| j.done.is_some())
                };
                if fight && done {
                    println!("{}", line(&chosen[i].1, &s));
                    manager.send(id, Command::Logout);
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
