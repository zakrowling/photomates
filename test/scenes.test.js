const test = require('node:test');
const assert = require('node:assert/strict');
const Scenes = require('../public/scenes.js');
const { SCENES, MAX_PLAYERS } = require('../public/engine.js');

test('the engine and the renderer know the same scenes', () => {
  assert.deepEqual(Scenes.SCENES.map((s) => s.id), SCENES);
});

for (const scene of Scenes.SCENES) {
  test(`${scene.name} seats everyone from 1 to ${MAX_PLAYERS} mates (or as many as it holds), without doubling up`, () => {
    for (let n = 1; n <= MAX_PLAYERS; n++) {
      const seats = Scenes.layout(scene.id, n);
      assert.equal(seats.length, Math.min(n, scene.capacity || n));
      const spots = new Set(seats.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
      assert.equal(spots.size, seats.length, `${n} people, ${spots.size} spots`);
      seats.forEach((s) => {
        assert.ok(s.size > 100, 'big enough to see');
        // Every face (upper middle of the picture) is on the stage.
        const fx = s.x + s.size / 2;
        const fy = s.y + s.size * 0.4;
        assert.ok(fx > 0 && fx < Scenes.W && fy > 0 && fy < Scenes.H, `${scene.id} n=${n} face at ${fx},${fy}`);
      });
    }
  });
}

test('on your own, you sit in the middle', () => {
  for (const scene of Scenes.SCENES) {
    const [s] = Scenes.layout(scene.id, 1);
    // Photos of people put you on the middle person, who may stand a little off centre (and the plane's
    // middle is the aisle, so you get the seat beside it).
    assert.ok(Math.abs(s.x + s.size / 2 - Scenes.W / 2) < (scene.kind === 'heads' || scene.id === 'airplane' ? 130 : 6), scene.id);
  }
});

test('row scenes put the front row in front: bigger people further down', () => {
  for (const id of ['office']) {
    const seats = Scenes.layout(id, MAX_PLAYERS);
    const byRow = new Map();
    seats.forEach((s) => byRow.set(s.row, s));
    const rows = [...byRow.keys()].sort();
    for (let r = 1; r < rows.length; r++) {
      assert.ok(byRow.get(rows[r]).size > byRow.get(rows[r - 1]).size);
      assert.ok(byRow.get(rows[r]).y > byRow.get(rows[r - 1]).y);
    }
  }
});

test('the Brady Bunch grid grows with the group', () => {
  assert.equal(Scenes.bradyCells(1).length, 1);
  assert.equal(Scenes.bradyCells(4).length, 4);
  assert.equal(Scenes.bradyCells(9).length, 9);
  assert.ok(Scenes.bradyCells(12).length >= 12);
});

for (const id of ['bodybuilders', 'samurai', 'christmas']) test(`${id} have a head for each of their 6 necks`, () => {
  const scene = Scenes.byId(id);
  assert.equal(scene.capacity, 6);
  const seats = Scenes.layout(id, 12);
  assert.equal(seats.length, 6);
  seats.forEach((s) => {
    // Centred over the neck, with the chin (0.585 down the picture) just below the neck's top.
    assert.ok(Math.abs(s.x + s.size / 2 - s.neck.x) < 1);
    const chin = s.y + s.size * 0.585;
    assert.ok(chin > s.neck.y && chin < s.neck.y + s.neck.w * 1.2, `chin ${chin} neck ${s.neck.y}`);
  });
});

test('everyone keeps their spot, and anyone whose spot a scene lacks takes the best free one', () => {
  const spots = Scenes.slots('bodybuilders', 2);
  assert.equal(spots.length, 6);
  const at = Scenes.assign(spots, [{ seat: 4 }, { seat: 11 }]);
  assert.equal(at.get(4).seat, 4);
  assert.equal(at.get(0).seat, 11);
  // A board with 6 spots leaves a 7th person out rather than doubling up.
  const crowd = Array.from({ length: 7 }, (_, i) => ({ seat: i }));
  assert.equal(Scenes.assign(spots, crowd).size, 6);
});

test('a solo shuffle can land anywhere in the office, starting from the middle', () => {
  const spots = Scenes.slots('office', 1);
  assert.equal(spots.length, Scenes.byId('office').priority.length);
  assert.ok(Math.abs(spots[0].cx - Scenes.W / 2) < 6);
});
