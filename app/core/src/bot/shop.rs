//! Cửa hàng: the Dược phẩm shop of Lái Buôn.
use super::*;

/// The Dược phẩm shop of Lái Buôn (12-skills-items.md#c2s-1190): c2s/13 to him, c2s/57 for Dược phẩm, and s2c/1190 lists
/// it; c2s/1190 buys a line, and the server answers with a notice, then the bag (s2c/42) and the money (s2c/46).
impl Bot {
    /// "Đi tới Làng Thanh Khê" of the Cửa hàng: Đổi map to M1. With `back` ("Mua xong quay về chỗ cũ") it keeps the map
    /// and zone it starts from, to walk back there once the dialog is closed (shop_closed). Nothing is kept without
    /// `back`, or when the trip is refused (busy, already on M1, no known way).
    pub fn go_to_shop(&mut self, back: bool, now: Instant, out: &mut Vec<Out>) {
        let from = ShopBack {
            map_id: self.snap.map_id.clone(),
            name: self.snap.map_name.clone(),
            zone: self.snap.zone,
            closed: false,
        };
        self.shop_back = None;
        self.go_to(SELLER.0, now, out);
        if back && self.trip.is_some() {
            let line = format!("Mua xong sẽ quay về {} khu {}", from.name, from.zone);
            out.push(Out::Log(LogKind::Travel, line));
            self.shop_back = Some(from);
        }
    }

    /// The Cửa hàng dialog was closed, however (Đóng, ✕, Esc): after a trip to the shop with "Mua xong quay về chỗ cũ",
    /// the bot walks back as soon as nothing waits (walk_back).
    pub fn shop_closed(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(b) = &mut self.shop_back {
            b.closed = true;
        }
        self.walk_back(now, out);
    }

    /// Mua xong quay về chỗ cũ: once the dialog is closed and nothing waits for the server (the trip to the shop, a step
    /// of the shop such as a purchase, a portal, a zone change, a battle), Đổi map back to the map the trip started
    /// from, then the zone it was in (trip_next). Let go, with the reason in the log, once a job or quest run started.
    /// Called after every packet and timer.
    pub(super) fn walk_back(&mut self, now: Instant, out: &mut Vec<Out>) {
        if !self.shop_back.as_ref().is_some_and(|b| b.closed)
            || self.trip.is_some()
            || self.travelling.is_some()
            || self.zoning.is_some()
            || self.shopping.is_some()
            || self.battle.is_some()
        {
            return;
        }
        let Some(b) = self.shop_back.take() else {
            return;
        };
        if let Some(why) = self.busy() {
            let line = format!("Không quay về {} khu {}: {why}", b.name, b.zone);
            return out.push(Out::Log(LogKind::Travel, line));
        }
        let line = format!("Quay về {} khu {} sau khi mua", b.name, b.zone);
        out.push(Out::Log(LogKind::Travel, line));
        if self.snap.map_id != b.map_id {
            self.go_to(&b.map_id, now, out);
            if self.trip.is_some() {
                self.zone_after = Some(b.zone);
            }
        } else if self.snap.zone != b.zone {
            self.change_zone(b.zone, now, out);
        }
    }

    /// Why the shop cannot be used now: busy, a step of it waiting, or away from M1.
    pub(super) fn shop_refusal(&self) -> Option<String> {
        self.busy().map(String::from).or_else(|| {
            if self.shopping.is_some() {
                Some("đang đợi Lái Buôn trả lời".into())
            } else if self.snap.map_id != SELLER.0 {
                Some("Lái Buôn ở Làng Thanh Khê (M1), hãy sang M1 trước".into())
            } else {
                None
            }
        })
    }

    /// Opens the shop: c2s/13 to Lái Buôn, then c2s/57 when his menu comes. Refused, with the reason in the log and
    /// nothing sent, while busy, while a step of the shop waits, and away from M1.
    pub fn open_shop(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(why) = self.shop_refusal() {
            return out.push(Out::Log(LogKind::Item, format!("Chưa mở cửa hàng: {why}")));
        }
        out.push(Out::Log(
            LogKind::Item,
            format!("Mở cửa hàng Lái Buôn ({SELLER_MENU})"),
        ));
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(SELLER.0),
                npc_id: Some(SELLER.1),
                ..Ctx::default()
            },
        );
        self.shopping = Some((Shopping::Talk, now + SHOP_WAIT));
    }

    /// Buys `quantity` of the shop line `shop_id` (c2s/1190). Refused as open_shop is, and before the shop is open, for
    /// a line it does not have, a count under 1, or without the money for it. There is no upper bound: the money is.
    pub fn buy(&mut self, shop_id: i32, quantity: i32, now: Instant, out: &mut Vec<Out>) {
        let line = self
            .snap
            .shop
            .as_ref()
            .and_then(|s| s.items.iter().find(|i| i.shop_id == shop_id))
            .cloned();
        let name = line.as_ref().map_or_else(
            || format!("ô {shop_id}"),
            |l| {
                book()
                    .get(l.item_id)
                    .map_or_else(|| format!("#{}", l.item_id), |d| d.name.clone())
            },
        );
        let locked = line.as_ref().is_some_and(|l| l.currency == 1);
        let money = if locked { "Xu khóa" } else { "Xu" };
        let cost = line
            .as_ref()
            .map_or(0, |l| l.price as i64 * quantity as i64);
        let have = self
            .snap
            .currencies
            .as_ref()
            .map(|c| if locked { c.xu_khoa } else { c.xu });
        let why = self.shop_refusal().or_else(|| {
            if self.snap.shop.is_none() {
                Some("mở cửa hàng trước".into())
            } else if line.is_none() {
                Some("cửa hàng không có ô này".into())
            } else if quantity < 1 {
                Some("số lượng phải từ 1 trở lên".into())
            } else {
                have.filter(|&h| cost > h)
                    .map(|h| format!("không đủ {money} (cần {cost}, có {h})"))
            }
        });
        if let Some(why) = why {
            return out.push(Out::Log(LogKind::Item, format!("Chưa mua {name}: {why}")));
        }
        let cost = format!("{cost} {money}");
        out.push(Out::Log(
            LogKind::Item,
            format!("Mua {quantity} {name} giá {cost}"),
        ));
        Self::send(
            out,
            1190,
            Ctx {
                shop_id: Some(shop_id),
                quantity: Some(quantity),
                ..Ctx::default()
            },
        );
        self.shopping = Some((
            Shopping::Buy {
                name,
                quantity,
                cost,
            },
            now + SHOP_WAIT,
        ));
    }
}
