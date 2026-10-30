// Headless counterpart of the desktop app, for checks against the live server:
//   cllt status                                       log in every account, print its status, log out
//   cllt fight --account=NAME --target="X" --count=N [--max-losses=1]
// Accounts: --accounts=FILE, else accounts.json of app/, else CLLT_USERNAME/CLLT_PASSWORD of the repository .env.
// Passwords are never printed.
use cllt_core::accounts::{self, Account};
use cllt_core::atlas::{find_upwards, Atlas};
use cllt_core::bot::Snapshot;
use cllt_core::net::{Command, ConnState, Event, Manager};
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
    format!(
        "{}: {} cấp {} HP {}/{}{exp} | {} {} khu {}, {} người khác | {}",
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

    let fight = args.first().map(String::as_str) == Some("fight");
    let chosen: Vec<(u64, Account)> = if fight {
        let name = arg("account").unwrap_or_else(|| all[0].username.clone());
        all.iter()
            .filter(|a| a.username == name || a.label == name)
            .take(1)
            .map(|a| (0, a.clone()))
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
    while ended < chosen.len() {
        let Ok((id, event)) = rx.recv_timeout(Duration::from_millis(200)) else {
            // A moment after the login the bosses (s2c/1177) have come too.
            for (i, at) in online.iter_mut().enumerate() {
                if at.is_some_and(|t| t.elapsed() > Duration::from_millis(1500)) {
                    *at = None;
                    if fight && !started {
                        started = true;
                        let target = arg("target").unwrap_or_default();
                        let count = arg("count").and_then(|v| v.parse().ok()).unwrap_or(1);
                        let max_losses =
                            arg("max-losses").and_then(|v| v.parse().ok()).unwrap_or(1);
                        println!("{}", line(&chosen[i].1, &snaps[i]));
                        manager.send(
                            i as u64,
                            Command::Fight {
                                target,
                                count,
                                max_losses,
                            },
                        );
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
            Event::Log(text) => println!("{}: {text}", chosen[i].1.username),
            Event::Snapshot(s) => {
                if fight && s.job.as_ref().is_some_and(|j| j.done.is_some()) {
                    println!("{}", line(&chosen[i].1, &s));
                    manager.send(id, Command::Logout);
                }
                snaps[i] = *s;
            }
        }
    }
    if failed {
        std::process::exit(1);
    }
}
