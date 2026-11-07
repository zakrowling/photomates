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
    assert.ok(Math.abs(s.x + s.size / 2 - Scenes.W / 2) < 6, scene.id);
  }
});

test('row scenes put the front row in front: bigger people further down', () => {
  for (const id of ['office', 'outdoor', 'stadium']) {
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

test('the bodybuilders have a head for each of their 11 necks', () => {
  const scene = Scenes.byId('bodybuilders');
  assert.equal(scene.capacity, 11);
  const seats = Scenes.layout('bodybuilders', 12);
  assert.equal(seats.length, 11);
  seats.forEach((s) => {
    // Centred over the neck, with the chin (0.585 down the picture) just below the neck's top.
    assert.ok(Math.abs(s.x + s.size / 2 - s.neck.x) < 1);
    const chin = s.y + s.size * 0.585;
    assert.ok(chin > s.neck.y && chin < s.neck.y + s.neck.w, `chin ${chin} neck ${s.neck.y}`);
  });
});
