// Photomates scenes: where everyone sits and what's drawn around them, on a 1280×720 stage.
// Each person is a square, background-removed picture (head near the top, shoulders at the bottom).
// Row scenes (the office) draw back to front: a row's seats, then the people sitting in them,
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
  function photoScene({ id, name, src, rows, priority, solo, tone, benchShadow = 0.5, capacity }) {
    return {
      id,
      name,
      kind: 'rows',
      capacity,
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
  function bodyScene({ id, name, src, necks, tone, headScale = 5.1, sides = '#0a0d16', sink = 0.75 }) {
    return {
      id,
      name,
      kind: 'heads',
      capacity: necks.length,
      tone,
      seats: necks.map(([x, y, w]) => {
        const size = w * headScale;
        return { x: x - size / 2, y: y + w * sink - CHIN_AT * size, size, neck: { x, y, w } };
      }),
      // The whole photo, fitted to the stage's height (necks are measured that way), dark either side.
      draw(c) {
        c.fillStyle = sides;
        c.fillRect(0, 0, W, H);
        const img = photo(src);
        if (!img) return;
        const k = H / img.naturalHeight;
        c.drawImage(img, (W - img.naturalWidth * k) / 2, 0, img.naturalWidth * k, H);
      },
    };
  }

  // Bodybuilders (assets/bg/bodybuilders.jpg): 6 bodies, three standing at the back and three kneeling
  // in front. The middle standing one first, then the middle kneeling one, then outwards.
  const bodybuilders = bodyScene({
    id: 'bodybuilders',
    name: 'Bodybuilders',
    src: 'assets/bg/bodybuilders.jpg',
    necks: [
      [636, 112, 41],
      [628, 398, 47],
      [355, 130, 41],
      [886, 124, 41],
      [307, 382, 45],
      [962, 387, 45],
    ],
    // Warm studio light on oiled skin.
    tone: 'contrast(1.08) saturate(1.1) sepia(0.18) brightness(1.02)',
  });
  // Samurai (assets/bg/samurai.jpg): 6 headless warriors, three standing at the back and three
  // kneeling in front. Their necks are slimmer than the bodybuilders', so heads are scaled up more.
  const samurai = bodyScene({
    id: 'samurai',
    name: 'Samurai',
    src: 'assets/bg/samurai.jpg',
    necks: [
      [640, 84, 29],
      [646, 350, 33],
      [391, 68, 31],
      [883, 63, 32],
      [323, 324, 29],
      [969, 344, 29],
    ],
    headScale: 5.0,
    sink: 1.0,
    // Cool, dim stage light.
    tone: 'contrast(1.05) saturate(0.9) brightness(0.92) hue-rotate(-4deg)',
    sides: '#0b1020',
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

  // Christmas (assets/bg/christmas.jpg): a retro Polaroid of 6 headless mates in Christmas jumpers,
  // three standing and three sitting in front. The photo fills the whole stage (the patterned edges are
  // the background), so the necks are measured on the full photo.
  const christmas = bodyScene({
    id: 'christmas',
    name: 'Christmas',
    src: 'assets/bg/christmas.jpg',
    necks: [
      [650, 159, 31],
      [646, 354, 32],
      [528, 171, 31],
      [764, 169, 31],
      [476, 364, 31],
      [811, 362, 31],
    ],
    headScale: 4.3,
    sink: 0.55,
    // Faded, warm 80s film.
    tone: 'sepia(0.35) saturate(0.85) contrast(0.92) brightness(1.02)',
    sides: '#f3ecec',
  });

  // Vintage Airplane (assets/bg/airplane.jpg): the 6 front-row seats either side of the aisle. Everyone
  // sits in a seat with their face in front of its headrest, and the seat-back tables in front hide them
  // from the chest down. Middle seats fill first.
  const airplane = photoScene({
    id: 'airplane',
    name: 'Vintage Airplane',
    src: 'assets/bg/airplane.jpg',
    rows: [{ bench: 565, faceY: 456, size: 232, xs: [183, 359, 523, 753, 919, 1093] }],
    priority: [[0, 2], [0, 3], [0, 1], [0, 4], [0, 0], [0, 5]],
    solo: [0, 2],
    capacity: 6,
    // Warm, golden cabin light.
    tone: 'sepia(0.25) saturate(0.9) contrast(0.95) brightness(1.03)',
    benchShadow: 0.35,
  });

  const SCENES = [office, airplane, brady, bodybuilders, samurai, christmas];
  const byId = (id) => SCENES.find((s) => s.id === id) || SCENES[0];

  // Seat rectangles (where each person's square picture goes) for n people, in seat order.
  function layout(sceneId, n) {
    const scene = byId(sceneId);
    // Boards have a fixed number of holes: anyone beyond that isn't in the picture.
    return slots(sceneId, n).slice(0, scene.capacity ? Math.min(n, scene.capacity) : n);
  }

  // Every spot in a scene for a group of n, best first (spot 0 is where someone on their own goes).
  function slots(sceneId, n) {
    const scene = byId(sceneId);
    if (scene.kind === 'holes' || scene.kind === 'heads') return scene.seats;
    if (scene.kind === 'grid') return layoutCells(scene.cells(n));
    const solo = scene.solo || [1, 2];
    const order = n === 1 ? [solo, ...scene.priority.filter(([r, i]) => r !== solo[0] || i !== solo[1])] : scene.priority;
    return rowSeats(scene, order);
  }

  function layoutCells(cells) {
    return cells.map((cell) => {
      // Head and shoulders filling the cell's height, face in the upper middle.
      const size = Math.min(cell.w * 1.1, cell.h * 1.2);
      return { x: cell.x + cell.w / 2 - size / 2, y: cell.y - size * 0.06, size, clip: cell, row: 0, bench: cell.y + cell.h };
    });
  }

  function rowSeats(scene, order) {
    return order.map(([r, i]) => {
      const row = scene.rows[r];
      const size = row.size;
      // Photo rows say where the face goes; drawn rows tuck the bottom of the picture behind the bench.
      const y = row.faceY !== undefined ? row.faceY - FACE_AT * size : row.bench + size * 0.28 - size;
      return { x: row.xs[i] - size / 2, y, size, row: r, bench: row.bench, cx: row.xs[i] };
    });
  }

  // Who's in which spot: everyone keeps their own spot if the scene has it, otherwise takes the best free
  // one. Returns Map(spot index -> person); anyone who doesn't fit (a full board) is left out.
  function assign(spots, people) {
    const at = new Map();
    const homeless = [];
    [...people].sort((a, b) => a.seat - b.seat).forEach((p) => {
      if (Number.isInteger(p.seat) && p.seat >= 0 && p.seat < spots.length && !at.has(p.seat)) at.set(p.seat, p);
      else homeless.push(p);
    });
    homeless.forEach((p) => {
      const free = spots.findIndex((_, i) => !at.has(i));
      if (free >= 0) at.set(free, p);
    });
    return at;
  }

  // Fills every empty spot by repeating the people already there (in spot order), so a scene always
  // looks full: on your own, every seat is you. Only people with a picture are repeated.
  function fillUp(spots, at) {
    const real = [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p).filter((p) => p.image);
    if (!real.length) return at;
    const full = new Map(at);
    let k = 0;
    spots.forEach((_, i) => {
      if (!full.has(i)) full.set(i, real[k++ % real.length]);
    });
    return full;
  }

  /**
   * Draw a scene with everyone in it.
   * people: [{ seat, image (canvas/img or null), color, bottom }]. image null draws a placeholder;
   * bottom is how far down (0-1) their picture their body reaches.
   */
  function render(c, sceneId, people) {
    const scene = byId(sceneId);
    const seats = slots(sceneId, people.length);
    const at = fillUp(seats, assign(seats, people));
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
      const g = t.createRadialGradient(0, 0, ry * 0.92, 0, 0, ry);
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

  return { W, H, SCENES, layout, slots, assign, fillUp, render, byId, bradyCells };
});
