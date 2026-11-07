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
  const FACE_AT = 0.38; // how far down each person's picture their face is (see updateCrop in client.js)

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

  // ---------- Photos as scenes ----------

  // A photo scene draws the photo, then after each row of people redraws the photo from that row's desk
  // down, so the desk covers their lower half (and the rows in front stay in front).
  const photos = new Map();
  function photo(src) {
    if (typeof Image === 'undefined') return null;
    if (!photos.has(src)) {
      const img = new Image();
      img.src = src;
      photos.set(src, img);
    }
    const img = photos.get(src);
    return img.complete && img.naturalWidth ? img : null;
  }

  // Draws the photo to cover the stage (cropping the sides if it's a little wider than 16:9), optionally
  // only from y down.
  function drawPhoto(c, src, fromY = 0) {
    const img = photo(src);
    if (!img) {
      if (!fromY) {
        c.fillStyle = '#2a2420';
        c.fillRect(0, 0, W, H);
      }
      return;
    }
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * k;
    const dh = img.naturalHeight * k;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    c.save();
    c.beginPath();
    c.rect(0, fromY, W, H - fromY);
    c.clip();
    c.drawImage(img, dx, dy, dw, dh);
    c.restore();
  }

  // ---------- Theatre: a tiered auditorium (photo: assets/bg/auditorium.jpg) ----------

  // Measured from the photo, on the 1280×720 stage: each row's desk top (bench), where a seated face
  // goes (just above the chair back), how big people are in that row, and the chairs' centres.
  const THEATRE_PHOTO = 'assets/bg/auditorium.jpg';
  const THEATRE_ROWS = [
    { bench: 298, faceY: 232, size: 140, xs: [168, 406, 643, 880, 1117] },
    { bench: 368, faceY: 291, size: 164, xs: [252, 512, 773, 1035] },
    { bench: 468, faceY: 378, size: 191, xs: [87, 363, 643, 923, 1199] },
    { bench: 645, faceY: 521, size: 263, xs: [160, 483, 804, 1128] },
  ];

  const theatre = {
    id: 'theatre',
    name: 'Theatre',
    kind: 'rows',
    rows: THEATRE_ROWS,
    // Front row first, then fanning out and back.
    priority: [[3, 1], [3, 2], [2, 2], [3, 0], [3, 3], [2, 1], [2, 3], [1, 1], [1, 2], [2, 0], [2, 4], [1, 0], [1, 3], [0, 2]],
    solo: [2, 2],
    background(c) {
      drawPhoto(c, THEATRE_PHOTO);
    },
    seatBacks() {},
    front(c, r) {
      drawPhoto(c, THEATRE_PHOTO, THEATRE_ROWS[r].bench);
    },
    // The photo is warm and evenly lit: warm webcams up a touch and soften their contrast to match.
    tone: 'saturate(0.92) sepia(0.12) contrast(0.97) brightness(0.97)',
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
    solo: [1, 2],
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
    const order = n === 1 ? [scene.solo || [1, 2]] : scene.priority;
    return order.slice(0, n).map(([r, i]) => {
      const row = scene.rows[r];
      const size = row.size;
      // Photo rows say where the face goes; drawn rows tuck the bottom of the picture behind the bench.
      const y = row.faceY !== undefined ? row.faceY - FACE_AT * size : row.bench + size * 0.28 - size;
      return { x: row.xs[i] - size / 2, y, size, row: r, bench: row.bench, cx: row.xs[i] };
    });
  }

  /**
   * Draw a scene with everyone in it.
   * people: [{ seat, image (canvas/img or null), color, bottom }]. image null draws a placeholder;
   * bottom is how far down (0-1) their picture their body reaches.
   */
  function render(c, sceneId, people) {
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
        drawPerson(c, at.get(i), s, scene);
        c.restore();
      });
    } else {
      scene.background(c);
      scene.rows.forEach((row, r) => {
        scene.seatBacks(c, r);
        seats.forEach((s, i) => { if (s.row === r) drawPerson(c, at.get(i), s, scene); });
        scene.front(c, r);
      });
    }
    grain(c);
    c.restore();
  }

  // Each person is drawn through a scratch canvas so they can be colour matched and shaded to sit in the
  // scene: lowered if their body ends early (so it still disappears behind the desk), darkened just
  // above the desk where its shadow falls, softened a little in the back rows, with a soft shadow behind.
  let scratch = null;
  function drawPerson(c, person, s, scene) {
    if (!person) return;
    if (!person.image) {
      c.save();
      placeholder(c, s, person.color);
      c.restore();
      return;
    }
    const rows = scene.kind === 'rows';
    let size = s.size;
    let y = s.y;
    if (rows) {
      // If their body ends above the desk (they sit close to their camera), first grow them a little
      // around their face, then lower them only as much as still needed so the desk hides the end.
      const bottom = person.bottom ?? 1;
      const faceY = s.y + FACE_AT * s.size;
      const below = Math.max(0.05, bottom - FACE_AT);
      let need = s.bench + 4 - (s.y + bottom * s.size);
      if (need > 0) {
        size = s.size * Math.min(1.12, 1 + need / (below * s.size));
        y = faceY - FACE_AT * size;
        need = s.bench + 4 - (y + bottom * size);
        if (need > 0) y += Math.min(need, 0.3 * s.size);
      }
    }
    const x = s.x + (s.size - size) / 2;
    const res = Math.abs(c.getTransform().a) || 1; // draw at full detail when the stage is scaled up
    const px = Math.max(1, Math.round(size * res));
    scratch = scratch || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!scratch) return;
    if (scratch.width !== px) {
      scratch.width = px;
      scratch.height = px;
    }
    const t = scratch.getContext('2d');
    t.save();
    t.clearRect(0, 0, px, px);
    const depth = rows ? (scene.rows.length - 1 - s.row) * 0.35 : 0;
    t.filter = `${scene.tone}${depth ? ` blur(${(depth * res).toFixed(2)}px)` : ''}`;
    t.drawImage(person.image, 0, 0, px, px);
    t.filter = 'none';
    if (rows) {
      // The desk's shadow across their lower body.
      const benchY = (s.bench - y) * res;
      const g = t.createLinearGradient(0, benchY - size * 0.22 * res, 0, benchY);
      g.addColorStop(0, 'rgba(25,12,0,0)');
      g.addColorStop(1, 'rgba(25,12,0,0.5)');
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = g;
      t.fillRect(0, 0, px, px);
    }
    t.restore();
    c.save();
    if (rows) c.filter = 'drop-shadow(0 3px 7px rgba(0,0,0,0.45))';
    c.drawImage(scratch, x, y, size, size);
    c.restore();
  }

  // Someone without a camera (yet): a soft silhouette in their colour.
  function placeholder(c, s, colour) {
    const cx = s.x + s.size / 2;
    c.globalAlpha = 0.85;
    c.fillStyle = colour;
    c.beginPath();
    c.ellipse(cx, s.y + s.size * 0.38, s.size * 0.15, s.size * 0.18, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(cx, s.y + s.size * 0.95, s.size * 0.36, s.size * 0.33, 0, Math.PI, 0);
    c.fill();
  }

  // A fine film grain over the whole picture, so webcams and scene look like one photo.
  let noise = null;
  function grain(c) {
    if (typeof document === 'undefined') return;
    if (!noise) {
      noise = document.createElement('canvas');
      noise.width = 256;
      noise.height = 256;
      const n = noise.getContext('2d');
      const img = n.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() - 0.5) * 90;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      n.putImageData(img, 0, 0);
    }
    c.save();
    c.globalAlpha = 0.07;
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = c.createPattern(noise, 'repeat');
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  return { W, H, SCENES, layout, render, byId, bradyCells };
});
