# Event và luồng giao tiếp của game

Đã ghi nhận 47 gói theo cặp hướng/opcode. Trên dây không có tên event string gốc được xác minh; các tên như character_data chỉ là nhãn phân tích. Đây là tập đã quan sát, chưa phải toàn bộ tính năng game.

## Trình tự vào game

```text
Mở TCP → nhận seed → gửi handshake
C→S: -1,1206,5 | người dùng bấm đăng nhập: 2,3,4 | lấy dữ liệu: 9,30,42,29,11,43
S→C: -1,1207,1209,5,2,3,4,9,30,42,29,11,43,1263
Heartbeat 1 và các push khác có thể xen giữa. Gói 0 là thông báo trong nhánh đã quan sát.
```

Gói 9 chứa prefix nhân vật; 29 chứa mapId; 11 chứa bản đồ/khu vực và các trường vị trí. [Bảng dữ liệu nhân vật](../user-data.md), [framing/key/XOR](../protocol.md), [cách thu và kiểm chứng](../investigation.md).

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
| s2c/1259 | config_1259 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1259) |
| s2c/1265 | config_1265 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1265) |
| s2c/1269 | config_1269 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1269) |
| s2c/1271 | social_links | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1271) |
| s2c/1272 | config_1272 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1272) |
| s2c/46 | currency_notice | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-46) |
| s2c/39 | quest_data | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-39) |
| s2c/1195 | flag_1195 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1195) |
| s2c/1220 | flag_1220 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1220) |
| s2c/1177 | map_special_entity | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1177) |
| s2c/1263 | players_snapshot | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1263) |
| s2c/1262 | entity_updates | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1262) |
| s2c/1253 | update_1253 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1253) |
| s2c/1184 | update_1184 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1184) |
| s2c/1182 | entity_1182 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1182) |
| s2c/1183 | entity_1183 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1183) |
| s2c/1170 | update_1170 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1170) |
| s2c/1167 | entity_1167 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1167) |
| s2c/1166 | update_1166 | push | [Byte, bố cục, nguồn quan sát](04-push.md#s2c-1166) |

C→S và S→C là hướng truyền trên cùng socket. Thứ tự push/kích thước có thể đổi theo trạng thái thế giới; không dùng nguyên byte của phiên cũ làm giá trị cố định cho phiên mới.
