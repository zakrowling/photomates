// Photomates room logic. Runs in the host's browser (window.PhotomatesEngine) and in Node for tests.
// It knows nothing about networking or cameras: the caller supplies broadcast(event, data) and
// send(playerId, event, data). Camera video goes directly between players (see client.js); the room
// only keeps track of who's here, where everyone sits, which scene is showing and the shutter.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotomatesEngine = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const MAX_PLAYERS = 12;
  const MAX_SPOTS = 24; // most spots any scene has
  const COUNTDOWN_MS = 3000;
  const MAX_STILL_CHARS = 600_000; // a data: URL for one person's photo
  const PART_CHARS = 14000; // PeerJS sends at most ~16KB per message, so photos go in pieces
  const MAX_PARTS = Math.ceil(MAX_STILL_CHARS / PART_CHARS);
  const SCENES = ['office', 'brady', 'bodybuilders', 'samurai', 'christmas'];
  // Any well-formed scene name is allowed (not just SCENES), so adding a scene never needs every host
  // to update; browsers that don't know a scene show the first one instead.
  const SCENE_ID = /^[a-z][a-z0-9-]{1,23}$/;
  const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const COLORS = [
    '#ff5d8f', '#3fa7ff', '#ffb52e', '#36c98e', '#a46bff', '#ff7a45',
    '#2ec4d6', '#e85bd8', '#8bc34a', '#f25c54', '#5b7cfa', '#d4a017',
  ];
  const NAMES = [
    'NOVA', 'LUNA', 'MOCHI', 'BOBA', 'PIXEL', 'KIWI', 'FIZZ', 'JUNO', 'OPAL', 'RUBY', 'TOFU', 'ZIGGY',
    'COSMO', 'DUSTY', 'GIZMO', 'HALO', 'IGGY', 'LUMO', 'MIRA', 'NEON', 'PIPS', 'QUILL', 'SPUD', 'VOLT',
    'WISP', 'YUKI', 'BEAN', 'FLUX', 'ECHO', 'GLOW', 'ASTRO', 'COMET', 'ORBIT', 'SUNNY', 'PEACH', 'MANGO',
  ];

  function generateRoomCode(isTaken = () => false) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      if (!isTaken(code)) return code;
    }
    throw new Error('Unable to allocate a unique room code');
  }

  class GameRoom {
    /**
     * @param {string} code room code
     * @param {object} hooks broadcast(event, data), send(playerId, event, data), optional random and now
     */
    constructor(code, hooks) {
      this.code = code;
      this.broadcast = hooks.broadcast;
      this.send = hooks.send;
      this.random = hooks.random || Math.random;
      this.now = hooks.now || (() => Date.now());
      this.hostId = null;
      this.players = new Map(); // id -> { id, number, name, color }
      this.order = []; // player ids in joining order (decides who hosts next)
      this.spots = new Map(); // id -> which spot in the scene they're in (0 is the best spot)
      this.scene = SCENES[0];
      this.shot = 0; // which photo we're on
      this.shotAt = 0; // when the current photo's shutter fires (host clock)
      this.stills = new Map(); // id -> how much of their photo has arrived for this shot
    }

    get size() {
      return this.players.size;
    }

    rand(n) {
      return Math.floor(this.random() * n);
    }

    join(id, preferredName) {
      if (this.players.has(id)) return { ok: false, error: 'Already in this room.' };
      if (this.players.size >= MAX_PLAYERS) return { ok: false, error: `This photobooth is full (max ${MAX_PLAYERS} mates)!` };
      const taken = new Set([...this.players.values()].map((p) => p.number));
      let number = 1;
      while (taken.has(number)) number++;
      const used = new Set([...this.players.values()].map((p) => p.name));
      const names = NAMES.filter((n) => !used.has(n));
      const name = names.includes(preferredName) ? preferredName : names[this.rand(names.length)];
      const usedColors = new Set([...this.players.values()].map((p) => p.color));
      const color = COLORS.find((c) => !usedColors.has(c)) || COLORS[number % COLORS.length];
      this.players.set(id, { id, number, name, color });
      this.order.push(id);
      const usedSpots = new Set(this.spots.values());
      let spot = 0;
      while (usedSpots.has(spot)) spot++;
      this.spots.set(id, spot);
      if (!this.hostId) this.hostId = id;
      return { ok: true, payload: { playerId: id, ...this.lobbyPayload() } };
    }

    announceJoin() {
      this.broadcastLobby();
    }

    leave(id) {
      if (!this.players.delete(id)) return;
      this.order = this.order.filter((p) => p !== id);
      this.spots.delete(id);
      if (this.players.size === 0) return;
      if (this.hostId === id) this.hostId = this.order[0];
      this.broadcastLobby();
    }

    // There's no round to start: everyone is in the booth as soon as they join.
    start() {
      return false;
    }

    /**
     * { type: 'scene', id }      switch everyone to a scene
     * { type: 'shuffle', spots } move everyone to random spots out of the scene's `spots` (so even
     *                          one person can be moved somewhere else)
     * { type: 'shutter' }        start the 3-2-1 countdown
     * { type: 'stillPart', n, i, total, data } piece i of my photo (a data: URL) for shot n, passed on
     *                          to everyone else
     */
    input(id, msg) {
      if (!msg || typeof msg !== 'object' || !this.players.has(id)) return false;
      switch (msg.type) {
        case 'scene':
          if (typeof msg.id !== 'string' || !SCENE_ID.test(msg.id) || msg.id === this.scene) return false;
          this.scene = msg.id;
          this.broadcastLobby();
          return true;
        case 'shuffle': {
          const n = this.order.length;
          const spots = Math.max(n, Math.min(MAX_SPOTS, Number.isInteger(msg.spots) ? msg.spots : n));
          if (spots < 2) return false;
          const before = this.order.map((p) => this.spots.get(p)).join();
          // Random spots for everyone (trying again if nothing moved).
          for (let attempt = 0; attempt < 10; attempt++) {
            const pool = Array.from({ length: spots }, (_, i) => i);
            for (let i = pool.length - 1; i > 0; i--) {
              const j = this.rand(i + 1);
              [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            this.order.forEach((p, i) => this.spots.set(p, pool[i]));
            if (this.order.map((p) => this.spots.get(p)).join() !== before) break;
          }
          this.broadcastLobby();
          return true;
        }
        case 'shutter':
          // One photo at a time: ignore presses during a countdown and for a moment after it.
          if (this.shotAt && this.now() < this.shotAt + 2000) return false;
          this.shot++;
          this.shotAt = this.now() + COUNTDOWN_MS;
          this.stills = new Map();
          this.broadcast('shutter', { n: this.shot, ms: COUNTDOWN_MS, by: this.players.get(id).name });
          return true;
        case 'stillPart': {
          const { n, i, total, data } = msg;
          if (n !== this.shot || !Number.isInteger(total) || total < 1 || total > MAX_PARTS) return false;
          if (!Number.isInteger(i) || i < 0 || i >= total || typeof data !== 'string' || data.length > PART_CHARS) return false;
          if (i === 0 && !data.startsWith('data:image/')) return false;
          const sent = (this.stills.get(id) || 0) + data.length;
          if (sent > MAX_STILL_CHARS) return false;
          this.stills.set(id, sent);
          this.players.forEach((p) => { if (p.id !== id) this.send(p.id, 'stillPart', { id, n, i, total, data }); });
          return true;
        }
        default:
          return false;
      }
    }

    lobbyPayload() {
      const players = this.order.map((id) => ({ ...this.players.get(id), seat: this.spots.get(id) }));
      return { roomCode: this.code, hostId: this.hostId, started: false, scene: this.scene, shot: this.shot, players };
    }

    broadcastLobby() {
      this.broadcast('lobbyUpdate', this.lobbyPayload());
    }

    destroy() {}
  }

  return { GameRoom, generateRoomCode, MAX_PLAYERS, COUNTDOWN_MS, MAX_STILL_CHARS, PART_CHARS, SCENES, COLORS, NAMES };
});
