import test from 'node:test';
import { np1Packets } from './fixtures-np1.ts';
import assert from 'node:assert/strict';
import { buildRequest, decodeEvent } from '../src/protocol/events.ts';
import { Items } from '../src/protocol/items.ts';
import {
  normalizeCode, giftCodeRequest, mailList, mailBody, mailIdRequest, slotsNeeded, claimedCount, dailyAfter, dailyQuest, dailyTaken, dailyText,
} from '../src/protocol/mail.ts';
import { npcMenu } from '../src/protocol/world.ts';
import { GiftBot, MailBot, type MailTask } from '../src/bot/mail.ts';
import { DailyBot, type DailyTask } from '../src/bot/daily.ts';
import { Stop } from '../src/bot/steps.ts';
import { g1Packets as P } from './fixtures-g1.ts';
import { bag42, money46, scripted, type BagEntry, type Expect, type Reply } from './support/packets.ts';

const items = Items.load();
const hex = (key: string) => Buffer.from(P[key], 'hex');
const r = (op: number, key: string): Reply => [op, hex(key)];

test('the G1 packets read to their last byte; the bot sends the bytes the phone sent', () => {
  for (const key of Object.keys(P)) {
    const [direction, op] = key.split(' ')[0].split('/');
    assert.equal(decodeEvent(direction as 'c2s' | 's2c', Number(op), hex(key)).opaqueBytes, 0, key);
  }
  assert.equal(giftCodeRequest('ALPHATEST1').toString('hex'), P['c2s/1223 ALPHATEST1']);
  assert.equal(giftCodeRequest('  denbu  ').toString('hex'), P['c2s/1223 DENBU']);
  assert.equal(mailIdRequest(6280).toString('hex'), P['c2s/1216 6280']);
  assert.equal(buildRequest(1217, { mailId: 6280 }).toString('hex'), P['c2s/1216 6280']);
  assert.equal(buildRequest(1223, { code: 'denbu' }).toString('hex'), P['c2s/1223 DENBU']);
  assert.throws(() => buildRequest(1221), /not implemented/);
  assert.throws(() => normalizeCode('   '));
  assert.throws(() => normalizeCode('X'.repeat(33)));
});

test('the mailbox, a mail and its gift; the bag slots a gift needs', () => {
  const list = mailList(hex('s2c/1215 bốn thư mới')).mails;
  assert.deepEqual(list.map(m => [m.id, m.title, m.gift, m.taken, m.read]), [
    [6280, 'Quà Đền bù AlphaTest', true, false, false], [6278, 'Quà Alpha Test', true, false, false],
    [6273, 'Quà Alpha Test Ngày 1', true, false, false], [5118, 'Quà đạt cấp 20', true, false, false]]);
  const money = mailBody(hex('s2c/1216 6280 Đền bù'));
  assert.deepEqual(money.items.map(i => [i.itemId, i.quantity]), [[40, 5_000_000], [42, 10_000], [41, 5_000_000]]);
  const stack = (id: number) => items.get(id)?.stack ?? 1;
  assert.equal(slotsNeeded(money.items, [], stack), 0);
  // 6273 in G1: the bag had Búa, Hoàn Linh and Kim Đan locked; it went 18 → 22 items: Tăng Kinh Nghiệm and 3 Đá cấp 5.
  const day1 = mailBody(hex('s2c/1216 6273 Ngày 1')).items, locked = [2, 0, 1].map(itemId => ({ itemId, field1: 0 }));
  assert.equal(slotsNeeded(day1, locked, stack), 4);
  assert.equal(slotsNeeded(day1, locked.map(i => ({ ...i, field1: 1 })), stack), 7); // another lock: not known to stack
  assert.equal(slotsNeeded(mailBody(hex('s2c/1216 6278 Alpha Test')).items, [], stack), 8);
  assert.deepEqual(['Đã nhận quà của 2 thư', 'Đã nhận quà của 1 thư, rương đã đầy', 'Không có quà nào để nhận'].map(claimedCount), [2, 1, 0]);
});

test('s2c/1195 is the daily quest held; its menu says how many were taken today', () => {
  const q = dailyQuest(hex('s2c/1195 113 Nhặt xu')).quest!;
  assert.deepEqual([q.id, q.name, q.progress, q.target, dailyText(q)], [113, 'Nhặt xu', 0, 2050, 'Thu thập 0/2050 xu khóa từ đánh quái']);
  assert.equal(dailyQuest(hex('s2c/1195 không có')).quest, null);
  // Kind 3 is the progress alone, after a pickup that counts (NP1); dailyAfter puts it on the quest held.
  const moved = Buffer.from(np1Packets['s2c/1195 tiến độ 218/2100'], 'hex');
  assert.deepEqual(dailyQuest(moved), { kind: 3, quest: undefined, progress: 218, target: 2100 });
  assert.equal(dailyText(dailyAfter(q, dailyQuest(moved))!), 'Thu thập 218/2100 xu khóa từ đánh quái');
  assert.equal(dailyAfter(null, dailyQuest(moved)), null);
  assert.deepEqual(dailyTaken(npcMenu(hex('s2c/57 nhiệm vụ ngày 1/3 Hủy')).text), { taken: 1, max: 3 });
});

// ---------------------------------------------------------------------------------------------------------------------
// The bots against a server that answers each packet with what G1 got.

async function play<T>(bot: { onPacket(op: number, p: Buffer): void }, script: Expect[], run: (io: { send(op: number, p: Uint8Array): void }) => Promise<T>) {
  const s = scripted(script, (op, p) => bot.onPacket(op, p));
  let outcome: T | undefined, stop: string | undefined;
  try { outcome = await run(s.io); } catch (error) { if (!(error instanceof Stop)) throw error; stop = error.message; }
  return { ...s, outcome, stop };
}

test('gift codes: a good one brings its mail, a used and an unknown one count as refused in a row', async () => {
  const logs: Record<string, any>[] = [];
  const bot = new GiftBot({ codes: ['alphatest1', 'saima2026', '  denbu ', 'ALPHATEST1'], gapMs: 0, settleMs: 5, waitMs: 300, log: e => logs.push(e) });
  assert.deepEqual(bot.codes, ['ALPHATEST1', 'SAIMA2026', 'DENBU']);
  const run = await play(bot, [
    { op: 1223, hex: P['c2s/1223 ALPHATEST1'], reply: [r(1223, 's2c/1223 thành công'), r(1222, 's2c/1222 6273'), r(1220, 's2c/1220 có thư chưa đọc')] },
    { op: 1223, reply: [r(1223, 's2c/1223 không tồn tại'), r(1256, 's2c/1256 không tồn tại')] },
    { op: 1223, hex: P['c2s/1223 DENBU'], reply: [r(1223, 's2c/1223 đã dùng'), r(1256, 's2c/1256 đã dùng')] },
  ], io => bot.run(io));
  assert.deepEqual([run.errors, run.left.length, run.stop, run.outcome], [[], 0, undefined, 'done']);
  assert.deepEqual(bot.results.map(x => [x.code, x.ok, x.text, x.mail?.id]), [
    ['ALPHATEST1', true, 'Nhập mã thành công, phần thưởng đã được gửi vào hộp thư', 6273],
    ['SAIMA2026', false, 'Mã không tồn tại', undefined], ['DENBU', false, 'Nhân vật này đã dùng mã rồi', undefined]]);
  assert.deepEqual(logs.filter(e => e.event === 'code').map(e => e.wrong), [0, 1, 2]);
});

test('gift codes: stop before the server blocks (--max-wrong), and at once when it says it blocks', async () => {
  const wrong = new GiftBot({ codes: ['A1', 'A2', 'A3'], maxWrong: 2, gapMs: 0, waitMs: 300 });
  const unknown = (): Expect => ({ op: 1223, reply: [r(1223, 's2c/1223 không tồn tại'), r(1256, 's2c/1256 không tồn tại')] });
  const a = await play(wrong, [unknown(), unknown()], io => wrong.run(io));
  assert.deepEqual([a.errors, a.left.length], [[], 0]);
  assert.match(a.stop!, /2 mã bị từ chối liền nhau.*chưa gửi: A3$/);
  const locked = new GiftBot({ codes: ['DENBU', 'B2'], gapMs: 0, waitMs: 300 });
  const b = await play(locked, [{ op: 1223, reply: [r(1223, 's2c/1223 quá nhanh'), r(1256, 's2c/1256 quá nhanh')] }], io => locked.run(io));
  assert.deepEqual([b.errors, b.left.length], [[], 0]);
  assert.match(b.stop!, /chặn nhập mã 5 phút.*chưa gửi: B2$/);
  assert.throws(() => new GiftBot({ codes: ['A'], maxWrong: 10 }), /maxWrong/);
  assert.ok(locked.lockedAt);
  // The server counts across logins: the codes refused before this run count, and a good code starts again from 0.
  const before = new GiftBot({ codes: ['A1', 'A2'], maxWrong: 3, wrongBefore: 2, gapMs: 0, waitMs: 300 });
  const c = await play(before, [unknown()], io => before.run(io));
  assert.deepEqual([c.errors, c.left.length, before.wrong], [[], 0, 3]);
  assert.match(c.stop!, /3 mã bị từ chối liền nhau.*chưa gửi: A2$/);
  const full = new GiftBot({ codes: ['A1'], maxWrong: 3, wrongBefore: 3, gapMs: 0, waitMs: 300 });
  const d = await play(full, [], io => full.run(io));
  assert.deepEqual([d.errors, d.sent.length], [[], 0]);
  assert.match(d.stop!, /nick đã có 3 mã bị từ chối liền nhau/);
  const good = new GiftBot({ codes: ['ALPHATEST1'], wrongBefore: 4, gapMs: 0, settleMs: 5, waitMs: 300 });
  await play(good, [{ op: 1223, reply: [r(1223, 's2c/1223 thành công'), r(1222, 's2c/1222 6273')] }], io => good.run(io));
  assert.equal(good.wrong, 0);
});

function mailBot(task: MailTask, script: Expect[], { bag = [] as BagEntry[], capacity = 42, confirm = false } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new MailBot({ items, confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  bot.onPacket(42, bag42(bag, capacity));
  bot.onPacket(46, money46(3_600, 26_138, 0));
  return play(bot, script, io => bot.run(task, io)).then(x => ({ ...x, logs, bot }));
}
const listAll = (key = 's2c/1215 bốn thư mới'): Expect => ({ op: 1215, hex: '', reply: [r(1215, key)] });
const open = (id: number, key: string): Expect => ({ op: 1216, hex: mailIdRequest(id).toString('hex'), reply: [r(1216, key), r(1220, 's2c/1220 có thư chưa đọc')] });

test('Nhận one mail, as G1: its money in s2c/46, then s2c/1217 ok', async () => {
  const x = await mailBot({ kind: 'claim', id: 6280 }, [
    listAll(), open(6280, 's2c/1216 6280 Đền bù'),
    { op: 1217, hex: mailIdRequest(6280).toString('hex'), reply: [r(46, 's2c/46 sau Nhận 6280'), r(1217, 's2c/1217 6280 được'), r(1220, 's2c/1220 có thư chưa đọc')] },
  ], { confirm: true });
  assert.deepEqual([x.errors, x.left.length, x.stop, x.outcome], [[], 0, undefined, 'done']);
  const result = x.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.ok, result.moneyAfter], [true, { xu: 5_003_600, xuKhoa: 5_026_138, luong: 10_000 }]);
  assert.deepEqual(x.logs.find(e => e.event === 'mail')!.money, { xu: 5_000_000, luong: 10_000, xuKhoa: 5_000_000 });
});

test('Nhận checks the room first; when the server finds none, s2c/1217 ok 0 and its notice end the task', async () => {
  const full = Array.from({ length: 42 }, (_, slot) => ({ slot, itemId: 411 }));
  const noRoom = await mailBot({ kind: 'claim', id: 6278 }, [listAll(), open(6278, 's2c/1216 6278 Alpha Test')], { bag: full, confirm: true });
  assert.deepEqual([noRoom.errors, noRoom.left.length], [[], 0]);
  assert.match(noRoom.stop!, /cần 8 ô trống, túi còn 0/);
  const refused = await mailBot({ kind: 'claim', id: 6278 }, [
    listAll(), open(6278, 's2c/1216 6278 Alpha Test'),
    { op: 1217, reply: [r(1256, 's2c/1256 rương đầy'), r(1217, 's2c/1217 6278 không được'), r(1220, 's2c/1220 có thư chưa đọc')] },
  ], { capacity: 60, confirm: true });
  assert.deepEqual([refused.errors, refused.left.length], [[], 0]);
  assert.equal(refused.stop, 'server không cho nhận thư 6278: "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa"');
  const taken = await mailBot({ kind: 'claim', id: 6280 }, [listAll('s2c/1215 sau Nhận hết khi đầy')], { confirm: true });
  assert.match(taken.stop!, /đã nhận quà rồi/);
});

test('Nhận hết: no mail opened (that marks it read), one c2s/1218, and the notice says how many came', async () => {
  const script = (): Expect[] => [listAll('s2c/1215 ba thư chưa nhận')];
  const dry = await mailBot({ kind: 'claim-all' }, script());
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  assert.deepEqual(dry.logs.find(e => e.event === 'plan')!.mails, 3);
  const done = await mailBot({ kind: 'claim-all' }, [...script(),
    { op: 1218, hex: '', reply: [[46, money46(15_003_600, 16_030_279, 30_000)], r(1256, 's2c/1256 đã nhận 2 thư'), r(1215, 's2c/1215 ba thư đã nhận'), r(1220, 's2c/1220 đã đọc hết')] },
  ], { confirm: true });
  assert.deepEqual([done.errors, done.left.length, done.outcome], [[], 0, 'done']);
  const result = done.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.claimed, result.left, result.moneyAfter.luong], [2, 0, 30_000]);
  const none = await mailBot({ kind: 'claim-all' }, [listAll('s2c/1215 ba thư đã nhận')], { confirm: true });
  assert.deepEqual([none.errors, none.left.length, none.outcome], [[], 0, 'done']);
});

test('Xóa only the mails whose gift is taken, one c2s/1219 each; c2s/1221 never goes out', async () => {
  const x = await mailBot({ kind: 'delete-claimed' }, [
    listAll('s2c/1215 sau Nhận hết khi đầy'),
    { op: 1219, hex: mailIdRequest(6280).toString('hex'), reply: [r(1219, 's2c/1219 6280 đã xoá'), r(1220, 's2c/1220 đã đọc hết')] },
  ], { confirm: true });
  assert.deepEqual([x.errors, x.left.length, x.outcome], [[], 0, 'done']);
  assert.deepEqual(x.logs.find(e => e.event === 'plan')!.keep, 3);
  assert.throws(() => (x.bot as any).steps.send(1221, Buffer.alloc(0)), /Xóa hết/);
});

function dailyBot(task: DailyTask, script: Expect[], { quest = 's2c/1195 không có', confirm = false, mapId = 'M1' } = {}) {
  const logs: Record<string, any>[] = [];
  const bot = new DailyBot({ confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
  bot.onPacket(1195, hex(quest));
  return play(bot, script, io => bot.run(task, io, mapId)).then(x => ({ ...x, logs, bot }));
}
const ELDER = { mapId: 'M1', npcId: 102 };
const talk = (): Expect => ({ op: 13, hex: buildRequest(13, ELDER).toString('hex'), reply: [r(57, 's2c/57 Hương Lão')] });
const choose = (option: number, ...reply: Reply[]): Expect => ({ op: 57, hex: buildRequest(57, { option, ...ELDER }).toString('hex'), reply });

test('the daily quest: shown from s2c/1195 and the menu, which is left on Hương Lão\'s first menu', async () => {
  const x = await dailyBot('show', [talk(), choose(2, r(57, 's2c/57 nhiệm vụ ngày 0/3 Nhận')), talk()]);
  assert.deepEqual([x.errors, x.left.length, x.outcome], [[], 0, 'done']);
  const menu = x.logs.find(e => e.event === 'menu' && e.text)!;
  assert.deepEqual([menu.taken, menu.max, menu.line], [0, 3, 'Nhận nhiệm vụ']);
  const away = await dailyBot('show', [], { mapId: 'M2' });
  assert.deepEqual([away.errors, away.outcome], [[], 'done']);
});

test('Nhận and Hủy, as G1; a dry run picks nothing, and the wrong line stops', async () => {
  const accepted = await dailyBot('accept', [talk(), choose(2, r(57, 's2c/57 nhiệm vụ ngày 0/3 Nhận')),
    choose(0, r(1256, 's2c/1256 Nhận nhiệm vụ thành công'), r(1195, 's2c/1195 116 Sử dụng vật phẩm')), talk()], { confirm: true });
  assert.deepEqual([accepted.errors, accepted.left.length, accepted.stop, accepted.outcome], [[], 0, undefined, 'done']);
  assert.deepEqual(accepted.logs.find(e => e.event === 'result')!.quest, { id: 116, name: 'Sử dụng vật phẩm', text: 'Sử dụng 0/3 vật phẩm trong trận đấu', progress: 0, target: 3 });
  const cancelled = await dailyBot('cancel', [talk(), choose(2, r(57, 's2c/57 nhiệm vụ ngày 1/3 Hủy')),
    choose(0, r(1195, 's2c/1195 không có'), r(1256, 's2c/1256 Hủy nhiệm vụ thành công')), talk()], { quest: 's2c/1195 116 Sử dụng vật phẩm', confirm: true });
  assert.deepEqual([cancelled.errors, cancelled.left.length, cancelled.outcome, cancelled.bot.quest], [[], 0, 'done', null]);
  assert.deepEqual(cancelled.logs.find(e => e.event === 'result')!.notices, ['Hủy nhiệm vụ thành công']);
  const dry = await dailyBot('cancel', [talk(), choose(2, r(57, 's2c/57 nhiệm vụ ngày 1/3 Hủy')), talk()], { quest: 's2c/1195 113 Nhặt xu' });
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  const holding = await dailyBot('accept', [talk(), choose(2, r(57, 's2c/57 nhiệm vụ ngày 1/3 Hủy')), talk()], { quest: 's2c/1195 113 Nhặt xu', confirm: true });
  assert.deepEqual([holding.errors, holding.left.length], [[], 0]);
  assert.equal(holding.stop, 'không nhận được: dòng 0 là "Hủy nhiệm vụ hiện tại" (đang giữ Nhặt xu)');
});

test('Hoàn thành nhiệm vụ (NP1): s2c/10 and s2c/46 give the rewards, then s2c/1195 kind 2 names them; no quest is left', async () => {
  const n = (key: string) => Buffer.from(np1Packets[key], 'hex'), nr = (op: number, key: string): Reply => [op, n(key)];
  assert.deepEqual(dailyQuest(n('s2c/1195 xong Nhặt xu')), { kind: 2, quest: null, done: { name: 'Nhặt xu', rewards: ['727 kinh nghiệm', '590 xu khóa'] } });
  const menu = npcMenu(n('s2c/57 nhiệm vụ ngày 1/3 Hoàn thành'));
  assert.deepEqual([menu.text, menu.options], ['Hôm nay con đã nhận 1/3 nhiệm vụ hàng ngày.', [{ option: 0, label: 'Hoàn thành nhiệm vụ' }, { option: 1, label: 'Hủy nhiệm vụ hiện tại' }]]);
  const play = (confirm: boolean, extra: Expect[]) => {
    const logs: Record<string, any>[] = [];
    const bot = new DailyBot({ confirm, waitMs: 300, settleMs: 5, log: e => logs.push(e) });
    bot.onPacket(1195, n('s2c/1195 113 Nhặt xu 2100/2100'));
    bot.onPacket(46, money46(7_048_600, 5_033_578, 7_950));
    const s = scripted([talk(), choose(2, nr(57, 's2c/57 nhiệm vụ ngày 1/3 Hoàn thành')), ...extra, talk()], (op, p) => bot.onPacket(op, p));
    return bot.run('complete', s.io, 'M1').then(outcome => ({ ...s, outcome, logs, bot }));
  };
  const dry = await play(false, []);
  assert.deepEqual([dry.errors, dry.left.length, dry.outcome], [[], 0, 'dry_run']);
  const done = await play(true, [choose(0, nr(10, 's2c/10 sau Hoàn thành'), nr(46, 's2c/46 sau Hoàn thành'), nr(1195, 's2c/1195 xong Nhặt xu'))]);
  assert.deepEqual([done.errors, done.left.length, done.outcome, done.bot.quest], [[], 0, 'done', null]);
  const result = done.logs.find(e => e.event === 'result')!;
  assert.deepEqual([result.ok, result.rewards, result.moneyAfter.xuKhoa - result.moneyBefore.xuKhoa, result.opcodes], [true, ['727 kinh nghiệm', '590 xu khóa'], 590, [10, 46, 1195]]);
});

test('Hoàn thành is refused before any pick when the quest is not done or the line is missing', async () => {
  const notDone = await dailyBot('complete', [talk(), choose(2, r(57, 's2c/57 nhiệm vụ ngày 1/3 Hủy')), talk()], { quest: 's2c/1195 113 Nhặt xu', confirm: true });
  assert.deepEqual([notDone.errors, notDone.left.length], [[], 0]);
  assert.match(notDone.stop!, /không có dòng Hoàn thành/);
  const n = Buffer.from(np1Packets['s2c/57 nhiệm vụ ngày 1/3 Hoàn thành'], 'hex');
  const early = await dailyBot('complete', [talk(), choose(2, [57, n]), talk()], { quest: 's2c/1195 113 Nhặt xu', confirm: true });
  assert.match(early.stop!, /mới 0\/2050: chưa xong/);
  assert.ok(![notDone, early].some(x => x.sent.some(s => s === `c2s/57 ${buildRequest(57, { option: 0, ...ELDER }).toString('hex')}`)));
});
