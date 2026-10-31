//! Cửa hàng: the Dược phẩm shop of Lái Buôn.
use super::*;

/// The Dược phẩm shop of Lái Buôn (12-skills-items.md#c2s-1190): c2s/13 to him, c2s/57 for Dược phẩm, and s2c/1190 lists
/// it; c2s/1190 buys a line, and the server answers with a notice, then the bag (s2c/42) and the money (s2c/46).
impl Bot {
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
