// Photomates scenes: where everyone sits and what's drawn around them, on a 1280×720 stage.
// Each person is a square, background-removed picture (head near the top, shoulders at the bottom).
// Row scenes (office, outdoor theatre, stadium) draw back to front: a row's seats, then the people sitting in them,
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
    drawPhotoImage(c, img, fromY);
  }

  function drawPhotoImage(c, img, fromY = 0) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const k = Math.max(W / iw, H / ih);
    const dw = iw * k;
    const dh = ih * k;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    c.save();
    c.beginPath();
    c.rect(0, fromY, W, H - fromY);
    c.clip();
    c.drawImage(img, dx, dy, dw, dh);
    c.restore();
  }

  // A scene made from a straight-on photo of rows of seats. rows (on the 1280×720 stage, back to front):
  // bench is the edge that hides people's lower half (a desk top, a step's front edge), faceY is where a
  // seated face goes, size is how big people are in that row, xs are the seats' centres.
  function photoScene({ id, name, src, rows, priority, solo, tone, benchShadow = 0.5 }) {
    return {
      id,
      name,
      kind: 'rows',
      rows,
      priority,
      solo,
      tone,
      benchShadow,
      background(c) {
        drawPhoto(c, src);
      },
      seatBacks() {},
      front(c, r) {
        drawPhoto(c, src, rows[r].bench);
      },
    };
  }

  // Office: a tiered auditorium with desks (assets/bg/office.jpg). Faces go just above the chair backs.
  const office = photoScene({
    id: 'office',
    name: 'Office',
    src: 'assets/bg/office.jpg',
    rows: [
      { bench: 298, faceY: 232, size: 140, xs: [168, 406, 643, 880, 1117] },
      { bench: 368, faceY: 291, size: 164, xs: [252, 512, 773, 1035] },
      { bench: 468, faceY: 378, size: 191, xs: [87, 363, 643, 923, 1199] },
      { bench: 645, faceY: 521, size: 263, xs: [160, 483, 804, 1128] },
    ],
    // Front row first, then fanning out and back.
    priority: [[3, 1], [3, 2], [2, 2], [3, 0], [3, 3], [2, 1], [2, 3], [1, 1], [1, 2], [2, 0], [2, 4], [1, 0], [1, 3], [0, 2]],
    solo: [2, 2],
    // The photo is warm and evenly lit: warm webcams up a touch and soften their contrast to match.
    tone: 'saturate(0.92) sepia(0.12) contrast(0.97) brightness(0.97)',
  });

  // Outdoor Theatre: sunny concrete steps among trees (assets/bg/outdoor-theatre.jpg). Everyone sits on
  // a step, and its front edge hides them from the seat down.
  const steps = (bench, size, xs) => ({ bench, faceY: Math.round(bench - size * 0.47), size, xs });
  const outdoor = photoScene({
    id: 'outdoor',
    name: 'Outdoor Theatre',
    src: 'assets/bg/outdoor-theatre.jpg',
    rows: [
      steps(401, 150, [240, 440, 640, 840, 1040]),
      steps(480, 170, [325, 535, 745, 955]),
      steps(562, 195, [180, 410, 640, 870, 1100]),
      steps(666, 225, [290, 520, 760, 990]),
    ],
    priority: [[3, 1], [3, 2], [2, 2], [3, 0], [3, 3], [2, 1], [2, 3], [1, 1], [1, 2], [2, 0], [2, 4], [1, 0], [1, 3], [0, 2]],
    solo: [2, 2],
    // Bright, slightly cool daylight; only a faint shadow where they meet the step.
    tone: 'saturate(0.95) contrast(1.04) brightness(1.06)',
    benchShadow: 0.25,
  });

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

  // ---------- Face-in-hole boards ----------

  // A photo with green ovals where faces go. The green is keyed out (made see-through) once the photo
  // loads, then everyone's face is drawn behind the photo, scaled to fill their hole, so the photo's own
  // oval edge frames each face like a fairground cut-out board.
  const keyed = new Map();
  function keyedPhoto(src, feather = 0) {
    if (keyed.has(src)) return keyed.get(src);
    const img = photo(src);
    if (!img) return null;
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const k = cv.getContext('2d', { willReadFrequently: true });
    k.drawImage(img, 0, 0);
    const data = k.getImageData(0, 0, cv.width, cv.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const other = Math.max(d[i], d[i + 2]);
      const green = d[i + 1] - other;
      if (green > 90) {
        d[i + 3] = 0;
      } else if (green > 30) {
        // The oval's soft edge: partly see-through, and its green tint removed.
        d[i + 3] = Math.round(255 * (1 - (green - 30) / 60));
        d[i + 1] = other;
      }
    }
    k.putImageData(data, 0, 0);
    // Underneath the faces: the board with its holes filled in by blurring the colours around them, so
    // gaps around a face (beside the hair, in the feathered edge) show the photo, not black.
    const under = document.createElement('canvas');
    under.width = cv.width;
    under.height = cv.height;
    const u = under.getContext('2d');
    u.drawImage(cv, 0, 0);
    // Each pass blurs a copy and slips it underneath, filling the holes from their edges inwards.
    const copy = document.createElement('canvas');
    copy.width = cv.width;
    copy.height = cv.height;
    const cc = copy.getContext('2d');
    [4, 8, 16, 32, 48, 48].forEach((r) => {
      cc.clearRect(0, 0, copy.width, copy.height);
      cc.drawImage(under, 0, 0);
      u.globalCompositeOperation = 'destination-over';
      u.filter = `blur(${r}px)`;
      u.drawImage(copy, 0, 0);
    });
    u.filter = 'none';
    u.globalCompositeOperation = 'source-over';
    if (feather) featherHoles(cv, feather);
    const entry = { board: cv, under };
    keyed.set(src, entry);
    return entry;
  }

  // Softens each hole's edge: the board fades out over `px` pixels just outside the oval, so faces blend
  // into the photo instead of sitting behind a hard cut line. (The fade is outside the oval so no green
  // fringe shows.)
  function featherHoles(cv, px) {
    const w = cv.width;
    const h = cv.height;
    const holes = document.createElement('canvas');
    holes.width = w;
    holes.height = h;
    const hc = holes.getContext('2d', { willReadFrequently: true });
    // White where the board is see-through.
    const board = cv.getContext('2d', { willReadFrequently: true });
    const data = board.getImageData(0, 0, w, h);
    const m = hc.createImageData(w, h);
    for (let i = 3; i < data.data.length; i += 4) {
      const v = 255 - data.data[i];
      m.data[i - 3] = v;
      m.data[i - 2] = v;
      m.data[i - 1] = v;
      m.data[i] = 255;
    }
    hc.putImageData(m, 0, 0);
    // Grow the holes by the feather width, then blur: the fade starts at the oval's edge and ends px out.
    const grow = document.createElement('canvas');
    grow.width = w;
    grow.height = h;
    const gc = grow.getContext('2d', { willReadFrequently: true });
    gc.filter = `blur(${px / 2}px)`;
    gc.drawImage(holes, 0, 0);
    const gd = gc.getImageData(0, 0, w, h);
    for (let i = 0; i < gd.data.length; i += 4) {
      const v = gd.data[i] > 8 ? 255 : 0;
      gd.data[i] = v;
      gd.data[i + 1] = v;
      gd.data[i + 2] = v;
    }
    hc.putImageData(gd, 0, 0);
    gc.clearRect(0, 0, w, h);
    gc.filter = `blur(${px / 2}px)`;
    gc.drawImage(holes, 0, 0);
    const soft = gc.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = Math.min(data.data[i], 255 - soft[i - 3]);
    board.putImageData(data, 0, 0);
  }

  function holeScene({ id, name, src, holes, holeW, holeH, tone, faceScale = 3.1, feather = 0 }) {
    return {
      id,
      name,
      kind: 'holes',
      capacity: holes.length,
      tone,
      // Faces sized to fill the hole, a touch low so the forehead fills its top.
      seats: holes.map(([cx, cy]) => {
        const size = holeW * faceScale;
        return { x: cx - size / 2, y: cy + holeH * 0.06 - FACE_AT * size, size, hole: { cx, cy, w: holeW, h: holeH } };
      }),
      drawUnder(c) {
        const k = keyedPhoto(src, feather);
        if (k) drawPhotoImage(c, k.under);
      },
      drawBoard(c) {
        const k = keyedPhoto(src, feather);
        if (k) drawPhotoImage(c, k.board);
        else drawPhoto(c, src);
      },
    };
  }

  // ---------- Heads on bodies ----------

  // A photo of headless bodies. Each person's head (their cut-out, faded out below the chin) goes on top
  // of a neck: necks are [x, y, width] for the middle of each neck's top edge on the stage. Heads are
  // sized from the neck's width and placed so the chin sits a little over the neck top.
  const CHIN_AT = 0.585; // how far down each person's picture their chin is (see updateCrop in client.js)
  function bodyScene({ id, name, src, necks, tone, headScale = 4.1 }) {
    return {
      id,
      name,
      kind: 'heads',
      capacity: necks.length,
      tone,
      seats: necks.map(([x, y, w]) => {
        const size = w * headScale;
        return { x: x - size / 2, y: y + w * 0.3 - CHIN_AT * size, size, neck: { x, y, w } };
      }),
      draw(c) {
        drawPhoto(c, src);
      },
    };
  }

  // Bodybuilders (assets/bg/bodybuilders.jpg): 11 bodies. The middle one first, then the two kneeling at
  // the front, then outwards.
  const bodybuilders = bodyScene({
    id: 'bodybuilders',
    name: 'Bodybuilders',
    src: 'assets/bg/bodybuilders.jpg',
    necks: [
      [645, 180, 47],
      [322, 334, 39],
      [945, 375, 39],
      [505, 232, 41],
      [786, 230, 41],
      [387, 218, 43],
      [912, 218, 41],
      [251, 239, 39],
      [1006, 223, 39],
      [144, 220, 43],
      [1105, 214, 41],
    ],
    // Warm, contrasty stage lighting to match the bodies.
    tone: 'contrast(1.1) saturate(1.1) sepia(0.15) brightness(0.98)',
  });

  // The Matey Bunch (assets/bg/the-matey-bunch.jpg): the photo's 3×3 grid with the logo in the middle
  // square leaves 8 squares for people, filled in a balanced order. Bigger groups use the drawn grid.
  const MATEY_PHOTO = 'assets/bg/the-matey-bunch.jpg';
  const MATEY_CELLS = [
    { x: 482, y: 0, w: 318, h: 234 }, // top middle
    { x: 482, y: 486, w: 318, h: 234 }, // bottom middle
    { x: 160, y: 240, w: 316, h: 240 }, // middle left
    { x: 805, y: 240, w: 315, h: 240 }, // middle right
    { x: 160, y: 0, w: 316, h: 234 }, // corners
    { x: 805, y: 0, w: 315, h: 234 },
    { x: 160, y: 486, w: 316, h: 234 },
    { x: 805, y: 486, w: 315, h: 234 },
  ];
  const usesPhotoGrid = (n) => n <= MATEY_CELLS.length;

  const brady = {
    id: 'brady',
    name: 'The Matey Bunch',
    kind: 'grid',
    cells: (n) => (usesPhotoGrid(n) ? MATEY_CELLS : bradyCells(n)),
    tone: 'saturate(1.12) contrast(1.05)',
    // A TV title card: crisp cut-outs, no soft edges.
    hardEdges: true,
  };

  const SCENES = [office, outdoor, stadium, brady, bodybuilders];
  const byId = (id) => SCENES.find((s) => s.id === id) || SCENES[0];

  // Seat rectangles (where each person's square picture goes) for n people, in seat order.
  function layout(sceneId, n) {
    const scene = byId(sceneId);
    // Boards have a fixed number of holes: anyone beyond that isn't in the picture.
    if (scene.kind === 'holes' || scene.kind === 'heads') return scene.seats.slice(0, Math.min(n, scene.capacity));
    if (scene.kind === 'grid') {
      return scene.cells(n).slice(0, n).map((cell) => {
        // Head and shoulders filling the cell's height, face in the upper middle.
        const size = Math.min(cell.w * 1.1, cell.h * 1.2);
        return { x: cell.x + cell.w / 2 - size / 2, y: cell.y - size * 0.06, size, clip: cell, row: 0, bench: cell.y + cell.h };
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
    if (scene.kind === 'heads') {
      // The bodies, then everyone's head on top, back to front (higher necks are further back).
      scene.draw(c);
      seats
        .map((s, i) => ({ s, p: at.get(i) }))
        .sort((a, b) => a.s.neck.y - b.s.neck.y)
        .forEach(({ s, p }) => drawPerson(c, p, s, scene));
    } else if (scene.kind === 'holes') {
      // Faces first, behind the board; the board's see-through holes frame them.
      c.fillStyle = '#16100d';
      c.fillRect(0, 0, W, H);
      scene.drawUnder(c);
      seats.forEach((s, i) => drawPerson(c, at.get(i), s, scene));
      scene.drawBoard(c);
    } else if (scene.kind === 'grid') {
      c.fillStyle = '#0b0b0f';
      c.fillRect(0, 0, W, H);
      const photoGrid = usesPhotoGrid(people.length) && photo(MATEY_PHOTO);
      if (photoGrid) {
        // The 4:3 photo in the middle of the 16:9 stage, black either side.
        const img = photoGrid;
        const k = H / img.naturalHeight;
        c.drawImage(img, (W - img.naturalWidth * k) / 2, 0, img.naturalWidth * k, H);
      }
      seats.forEach((s, i) => {
        const cell = s.clip;
        if (!photoGrid) {
          c.fillStyle = '#5e9de6';
          c.fillRect(cell.x, cell.y, cell.w, cell.h);
        }
        c.save();
        c.beginPath();
        // A little into the black line below, so no sliver of the square's colour shows under them
        // (the photo's squares don't end on whole pixels once scaled to the stage).
        c.rect(cell.x, cell.y, cell.w, cell.h + 1.5);
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
    const crisp = scene.hardEdges ? hardened(person) : null;
    let size = s.size;
    let y = s.y;
    if (crisp) {
      // Crisp cut-outs: the body's hard bottom edge sits just past the bottom of the square, so it
      // runs flush to the edge (grown around the face first, then lowered as far as needed).
      const bottom = hardCache.get(person.image).bottom;
      const faceY = s.y + FACE_AT * s.size;
      const below = Math.max(0.05, bottom - FACE_AT);
      let need = s.bench + 4 - (s.y + bottom * s.size);
      if (need > 0) {
        size = s.size * Math.min(1.2, 1 + need / (below * s.size));
        y = faceY - FACE_AT * size;
        need = s.bench + 4 - (y + bottom * size);
        if (need > 0) y += need;
      }
    } else if (s.bench !== undefined) {
      // If their body ends above the desk (or the bottom of their square), first grow them a little
      // around their face, then lower them only as much as still needed so it hides the end.
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
    t.drawImage(crisp || person.image, 0, 0, px, px);
    t.filter = 'none';
    if (s.neck) {
      // Heads only: keep a soft oval around the head (hair to chin), so shoulders and shirt disappear and
      // the body underneath is the photo's.
      const cx = px / 2;
      const cy = 0.33 * px;
      const ry = (CHIN_AT - 0.33 + 0.02) * px;
      const rx = 0.24 * px;
      t.save();
      t.globalCompositeOperation = 'destination-in';
      t.translate(cx, cy);
      t.scale(rx / ry, 1);
      const g = t.createRadialGradient(0, 0, ry * 0.86, 0, 0, ry);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      t.fillStyle = g;
      t.fillRect(-px * 2, -px, px * 4, px * 2);
      t.restore();
    }
    if (rows) {
      // The desk's (or step's) shadow across their lower body.
      const benchY = (s.bench - y) * res;
      const g = t.createLinearGradient(0, benchY - size * 0.22 * res, 0, benchY);
      g.addColorStop(0, 'rgba(25,12,0,0)');
      g.addColorStop(1, `rgba(25,12,0,${scene.benchShadow ?? 0.5})`);
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

  // A copy of someone's cut-out with crisp edges: soft (feathered or faded) edges snap to fully in or
  // out. Cached per picture and only redone when the picture changes (person.version).
  const hardCache = new WeakMap();
  function hardened(person) {
    const src = person.image;
    const w = src.naturalWidth || src.width;
    const h = src.naturalHeight || src.height;
    let entry = hardCache.get(src);
    if (entry && entry.version === person.version && entry.canvas.width === w) return entry.canvas;
    if (!entry) {
      entry = { canvas: document.createElement('canvas'), version: null };
      hardCache.set(src, entry);
    }
    entry.canvas.width = w;
    entry.canvas.height = h;
    const ctx = entry.canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // Fully in or fully out, and where the (now crisp) body ends.
    let bottom = 0;
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3;
        d[i] = d[i] >= 120 ? 255 : 0;
        row += d[i];
      }
      if (row > w * 255 * 0.2) bottom = (y + 1) / h;
    }
    ctx.putImageData(img, 0, 0);
    entry.version = person.version;
    entry.bottom = bottom || 1;
    return entry.canvas;
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
