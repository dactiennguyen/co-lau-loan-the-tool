# Event và luồng giao tiếp của game

Đã ghi nhận 160 gói theo cặp hướng/opcode. Danh sách này trùng với catalog trong [src/protocol/events.ts](../../../src/protocol/events.ts); `test/docs.test.ts` kiểm hai bên khớp nhau. Bảng mã của app có 201 opcode, trong đó 85 opcode chưa từng thấy trên dây ([opcode-map](../opcode-map.md#unseen)). Trên dây chỉ có opcode số: các tên như `character_data` là nhãn phân tích. Đây là tập đã quan sát, chưa phải toàn bộ tính năng game.

Các phiên bắt gói (A1, B1, L1, Q2…) được mô tả ở [phương pháp điều tra](../investigation.md#nguồn-dữ-liệu). Byte, khung gói, key và XOR: [giao thức](../protocol.md). Field nhân vật/map: [dữ liệu nhân vật](../user-data.md).

## Trình tự vào game

```text
Mở TCP → nhận seed → gửi handshake
C→S: -1,1206,5 | người dùng bấm đăng nhập: 2,3,4 | lấy dữ liệu: 9,30,42,29,11,43
S→C: -1,1207,1209,5,2,3,4,9,30,42,29,11,43,1263
Heartbeat 1 và các push khác có thể xen giữa. Gói 0 là thông báo trong nhánh đã quan sát.
```

Gói 9 chứa prefix nhân vật; 29 chứa mapId; 11 chứa bản đồ/khu vực và các trường vị trí.

## Theo chủ đề

| Chủ đề | Tài liệu |
|---|---|
| Mở app, bắt tay, heartbeat | [01-boot](01-boot.md) |
| Đăng nhập, gói 0 khi account online nơi khác | [02-login](02-login.md) |
| Nhân vật, kỹ năng, vị trí, bản đồ, danh sách quái lúc vào map | [03-world](03-world.md) |
| Push cấu hình, người chơi, vật phẩm rơi (byte mẫu từng gói) | [04-push](04-push.md) |
| Đánh quái: chạm quái → `15` → `22` (bàn 8×8) → `18` → lặp `24` / `19` hoặc `14` / `19` hoặc `20` | [05-battle](05-battle.md) |
| Quái của map, toạ độ, đổi khu, code va chạm, đầu hàng | [06-map-mobs](06-map-mobs.md) |
| Đánh quái là online, server quyết định; luật rơi/lấp, thuật toán bot, trận mẫu | [07-auto-battle](07-auto-battle.md) |
| Danh sách máy chủ, 25 map (`c2s/11 "M99"`), 100 khu và số người (`c2s/1172`) | [08-server-map-zone](08-server-map-zone.md) |
| Di chuyển của mình, người chơi khác, chat Thế giới, vật phẩm rơi | [09-players-chat](09-players-chat.md) |
| Nhiệm vụ (`39`, `13`, `34`, `35`) và kết quả bot làm nhiệm vụ | [10-quests](10-quests.md) |
| Bảng chức năng: thư, bạn bè, xếp hạng, Bảo Điển, sứ quân | [11-panels](11-panels.md) |
| Kỹ năng (`1191`, bảng `30`), điểm tiềm năng, túi đồ (`42`, `1187`), mặc, cởi, vứt (`1186`, `37`, `83`), dùng (`84`, trong trận `44`), mua ở Lái Buôn (`57`, `1190`), sửa đồ (`48`), x2 EXP (đuôi `9`), luật trong Cẩm nang | [12-skills-items](12-skills-items.md) |
| Đồ rơi, nhặt đồ (`1188`), bảng vật phẩm và mã chỉ số của game | [13-drops-items](13-drops-items.md) |
| NPC: hộp thoại của 20 NPC (`13`, `57`), Hương Lão, Chợ trời (`1192`), `s2c/0` là thông báo chung | [14-npc](14-npc.md) |
| Cửa hàng NPC: 14 cửa hàng, 193 dòng hàng với giá, bản ghi 33 và 49 byte (`1190`), mua bằng Xu, Xu khóa, Lượng, Đổi lượng, đồ khoá giao dịch | [15-shops](15-shops.md) |
| Pháp sư: nâng cấp thường và cẩn thận (`96`, `97`, `90`, `1258`, `91`), tỉ lệ và phí, thất bại, bùa, luyện đá (`99`, `92`, `93`), tách đá, chuyển hoá (`1260`), chế tạo, túi đầy, kết quả bấm thật | [16-upgrade](16-upgrade.md) |
| Bạch Hổ Thống Lĩnh (boss thế giới): luật trong Cẩm nang, bảng công trạng `c2s/1252` (rỗng) và `s2c/1252` đọc từ code native | [17-bach-ho](17-bach-ho.md) |
| Mọi gói client gửi được: hàm dựng, opcode, kiểu từng trường | [c2s-builders](../c2s-builders.md) |

## Danh sách gói

| Gói | Nhãn phân tích | Nhóm | Dữ liệu |
|---|---|---|---|
| c2s/-1 | key_request | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#c2s-minus1) |
| s2c/-1 | key_exchange | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#s2c-minus1) |
| c2s/1206 | client_info | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#c2s-1206) |
| s2c/1207 | server_list | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#s2c-1207) |
| s2c/1209 | server_flag | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#s2c-1209) |
| c2s/5 | notice_request | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#c2s-5) |
| s2c/5 | notification | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#s2c-5) |
| c2s/1 | heartbeat_request | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#c2s-1) |
| s2c/1 | heartbeat_response | boot | [Byte, bố cục, nguồn quan sát](01-boot.md#s2c-1) |
| s2c/0 | server_message | login | [Byte, bố cục, nguồn quan sát](02-login.md#s2c-0) |
| c2s/2 | login_begin | login | [Byte, bố cục, nguồn quan sát](02-login.md#c2s-2) |
| s2c/2 | login_gate | login | [Byte, bố cục, nguồn quan sát](02-login.md#s2c-2) |
| c2s/3 | challenge_request | login | [Byte, bố cục, nguồn quan sát](02-login.md#c2s-3) |
| s2c/3 | password_challenge | login | [Byte, bố cục, nguồn quan sát](02-login.md#s2c-3) |
| c2s/4 | credentials | login | [Byte, bố cục, nguồn quan sát](02-login.md#c2s-4) |
| s2c/4 | authentication_ack | login | [Byte, bố cục, nguồn quan sát](02-login.md#s2c-4) |
| c2s/9 | character_request | world | [Byte, bố cục, nguồn quan sát](03-world.md#c2s-9) |
| s2c/8 | character_create_options | login | [Nick chưa có nhân vật](02-login.md#s2c-8) |
| s2c/9 | character_data | world | [Byte, bố cục, nguồn quan sát](03-world.md#s2c-9) |
| c2s/30 | skills_request | world | [Byte, bố cục, nguồn quan sát](03-world.md#c2s-30) |
| s2c/30 | skills_data | world | [Byte, bố cục, nguồn quan sát](03-world.md#s2c-30) |
| c2s/42 | character_extra_request | world | [Byte, bố cục, nguồn quan sát](03-world.md#c2s-42) |
| s2c/42 | character_extra | world | [Byte, bố cục, nguồn quan sát](03-world.md#s2c-42) |
| c2s/29 | location_request | world | [Byte, bố cục, nguồn quan sát](03-world.md#c2s-29) |
| s2c/29 | character_location | world | [Byte, bố cục, nguồn quan sát](03-world.md#s2c-29) |
| c2s/11 | map_request | world | [Byte, bố cục, nguồn quan sát](03-world.md#c2s-11) |
| s2c/11 | map_data | world | [Byte, bố cục, nguồn quan sát](03-world.md#s2c-11) |
| c2s/43 | entities_request | world | [Byte, bố cục, nguồn quan sát](03-world.md#c2s-43) |
| s2c/43 | entities_data | world | [Byte, bố cục, nguồn quan sát](03-world.md#s2c-43) |
| c2s/1169 | player_move | world | [Di chuyển của mình](09-players-chat.md#own-move) |
| c2s/1173 | change_zone | world | [Đổi khu vực](06-map-mobs.md#đổi-khu-vực-trong-cùng-map) |
| c2s/1174 | say | world | [Nói trong khu](09-players-chat.md#c2s-1174) |
| s2c/13 | zone_changed | world | [Đổi khu vực](06-map-mobs.md#đổi-khu-vực-trong-cùng-map), [qua cổng](10-quests.md#cổng) |
| c2s/1172 | zone_list_request | world | [Khu vực và số người](08-server-map-zone.md#zone-list) |
| s2c/1172 | zone_list | world | [Khu vực và số người](08-server-map-zone.md#zone-list) |
| c2s/13 | npc_talk | world | [Gói nhiệm vụ](10-quests.md#c2s-13) |
| c2s/10 | add_stat_point | world | [Gói khác thấy trong L1](09-players-chat.md#gói-khác-thấy-trong-l1-người-chơi-tự-bấm-trên-máy), [điểm tiềm năng](12-skills-items.md#điểm-tiềm-năng) |
| c2s/1191 | skill_upgrade | world | [Nâng cấp kỹ năng](12-skills-items.md#c2s-1191) |
| c2s/1188 | pickup_item | world | [Nhặt đồ](13-drops-items.md#c2s-1188) |
| c2s/48 | repair_item | world | [Sửa đồ](12-skills-items.md#c2s-48) |
| c2s/1186 | equip_item | world | [Mặc và cởi đồ](12-skills-items.md#c2s-1186) |
| c2s/1257 | bag_sort | world | [Sắp xếp túi](12-skills-items.md#sắp-xếp) |
| c2s/84 | use_item | world | [Dùng vật phẩm](12-skills-items.md#c2s-84) |
| s2c/57 | npc_menu | world | [Hộp thoại NPC](14-npc.md#hộp-thoại), [Mua ở Lái Buôn](12-skills-items.md#c2s-1190), [Bước Tỷ thí](10-quests.md#tỷ-thí) |
| c2s/57 | npc_menu_choice | world | [Hộp thoại NPC](14-npc.md#hộp-thoại), [Mua ở Lái Buôn](12-skills-items.md#c2s-1190), [Bước Tỷ thí](10-quests.md#tỷ-thí) |
| s2c/1190 | shop_list | world | [Mua ở Lái Buôn](12-skills-items.md#c2s-1190), [14 cửa hàng](15-shops.md) |
| s2c/1111 | empty_ack | world | [Sắp xếp túi](12-skills-items.md#sắp-xếp), [Bước Tỷ thí](10-quests.md#tỷ-thí) |
| s2c/1180 | duel_invite | world | [Bước Tỷ thí](10-quests.md#s2c-1180) |
| c2s/1181 | duel_challenge | world | [Bước Tỷ thí](10-quests.md#s2c-1180) |
| c2s/1190 | shop_buy | world | [Mua ở Lái Buôn](12-skills-items.md#c2s-1190), [mua ở mọi cửa hàng](15-shops.md#mua) |
| s2c/96 | service_window | world | [Các cửa sổ của Pháp sư](16-upgrade.md#cửa-sổ) |
| s2c/99 | craft_window | world | [Các cửa sổ của Pháp sư](16-upgrade.md#cửa-sổ) |
| c2s/97 | service_put | world | [Nâng cấp](16-upgrade.md#gói) |
| s2c/90 | service_slot | world | [Nâng cấp](16-upgrade.md#gói) |
| s2c/1258 | service_preview | world | [Nâng cấp](16-upgrade.md#gói) |
| s2c/92 | stone_slot | world | [Luyện đá](16-upgrade.md#luyện-đá) |
| s2c/93 | stone_result | world | [Luyện đá](16-upgrade.md#luyện-đá), [kết quả J3](16-upgrade.md#j3) |
| s2c/1260 | transmute_target | world | [Chuyển hoá](16-upgrade.md#chuyển-hoá) |
| c2s/91 | service_start | world | [Nâng cấp](16-upgrade.md#gói) |
| s2c/91 | service_result | world | [Nâng cấp](16-upgrade.md#gói) |
| s2c/1192 | market | world | [Ngọc Nga](14-npc.md#ngọc-nga) |
| c2s/116 | market_tabs_request | world | [Cửa sổ Chợ trời](14-npc.md#cửa-sổ-chợ-trời) |
| s2c/116 | market_tabs | world | [Cửa sổ Chợ trời](14-npc.md#cửa-sổ-chợ-trời) |
| c2s/1192 | market_page | world | [Cửa sổ Chợ trời](14-npc.md#cửa-sổ-chợ-trời) |
| c2s/115 | market_buy | world | [Mua](14-npc.md#mua) |
| s2c/115 | market_bought | world | [Mua](14-npc.md#mua) |
| c2s/112 | market_sell | world | [Đăng bán](14-npc.md#đăng-bán) |
| s2c/112 | market_listed | world | [Đăng bán](14-npc.md#đăng-bán) |
| c2s/113 | market_withdraw | world | [Thu hồi](14-npc.md#thu-hồi) |
| s2c/113 | market_withdrawn | world | [Thu hồi](14-npc.md#thu-hồi) |
| s2c/1224 | gift_code_prompt | world | [Hương Lão](14-npc.md#hương-lão) |
| c2s/44 | battle_use_item | battle | [Dùng vật phẩm trong trận](12-skills-items.md#c2s-44) |
| s2c/44 | battle_item_result | battle | [Dùng vật phẩm trong trận](12-skills-items.md#c2s-44) |
| c2s/1215 | mail_request | world | [Các bảng chức năng](11-panels.md) |
| s2c/1215 | mail_list | world | [Hòm thư](14-npc.md#hòm-thư) |
| c2s/1216 | mail_open | world | [Hòm thư](14-npc.md#hòm-thư) |
| s2c/1216 | mail_body | world | [Hòm thư](14-npc.md#hòm-thư) |
| c2s/1217 | mail_claim | world | [Hòm thư](14-npc.md#hòm-thư) |
| s2c/1217 | mail_claimed | world | [Hòm thư](14-npc.md#hòm-thư) |
| c2s/1218 | mail_claim_all | world | [Hòm thư](14-npc.md#hòm-thư) |
| c2s/1219 | mail_delete | world | [Hòm thư](14-npc.md#hòm-thư) |
| s2c/1219 | mail_deleted | world | [Hòm thư](14-npc.md#hòm-thư) |
| c2s/1221 | mail_delete_all | world | [Hòm thư](14-npc.md#hòm-thư) |
| s2c/1222 | mail_new | world | [Mã quà tặng](14-npc.md#mã-quà-tặng) |
| c2s/1223 | gift_code | world | [Mã quà tặng](14-npc.md#mã-quà-tặng) |
| s2c/1223 | gift_code_result | world | [Mã quà tặng](14-npc.md#mã-quà-tặng) |
| c2s/1196 | friends_request | world | [Các bảng chức năng](11-panels.md) |
| s2c/1196 | friend_list | world | [Các bảng chức năng](11-panels.md) |
| c2s/1252 | bach_ho_board_request | world | [Bạch Hổ](17-bach-ho.md#gói) |
| s2c/1252 | bach_ho_board | world | [Bạch Hổ](17-bach-ho.md#gói) |
| c2s/1254 | ranking_request | world | [Bảng xếp hạng](11-panels.md#s2c-1254) |
| s2c/1254 | ranking | world | [Bảng xếp hạng](11-panels.md#s2c-1254) |
| c2s/1240 | season_request | world | [Các bảng chức năng](11-panels.md) |
| s2c/1240 | season_info | world | [Các bảng chức năng](11-panels.md) |
| c2s/1241 | season_quests_request | world | [Các bảng chức năng](11-panels.md) |
| s2c/1241 | season_quests | world | [Các bảng chức năng](11-panels.md) |
| c2s/1265 | faction_request | world | [Các bảng chức năng](11-panels.md) |
| c2s/15 | challenge_mob | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-15) |
| s2c/22 | battle_setup | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#s2c-22) |
| c2s/18 | battle_join | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-18) |
| s2c/18 | battle_join_ack | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-18) |
| s2c/24 | turn_state | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#s2c-24) |
| c2s/14 | battle_step_request | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-14) |
| c2s/19 | swap_pieces | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-19) |
| s2c/19 | move_result | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#s2c-19) |
| s2c/20 | skill_result | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#s2c-20) |
| c2s/20 | use_skill | battle | [Kỹ năng của người chơi](05-battle.md#c2s-20) |
| s2c/21 | timed_attack | battle | [Trận tính giờ](05-battle.md#trận-tính-giờ) |
| c2s/1178 | challenge_boss | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-1178) |
| c2s/40 | battle_leave | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-40) |
| s2c/36 | durability | battle | [Bố cục 8 ô trang bị](05-battle.md#s2c-36) |
| s2c/1214 | battle_end_1214 | battle | [Byte, bố cục, nguồn quan sát](05-battle.md#battle-end) |
| s2c/1259 | config_1259 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1259) |
| s2c/1265 | faction | push | [Byte lúc đăng nhập](04-push.md#s2c-1265), [bảng Sứ quân](11-panels.md) |
| s2c/1269 | config_1269 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1269) |
| s2c/1271 | social_links | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1271) |
| s2c/1272 | config_1272 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1272) |
| s2c/1279 | signal_1279 | push | [APK 1.1.0](../apk-1.1.0.md#s2c1279-và-s2c1284-lúc-vào-thế-giới) |
| s2c/1274 | config_1274 | push | [Vào game VG1](02-login.md#vg1) |
| c2s/1282 | device_signals | world | [APK 1.1.0](../apk-1.1.0.md#c2s1282-trạng-thái-máy-chống-bot), [VG1](02-login.md#vg1) |
| c2s/1284 | chat_block | world | [Chặn chat](09-players-chat.md#chặn-chat-và-báo-cáo) |
| c2s/1285 | report_player | world | [Báo cáo người chơi](09-players-chat.md#chặn-chat-và-báo-cáo) |
| s2c/1284 | chat_block_list | world | [Chặn chat](09-players-chat.md#chặn-chat-và-báo-cáo) |
| s2c/1285 | report_result | world | [Báo cáo người chơi](09-players-chat.md#chặn-chat-và-báo-cáo) |
| c2s/1275 | request_1275 | world | [APK 1.1.0](../apk-1.1.0.md#gói-mới-và-gói-bị-bỏ) |
| c2s/1277 | request_1277 | world | [APK 1.1.0](../apk-1.1.0.md#gói-mới-và-gói-bị-bỏ) |
| c2s/1281 | request_1281 | world | [APK 1.1.0](../apk-1.1.0.md#gói-mới-và-gói-bị-bỏ) |
| s2c/46 | currency_notice | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-46) |
| s2c/10 | character_stats | push | [Byte, bố cục, nguồn quan sát](05-battle.md#c2s-40) |
| s2c/1187 | inventory | push | [Túi đồ và bản ghi vật phẩm](12-skills-items.md#túi-đồ) |
| s2c/1191 | skill_points | push | [Nâng cấp kỹ năng](12-skills-items.md#c2s-1191) |
| s2c/48 | repair_ack | push | [Sửa đồ](12-skills-items.md#c2s-48) |
| s2c/37 | gear_update | push | [Mặc và cởi đồ](12-skills-items.md#c2s-1186) |
| s2c/1186 | equip_result | push | [Mặc và cởi đồ](12-skills-items.md#c2s-1186) |
| s2c/51 | bag_slot_add | push | [Nhặt vào túi (K3)](13-drops-items.md#k3) |
| s2c/84 | item_used | push | [Dùng Tăng Kinh Nghiệm](12-skills-items.md#dùng-tăng-kinh-nghiệm-u2) |
| s2c/83 | bag_slot_count | push | [Vứt bỏ](12-skills-items.md#vứt-bỏ), [dùng trong trận](12-skills-items.md#c2s-44) |
| s2c/1256 | notice_1256 | push | [Thua trận mất EXP](10-quests.md#kết-quả-q3-q4), [cổng chưa mở](06-map-mobs.md#atlas), [nhặt đồ](13-drops-items.md#p3), [nhặt không được](13-drops-items.md#k3) |
| s2c/1201 | step_progress | push | [Lên cấp trong bot](10-quests.md#kết-quả-q3-q4) |
| s2c/1200 | signal_1200 | push | [Gói mới thấy trong bot](07-auto-battle.md#các-gói-mới-thấy-trong-bot) |
| s2c/39 | quest_data | push | [Nhiệm vụ đang làm](10-quests.md#s2c-39) |
| s2c/34 | quest_progress | push | [Gói nhiệm vụ](10-quests.md#c2s-13) |
| s2c/35 | quest_complete | push | [Gói nhiệm vụ](10-quests.md#c2s-13) |
| s2c/1261 | counter_1261 | push | [Gói định kỳ trong bot](10-quests.md#kết-quả-q2) |
| s2c/1195 | daily_quest | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1195) |
| s2c/1220 | mail_unread | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1220) |
| s2c/1177 | map_boss | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1177) |
| s2c/1263 | players_snapshot | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1263) |
| s2c/1262 | player_positions | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1262) |
| s2c/1253 | player_hp | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1253) |
| s2c/1184 | ground_items | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1184) |
| s2c/1182 | ground_item_add | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1182) |
| s2c/1183 | ground_item_remove | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1183) |
| s2c/1170 | player_leave | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1170) |
| s2c/1167 | player_enter | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1167) |
| s2c/1166 | player_gear | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1166) |
| s2c/1212 | player_status | push | [Hiệu ứng người chơi](09-players-chat.md#s2c-1212) |
| s2c/1205 | world_chat | push | [Chat](09-players-chat.md#chat) |
| s2c/1174 | player_say | push | [Nói trong khu](09-players-chat.md#c2s-1174) |
| s2c/45 | boss_broadcast | push | [Thông báo boss](06-map-mobs.md#thông-báo-boss-s2c45), [boss theo map](08-server-map-zone.md#25-map) |

C→S và S→C là hướng truyền trên cùng socket. Thứ tự push/kích thước có thể đổi theo trạng thái thế giới; không dùng nguyên byte của phiên cũ làm giá trị cố định cho phiên mới.
