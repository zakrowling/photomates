// Photomates scenes: where everyone sits and what's drawn around them, on a 1280×720 stage.
// Each person is a square, background-removed picture (head near the top, shoulders at the bottom).
// Row scenes (theatre, stadium) draw back to front: a row's seats, then the people sitting in them,
// then whatever is in front of that row (a bench, the next row of seats), which hides their lower half
// so everyone looks like they're really sitting there. Shared by the browser and the Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotomatesScenes = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const W = 1280;
  const H = 720;

  // ---------- Small drawing helpers ----------

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function grad(c, y0, y1, stops) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([at, colour]) => g.addColorStop(at, colour));
    return g;
  }

  // Wood grain: a few faint horizontal streaks, the same every time (no randomness between frames).
  function grain(c, x, y, w, h, alpha) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.strokeStyle = `rgba(90,45,10,${alpha})`;
    c.lineWidth = 1.5;
    for (let i = 0; i < h; i += 7) {
      const wobble = Math.sin((y + i) * 0.37) * 3;
      c.beginPath();
      c.moveTo(x, y + i + wobble);
      c.bezierCurveTo(x + w * 0.3, y + i - wobble, x + w * 0.7, y + i + wobble * 1.5, x + w, y + i - wobble);
      c.stroke();
    }
    c.restore();
  }

  // ---------- Theatre: a tiered wooden lecture hall (like Teams' Together Mode) ----------

  const THEATRE_ROWS = [
    { bench: 300, size: 205, xs: [272, 517, 763, 1008] },
    { bench: 468, size: 245, xs: [100, 370, 640, 910, 1180] },
    { bench: 640, size: 290, xs: [175, 485, 795, 1105] },
  ];

  function theatreSeatBack(c, x, bench, size) {
    const w = size * 0.62;
    const h = size * 0.42;
    rr(c, x - w / 2, bench - h - size * 0.05, w, h + 10, w * 0.18);
    c.fillStyle = grad(c, bench - h, bench, [[0, '#ead2cf'], [1, '#c9a9a5']]);
    c.fill();
  }

  function theatreBench(c, bench, size) {
    const h = size * 0.24;
    c.fillStyle = grad(c, bench, bench + h, [[0, '#f2c58f'], [0.12, '#dc9f5f'], [1, '#b8773a']]);
    c.fillRect(0, bench, W, h);
    grain(c, 0, bench + 6, W, h - 6, 0.12);
    c.fillStyle = 'rgba(255,240,215,0.7)';
    c.fillRect(0, bench, W, 3);
    c.fillStyle = 'rgba(60,25,0,0.25)';
    c.fillRect(0, bench + h - 4, W, 4);
  }

  const theatre = {
    id: 'theatre',
    name: 'Theatre',
    kind: 'rows',
    rows: THEATRE_ROWS,
    // Front row centre first, then fanning out and back.
    priority: [[2, 1], [2, 2], [1, 2], [2, 0], [2, 3], [1, 1], [1, 3], [0, 1], [0, 2], [1, 0], [1, 4], [0, 0], [0, 3]],
    background(c) {
      c.fillStyle = grad(c, 0, H, [[0, '#c98a4b'], [1, '#a8662e']]);
      c.fillRect(0, 0, W, H);
      // Wall panels behind the top row.
      for (let x = 0; x < W; x += 160) {
        c.fillStyle = x % 320 ? '#c48546' : '#bd7d3f';
        c.fillRect(x, 0, 158, 140);
        grain(c, x, 0, 158, 140, 0.1);
      }
      // An empty row at the very back.
      for (let x = 150; x < W; x += 245) theatreSeatBack(c, x, 150, 170);
      theatreBench(c, 150, 170);
    },
    seatBacks(c, r) {
      const row = THEATRE_ROWS[r];
      const step = row.xs[1] - row.xs[0];
      for (let x = row.xs[0] - step * 2; x < W + step; x += step) theatreSeatBack(c, x, row.bench, row.size);
    },
    front(c, r) {
      const row = THEATRE_ROWS[r];
      theatreBench(c, row.bench, row.size);
    },
    tone: 'saturate(1.05) sepia(0.06)',
  };

  // ---------- Stadium: rows of blue plastic seats ----------

  // Seat backs for each row, back to front. People sit in the middle rows (1-3); the row in front of
  // them hides their lower half.
  const STADIUM_SEATS = [
    { top: -40, w: 150 },
    { top: 95, w: 170 },
    { top: 245, w: 198 },
    { top: 420, w: 232 },
    { top: 625, w: 272 },
  ];
  const seatXs = (row, count, offset = 0) => {
    const step = row.w * 1.12;
    return Array.from({ length: count }, (_, i) => Math.round(W / 2 + (i - (count - 1) / 2 + offset) * step));
  };
  const STADIUM_ROWS = [1, 2, 3].map((k, i) => {
    const s = STADIUM_SEATS[k];
    const count = [4, 5, 4][i];
    return { seatRow: k, bench: STADIUM_SEATS[k + 1].top + 30, size: s.w * 1.25, xs: seatXs(s, count) };
  });

  function stadiumSeat(c, x, top, w) {
    const h = w * 0.62;
    rr(c, x - w / 2, top, w, h, w * 0.16);
    c.fillStyle = grad(c, top, top + h, [[0, '#4d9cff'], [0.55, '#1f6fe0'], [1, '#1557b8']]);
    c.fill();
    c.strokeStyle = 'rgba(0,30,90,0.35)';
    c.lineWidth = 2;
    c.stroke();
    // Shine and seat number disc.
    c.fillStyle = 'rgba(255,255,255,0.25)';
    rr(c, x - w * 0.36, top + h * 0.1, w * 0.72, h * 0.16, h * 0.08);
    c.fill();
    c.fillStyle = '#e9eef7';
    c.beginPath();
    c.arc(x, top + h * 0.42, w * 0.055, 0, Math.PI * 2);
    c.fill();
  }

  function stadiumRow(c, k) {
    const s = STADIUM_SEATS[k];
    const step = s.w * 1.12;
    // A concrete step under each row of seats.
    c.fillStyle = '#5d6676';
    c.fillRect(0, s.top + s.w * 0.55, W, s.w * 0.25);
    // Odd rows are offset by half a seat, so seat counts that are even (odd rows) or odd (even rows)
    // centre neatly (see seatXs).
    for (let j = -8; j <= 8; j++) stadiumSeat(c, W / 2 + (j + (k % 2 ? 0.5 : 0)) * step, s.top, s.w);
  }

  const stadium = {
    id: 'stadium',
    name: 'Stadium',
    kind: 'rows',
    rows: STADIUM_ROWS,
    priority: [[2, 1], [2, 2], [1, 2], [2, 0], [2, 3], [1, 1], [1, 3], [0, 1], [0, 2], [1, 0], [1, 4], [0, 0], [0, 3]],
    background(c) {
      c.fillStyle = '#3e4757';
      c.fillRect(0, 0, W, H);
      stadiumRow(c, 0);
    },
    seatBacks(c, r) {
      stadiumRow(c, STADIUM_ROWS[r].seatRow);
    },
    front(c, r) {
      const k = STADIUM_ROWS[r].seatRow + 1;
      // The front-most row of seats is drawn by the last people row.
      if (r === STADIUM_ROWS.length - 1 || k !== STADIUM_ROWS[r + 1].seatRow) stadiumRow(c, k);
    },
    tone: 'saturate(1.08) contrast(1.03)',
  };

  // ---------- Brady Bunch: everyone in their own square on a grid ----------

  const BRADY_GRIDS = [[1, 1], [2, 1], [3, 1], [2, 2], [3, 2], [3, 2], [3, 3], [3, 3], [3, 3], [4, 3], [4, 3], [4, 3]];

  function bradyCells(n) {
    const [cols, rows] = BRADY_GRIDS[Math.max(0, Math.min(BRADY_GRIDS.length, n) - 1)];
    const line = 10;
    const cw = (W - line * (cols + 1)) / cols;
    const ch = (H - line * (rows + 1)) / rows;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) cells.push({ x: line + col * (cw + line), y: line + r * (ch + line), w: cw, h: ch });
    }
    return cells;
  }

  const brady = {
    id: 'brady',
    name: 'Brady Bunch',
    kind: 'grid',
    cells: bradyCells,
    tone: 'saturate(1.12) contrast(1.05)',
  };

  const SCENES = [theatre, stadium, brady];
  const byId = (id) => SCENES.find((s) => s.id === id) || SCENES[0];

  // Seat rectangles (where each person's square picture goes) for n people, in seat order.
  function layout(sceneId, n) {
    const scene = byId(sceneId);
    if (scene.kind === 'grid') {
      return scene.cells(n).slice(0, n).map((cell) => {
        // Head and shoulders filling the cell's height, face in the upper middle.
        const size = Math.min(cell.w * 1.1, cell.h * 1.2);
        return { x: cell.x + cell.w / 2 - size / 2, y: cell.y - size * 0.06, size, clip: cell, row: 0 };
      });
    }
    // On your own, you get the middle seat.
    const order = n === 1 ? [[1, 2]] : scene.priority;
    return order.slice(0, n).map(([r, i]) => {
      const row = scene.rows[r];
      const size = row.size;
      // The bottom of the picture tucks well behind the bench in front.
      return { x: row.xs[i] - size / 2, y: row.bench + size * 0.28 - size, size, row: r, labelY: row.bench + 22, cx: row.xs[i] };
    });
  }

  /**
   * Draw a scene with everyone in it.
   * people: [{ seat, image (canvas/img or null), name, color }]; image null draws a placeholder.
   * opts.labels: draw name tags (live view only, not the photo).
   */
  function render(c, sceneId, people, opts = {}) {
    const scene = byId(sceneId);
    const seats = layout(sceneId, people.length);
    const at = new Map(people.map((p) => [p.seat, p]));
    c.save();
    if (scene.kind === 'grid') {
      c.fillStyle = '#0b0b0f';
      c.fillRect(0, 0, W, H);
      seats.forEach((s, i) => {
        const cell = s.clip;
        c.fillStyle = '#5e9de6';
        c.fillRect(cell.x, cell.y, cell.w, cell.h);
        c.save();
        c.beginPath();
        c.rect(cell.x, cell.y, cell.w, cell.h);
        c.clip();
        drawPerson(c, at.get(i), s, scene.tone);
        c.restore();
        if (opts.labels && at.get(i)) tag(c, at.get(i), cell.x + 14, cell.y + cell.h - 14, 'left');
      });
    } else {
      scene.background(c);
      scene.rows.forEach((row, r) => {
        scene.seatBacks(c, r);
        seats.forEach((s, i) => { if (s.row === r) drawPerson(c, at.get(i), s, scene.tone, true); });
        scene.front(c, r);
      });
      if (opts.labels) seats.forEach((s, i) => { if (at.get(i)) tag(c, at.get(i), s.cx, s.labelY, 'center'); });
    }
    c.restore();
  }

  function drawPerson(c, person, s, tone, shadow) {
    if (!person) return;
    c.save();
    if (person.image) {
      c.filter = shadow ? `${tone} drop-shadow(0 6px 10px rgba(0,0,0,0.35))` : tone;
      c.drawImage(person.image, s.x, s.y, s.size, s.size);
    } else {
      placeholder(c, s, person.color);
    }
    c.restore();
  }

  // Someone without a camera (yet): a soft silhouette in their colour.
  function placeholder(c, s, colour) {
    const cx = s.x + s.size / 2;
    c.globalAlpha = 0.85;
    c.fillStyle = colour;
    c.beginPath();
    c.ellipse(cx, s.y + s.size * 0.36, s.size * 0.16, s.size * 0.19, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(cx, s.y + s.size * 0.95, s.size * 0.36, s.size * 0.33, 0, Math.PI, 0);
    c.fill();
  }

  function tag(c, person, x, y, align) {
    c.save();
    c.font = '600 16px Fredoka, system-ui, sans-serif';
    const w = c.measureText(person.name).width + 18;
    const left = align === 'center' ? x - w / 2 : x;
    c.fillStyle = 'rgba(15,15,20,0.72)';
    rr(c, left, y - 13, w, 24, 12);
    c.fill();
    c.fillStyle = person.color;
    c.beginPath();
    c.arc(left + 10, y - 1, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(person.name, left + 17 - 3, y);
    c.restore();
  }

  return { W, H, SCENES, layout, render, byId, bradyCells };
});
