const test = require('node:test');
const assert = require('node:assert/strict');
const { GameRoom, MAX_PLAYERS, COUNTDOWN_MS, MAX_STILL_CHARS, PART_CHARS, SCENES, NAMES } = require('../public/engine.js');

function makeRoom() {
  const sent = [];
  let clock = 1_000_000;
  const room = new GameRoom('TEST', {
    broadcast: (ev, data) => sent.push({ to: '*', ev, data }),
    send: (to, ev, data) => sent.push({ to, ev, data }),
    now: () => clock,
  });
  const last = (ev, to) => [...sent].reverse().find((m) => m.ev === ev && (!to || m.to === to));
  return { room, sent, last, tick: (ms) => { clock += ms; } };
}

test('players join with unique names and colours, and the first is the host', () => {
  const { room } = makeRoom();
  for (let i = 1; i <= 5; i++) assert.equal(room.join(`p${i}`).ok, true);
  const players = room.lobbyPayload().players;
  assert.equal(new Set(players.map((p) => p.name)).size, 5);
  assert.equal(new Set(players.map((p) => p.color)).size, 5);
  players.forEach((p) => {
    assert.ok(NAMES.includes(p.name));
    assert.ok(p.name.length >= 4 && p.name.length <= 5);
  });
  assert.equal(room.lobbyPayload().hostId, 'p1');
  assert.deepEqual(players.map((p) => p.seat), [0, 1, 2, 3, 4]);
});

test(`the booth holds ${MAX_PLAYERS} mates`, () => {
  const { room } = makeRoom();
  for (let i = 0; i < MAX_PLAYERS; i++) assert.equal(room.join(`p${i}`).ok, true);
  const res = room.join('extra');
  assert.equal(res.ok, false);
  assert.match(res.error, /full/);
});

test('leaving frees the seat and hands hosting on', () => {
  const { room, last } = makeRoom();
  ['a', 'b', 'c'].forEach((id) => room.join(id));
  room.leave('a');
  const lobby = last('lobbyUpdate').data;
  assert.equal(lobby.hostId, 'b');
  assert.deepEqual(lobby.players.map((p) => [p.id, p.seat]), [['b', 1], ['c', 2]], 'everyone stays put');
});

test('anyone can switch the scene, including scenes this host has never heard of', () => {
  const { room, last } = makeRoom();
  room.join('a');
  room.join('b');
  assert.equal(room.input('b', { type: 'scene', id: 'samurai' }), true);
  assert.equal(last('lobbyUpdate').data.scene, 'samurai');
  assert.equal(room.input('b', { type: 'scene', id: 'moon-base' }), true, 'a newer scene still works');
  ['', 'X', '<script>', 42, 'a'.repeat(40)].forEach((id) => assert.equal(room.input('b', { type: 'scene', id }), false, String(id)));
  assert.equal(room.input('ghost', { type: 'scene', id: 'brady' }), false, 'only players in the room');
  assert.ok(SCENES.includes('office'));
});

test('shuffle moves everyone to random spots in the scene, keeping them all apart', () => {
  const { room, last } = makeRoom();
  for (let i = 0; i < 8; i++) room.join(`p${i}`);
  const spots = () => last('lobbyUpdate').data.players.map((p) => p.seat);
  room.announceJoin();
  const before = spots().join();
  assert.equal(before, '0,1,2,3,4,5,6,7');
  assert.equal(room.input('p0', { type: 'shuffle', spots: 14 }), true);
  const after = spots();
  assert.notEqual(after.join(), before);
  assert.equal(new Set(after).size, 8, 'no doubling up');
  after.forEach((s) => assert.ok(s >= 0 && s < 14));
});

test('someone on their own can shuffle to a different spot', () => {
  const { room, last } = makeRoom();
  room.join('solo');
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const was = room.spots.get('solo');
    assert.equal(room.input('solo', { type: 'shuffle', spots: 6 }), true);
    const now = last('lobbyUpdate').data.players[0].seat;
    assert.notEqual(now, was, 'it always moves');
    seen.add(now);
  }
  assert.ok(seen.size > 2);
  assert.equal(room.input('solo', { type: 'shuffle', spots: 1 }), false, 'nowhere else to go');
});

test('with more mates than spots, shuffling takes turns so everyone gets in the photo', () => {
  const { room, last } = makeRoom();
  for (let i = 0; i < 9; i++) room.join(`p${i}`);
  const inPhoto = new Map(room.order.map((p) => [p, 0]));
  for (let round = 0; round < 6; round++) {
    room.input('p0', { type: 'shuffle', spots: 6 });
    const players = last('lobbyUpdate').data.players;
    const seated = players.filter((p) => p.seat < 6);
    assert.equal(seated.length, 6, 'the 6 spots are always full');
    assert.equal(new Set(seated.map((p) => p.seat)).size, 6, 'no doubling up');
    seated.forEach((p) => inPhoto.set(p.id, inPhoto.get(p.id) + 1));
    // Nobody sits out twice in a row while others have been in twice.
  }
  assert.ok([...inPhoto.values()].every((n) => n >= 3), `everyone gets turns: ${[...inPhoto.values()]}`);
});

test('joiners take the best free spot', () => {
  const { room, last } = makeRoom();
  ['a', 'b', 'c'].forEach((id) => room.join(id));
  room.leave('a');
  room.join('d');
  room.announceJoin('d');
  const bySeat = Object.fromEntries(last('lobbyUpdate').data.players.map((p) => [p.id, p.seat]));
  assert.deepEqual(bySeat, { b: 1, c: 2, d: 0 });
});

test('the shutter counts down for everyone, one photo at a time', () => {
  const { room, last, tick } = makeRoom();
  room.join('a');
  room.join('b');
  assert.equal(room.input('b', { type: 'shutter' }), true);
  const shutter = last('shutter').data;
  assert.deepEqual(shutter, { n: 1, ms: COUNTDOWN_MS, by: room.players.get('b').name });
  assert.equal(room.input('a', { type: 'shutter' }), false, 'already counting down');
  tick(COUNTDOWN_MS + 2001);
  assert.equal(room.input('a', { type: 'shutter' }), true);
  assert.equal(last('shutter').data.n, 2);
});

test("each person's photo is passed on to everyone else, in pieces", () => {
  const { room, sent, tick } = makeRoom();
  ['a', 'b', 'c'].forEach((id) => room.join(id));
  room.input('a', { type: 'shutter' });
  tick(COUNTDOWN_MS);
  const data = `data:image/webp;base64,${'A'.repeat(PART_CHARS * 2)}`;
  const parts = [0, 1, 2].map((i) => data.slice(i * PART_CHARS, (i + 1) * PART_CHARS));
  parts.forEach((part, i) => assert.equal(room.input('b', { type: 'stillPart', n: 1, i, total: 3, data: part }), true));
  const got = sent.filter((m) => m.ev === 'stillPart');
  assert.deepEqual(got.map((m) => m.to).sort(), ['a', 'a', 'a', 'c', 'c', 'c']);
  assert.equal(got.filter((m) => m.to === 'a').map((m) => m.data.data).join(''), data);
  assert.deepEqual(Object.keys(got[0].data).sort(), ['data', 'i', 'id', 'n', 'total']);
  assert.equal(room.input('c', { type: 'stillPart', n: 7, i: 0, total: 1, data: 'data:image/png;base64,AA' }), false, 'wrong shot');
  assert.equal(room.input('c', { type: 'stillPart', n: 1, i: 0, total: 1, data: 'javascript:alert(1)' }), false, 'images only');
  assert.equal(room.input('c', { type: 'stillPart', n: 1, i: 0, total: 1, data: 'A'.repeat(PART_CHARS + 1) }), false, 'pieces are small');
  assert.equal(room.input('c', { type: 'stillPart', n: 1, i: 3, total: 2, data: 'AA' }), false, 'piece in range');
});

test('one photo can only be so big', () => {
  const { room, tick } = makeRoom();
  room.join('a');
  room.join('b');
  room.input('a', { type: 'shutter' });
  tick(COUNTDOWN_MS);
  const total = Math.ceil(MAX_STILL_CHARS / PART_CHARS) + 1;
  let accepted = 0;
  for (let i = 0; i < total; i++) {
    const data = (i === 0 ? 'data:image/png;base64,' : '').padEnd(PART_CHARS, 'A');
    if (room.input('a', { type: 'stillPart', n: 1, i, total: Math.min(total, 43), data })) accepted++;
  }
  assert.ok(accepted * PART_CHARS <= MAX_STILL_CHARS);
});
