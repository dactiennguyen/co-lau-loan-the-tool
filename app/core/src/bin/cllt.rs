// Headless counterpart of the desktop app, for checks against the live server:
//   cllt status                                       log in every account, print its status, log out
//   cllt fight --account=NAME --target="X" --count=N [--max-losses=1]
//   cllt quest --account=NAME [--max-losses=1]          "Tự làm nhiệm vụ" until it stops, then log out
//   cllt skill --account=NAME [--id=1001]               print the skill tree; with --id, Nâng cấp that skill once
//                                                       (c2s/1191, spends skill points), print the tree again
//   cllt item --account=NAME [--equip=SLOT | --unequip=SLOT | --use=SLOT | --repair=SLOT]
//                                                       print gear, bag and stats; with a button, press it once (bag
//                                                       slots for equip and use, gear slots for unequip and repair)
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
    let fight = command == Some("fight") || quest;
    let chosen: Vec<(u64, Account)> = if fight || skill || item {
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
    for (id, a) in &chosen {
        manager.login(*id, a.clone());
    }
    let mut snaps: Vec<Snapshot> = vec![Snapshot::default(); chosen.len()];
    let mut online: Vec<Option<Instant>> = vec![None; chosen.len()];
    let (mut ended, mut started, mut failed) = (0, false, false);
    // When the Nâng cấp went out; the session logs out on its answer, or 10 s later without one.
    let mut upgrading: Option<Instant> = None;
    // When the item button went out, and when its answer came: gear and bag are printed a second later (s2c/10, s2c/37
    // and s2c/42 come with it), or 10 s after the button without an answer.
    let (mut pressed, mut answered): (Option<Instant>, Option<Instant>) = (None, None);
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
            if upgrading.is_some_and(|t| t.elapsed() > Duration::from_secs(10)) {
                upgrading = None;
                println!("Server không trả lời lần nâng cấp sau 10 s");
                manager.send(0, Command::Logout);
            }
            // A moment after the login the bosses (s2c/1177) have come too.
            for (i, at) in online.iter_mut().enumerate() {
                if at.is_some_and(|t| t.elapsed() > Duration::from_millis(1500)) {
                    *at = None;
                    if item {
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
            Event::Log(text) => {
                println!("{}: {text}", chosen[i].1.username);
                // Bot::upgrade_skill refused it, or s2c/1191 answered it.
                if upgrading.is_some()
                    && (text.starts_with("Chưa nâng") || text.starts_with("Đã nâng"))
                {
                    upgrading = None;
                    manager.send(id, Command::Logout);
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
