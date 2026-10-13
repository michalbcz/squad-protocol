import { Application, Container, Graphics } from 'pixi.js';
import type { GameEvent, PlayerView, Tile, Unit, Vec } from '@sp/engine';
import { SOLDIER_SPRITES } from './soldier-sprite';

export const TILE = 48;

const SIDE_COLORS: Record<string, number> = { blue: 0x00ffff, red: 0xff3333 };
const TERRAIN: Record<Tile['terrain'], number> = {
  floor: 0x0000cc,
  grass: 0x00cc00,
  rubble: 0xcccc00,
  water: 0x00cccc,
  void: 0x000000,
};

export interface Preview {
  path?: Vec[];
  /** Cumulative AP cost at each path step. */
  costs?: number[];
  affordable?: number;
  target?: Vec;
}

export interface BoardCallbacks {
  /** Tap/click on a tile. `confirm` is true for a mouse click (hover already previewed). */
  onTap(tile: Vec, pointer: 'mouse' | 'touch'): void;
  onHover(tile: Vec | null): void;
  onLongPress(tile: Vec): void;
  onPointer(e: PointerEvent): void;
  /** `user` is true when the player panned/zoomed, false for programmatic moves. */
  onCamera(user: boolean): void;
}

/** PixiJS map renderer. Owns no game rules: it draws a PlayerView plus UI hints. */
export class Board {
  readonly app = new Application();
  private world = new Container();
  private tiles = new Graphics();
  private fog = new Graphics();
  private overlay = new Graphics();
  private unitsLayer = new Container();
  private fx = new Graphics();
  private tokens = new Map<string, Container>();
  private tracers: { from: Vec; to: Vec; t: number; color: number }[] = [];
  private flashes: { at: Vec; t: number }[] = [];
  private hint: Vec | null = null;
  private pendingCenter: Vec | null = null;
  private clock = 0;
  private view: PlayerView | null = null;
  private selected: string | null = null;
  private cursor: Vec | null = null;
  private preview: Preview = {};
  zoom = 1;
  private cb: BoardCallbacks;
  ready = false;

  constructor(cb: BoardCallbacks) {
    this.cb = cb;
  }

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: el,
      background: 0x000000,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.world.addChild(this.tiles, this.overlay, this.unitsLayer, this.fog, this.fx);
    this.app.stage.addChild(this.world);
    this.app.renderer.on('resize', () => {
      if (!this.ready) return;
      this.fit();
      const selected = this.view?.units.find((u) => u.id === this.selected);
      if (selected) this.centerOn(selected.pos);
    });
    this.app.ticker.add((t) => this.tick(t.deltaMS));
    this.bindPointer(this.app.canvas);
    this.ready = true;
    if (this.view) {
      this.redraw();
      this.fit();
    }
    if (this.pendingCenter) this.centerOn(this.pendingCenter);
    this.pendingCenter = null;
  }

  destroy(): void {
    if (!this.ready) return;
    this.ready = false;
    this.app.destroy(true, { children: true });
  }

  setView(view: PlayerView): void {
    const first = !this.view;
    this.view = view;
    if (!this.ready) return;
    this.redraw();
    if (first) this.fit();
  }

  setSelection(unitId: string | null, cursor: Vec | null, preview: Preview): void {
    this.selected = unitId;
    this.cursor = cursor;
    this.preview = preview;
    if (this.ready) this.drawOverlay();
    if (this.ready) this.drawUnits();
  }

  /** Pulsing marker used by the tutorial to point at a tile. */
  setHint(tile: Vec | null): void {
    this.hint = tile;
  }

  /** Animate events that the viewer witnessed, resolving once they finish. */
  async play(events: GameEvent[], speed = 1): Promise<void> {
    for (const e of events) {
      if (e.type === 'unitMoved') {
        await this.tweenToken(e.unitId, e.from, e.to, 110 / speed);
      } else if (e.type === 'shotFired') {
        this.tracers.push({ from: e.from, to: e.impact, t: 0, color: e.reaction ? 0xffff00 : 0xffffff });
        await wait(140 / speed);
      } else if (e.type === 'unitDamaged' || e.type === 'featureDestroyed') {
        const at = e.type === 'featureDestroyed' ? e.at : this.view?.units.find((u) => u.id === e.unitId)?.pos;
        if (at) this.flashes.push({ at, t: 0 });
        await wait(90 / speed);
      }
    }
  }

  centerOn(p: Vec): void {
    if (!this.ready) {
      this.pendingCenter = p;
      return;
    }
    const s = this.app.screen;
    this.world.position.set(s.width / 2 - (p.x + 0.5) * TILE * this.zoom, s.height / 2 - (p.y + 0.5) * TILE * this.zoom);
    this.frameMap();
    this.cb.onCamera(false);
  }

  private frameMap(): void {
    if (!this.view) return;
    const s = this.app.screen;
    // Keep automatic centering within the map; leave room for the DOM turn strip.
    const axis = (pos: number, length: number, start: number, end: number) =>
      length <= end - start ? start + (end - start - length) / 2 : Math.max(end - length, Math.min(start, pos));
    this.world.x = axis(this.world.x, this.view.map.width * TILE * this.zoom, 12, s.width - 12);
    this.world.y = axis(this.world.y, this.view.map.height * TILE * this.zoom, 72, s.height - 12);
  }

  zoomBy(f: number, around?: { x: number; y: number }): void {
    if (!this.ready) return;
    const s = this.app.screen;
    const c = around ?? { x: s.width / 2, y: s.height / 2 };
    const nz = Math.max(0.4, Math.min(2.5, this.zoom * f));
    const wx = (c.x - this.world.x) / this.zoom;
    const wy = (c.y - this.world.y) / this.zoom;
    this.zoom = nz;
    this.world.scale.set(nz);
    this.world.position.set(c.x - wx * nz, c.y - wy * nz);
    this.cb.onCamera(true);
  }

  /** Screen (CSS px) position of a tile's top-centre, for DOM tooltips. */
  tileToScreen(p: Vec): { x: number; y: number } {
    if (!this.ready) return { x: 0, y: 0 };
    return { x: this.world.x + (p.x + 0.5) * TILE * this.zoom, y: this.world.y + p.y * TILE * this.zoom };
  }

  private fit(): void {
    if (!this.view) return;
    const s = this.app.screen;
    const z = Math.min((s.width - 24) / (this.view.map.width * TILE), (s.height - 84) / (this.view.map.height * TILE));
    this.zoom = Math.max(0.4, Math.min(1.4, z * 0.95));
    this.world.scale.set(this.zoom);
    this.world.position.set(
      (s.width - this.view.map.width * TILE * this.zoom) / 2,
      (s.height - this.view.map.height * TILE * this.zoom) / 2,
    );
    this.frameMap();
    this.cb.onCamera(false);
  }

  private redraw(): void {
    this.drawTiles();
    this.drawFog();
    this.drawUnits();
    this.drawOverlay();
  }

  private drawTiles(): void {
    const v = this.view!;
    const g = this.tiles.clear();
    for (let y = 0; y < v.map.height; y++) {
      for (let x = 0; x < v.map.width; x++) {
        const t = v.map.tiles[y * v.map.width + x]!;
        const px = x * TILE;
        const py = y * TILE;
        g.rect(px, py, TILE, TILE).fill(0x000000);
        const ink = TERRAIN[t.terrain];
        if (t.terrain === 'grass') {
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
              g.rect(px + col * 12 + (row % 2) * 6, py + row * 12 + 3, 3, 3).fill(ink);
            }
          }
        } else if (t.terrain === 'floor') {
          for (let i = 0; i < TILE; i += 6) {
            g.rect(px + i, py, 3, 3).rect(px, py + i, 3, 3).fill(ink);
          }
        } else if (t.terrain === 'rubble') {
          for (let i = 0; i < 7; i++) {
            g.rect(px + 3 + ((i * 5 + x) % 13) * 3, py + 3 + ((i * 7 + y) % 13) * 3, 6, 3).fill(ink);
          }
        } else if (t.terrain === 'water') {
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 2; col++) {
              const wx = px + col * 24 + (row % 2) * 6;
              g.rect(wx, py + row * 12 + 3, 12, 3).rect(wx + 12, py + row * 12 + 6, 6, 3).fill(ink);
            }
          }
        }
        if (t.feature === 'wall') {
          g.rect(px, py, TILE, TILE).fill(0xaaaaaa);
          for (let row = 0; row < 4; row++) {
            g.rect(px, py + row * 12, TILE, 3).fill(0x000000);
            for (let col = 0; col < 2; col++) {
              g.rect(px + col * 24 + (row % 2) * 12, py + row * 12, 3, 12).fill(0x000000);
            }
          }
        } else if (t.feature === 'crate') {
          g.rect(px + 6, py + 9, 36, 30).fill(0x00cccc);
          g.rect(px + 9, py + 12, 30, 24).fill(0x000000);
          g.rect(px + 12, py + 15, 24, 3).rect(px + 12, py + 30, 24, 3).fill(0x00cccc);
          g.rect(px + 21, py + 21, 6, 6).fill(0x00ffff);
        } else if (t.feature === 'window') {
          g.rect(px, py + 15, TILE, 18).fill(0xaaaaaa);
          g.rect(px + 3, py + 18, 42, 12).fill(0x000000);
          g.rect(px + 6, py + 21, 15, 6).rect(px + 27, py + 21, 15, 6).fill(0x00ffff);
        } else if (t.feature === 'door') {
          g.rect(px + 3, py + 6, 3, 36).rect(px + 42, py + 6, 3, 36).fill(0xffff00);
          if (!t.doorOpen) {
            g.rect(px + 9, py + 18, 30, 12).fill(0xcccc00);
            g.rect(px + 12, py + 21, 24, 3).fill(0xffff00);
            g.rect(px + 30, py + 24, 3, 3).fill(0x000000);
          }
        }
      }
    }
  }

  private drawFog(): void {
    const v = this.view!;
    const g = this.fog.clear();
    for (let y = 0; y < v.map.height; y++) {
      for (let x = 0; x < v.map.width; x++) {
        if (!v.visible[y * v.map.width + x]) g.rect(x * TILE, y * TILE, TILE, TILE).fill({ color: 0x000000, alpha: 0.5 });
      }
    }
  }

  private drawUnits(): void {
    const v = this.view!;
    const live = new Set<string>();
    for (const u of v.units) {
      live.add(u.id);
      let token = this.tokens.get(u.id);
      if (!token) {
        token = new Container();
        token.addChild(new Graphics());
        this.unitsLayer.addChild(token);
        this.tokens.set(u.id, token);
        token.position.set(u.pos.x * TILE, u.pos.y * TILE);
      }
      if (!token.label?.startsWith('tween')) token.position.set(u.pos.x * TILE, u.pos.y * TILE);
      drawToken(token.children[0] as Graphics, u, u.id === this.selected, u.side === v.side);
    }
    for (const [id, token] of this.tokens) {
      if (!live.has(id)) {
        token.destroy();
        this.tokens.delete(id);
      }
    }
  }

  private drawOverlay(): void {
    const g = this.overlay.clear();
    const { path, costs, affordable, target } = this.preview;
    if (path && costs) {
      path.forEach((p, i) => {
        const ok = (costs[i] ?? Infinity) <= (affordable ?? 0);
        const size = i === path.length - 1 ? 12 : 6;
        g.rect((p.x + 0.5) * TILE - size / 2, (p.y + 0.5) * TILE - size / 2, size, size).fill(ok ? 0x00ff00 : 0xff3333);
      });
    }
    const sel = this.view?.units.find((u) => u.id === this.selected);
    if (target && sel) {
      g.moveTo((sel.pos.x + 0.5) * TILE, (sel.pos.y + 0.5) * TILE)
        .lineTo((target.x + 0.5) * TILE, (target.y + 0.5) * TILE)
        .stroke({ width: 3, color: 0xffff00 });
      brackets(g, target.x * TILE, target.y * TILE, 0xff3333);
    }
    if (this.cursor) {
      brackets(g, this.cursor.x * TILE, this.cursor.y * TILE, 0xffffff);
    }
  }

  private tick(dt: number): void {
    const g = this.fx.clear();
    this.clock += dt;
    if (this.hint) {
      const a = 0.45 + 0.4 * Math.sin(this.clock / 220);
      g.rect(this.hint.x * TILE + 3, this.hint.y * TILE + 3, TILE - 6, TILE - 6).stroke({ width: 3, color: 0xffff00, alpha: a });
    }
    this.tracers = this.tracers.filter((tr) => (tr.t += dt) < 260);
    for (const tr of this.tracers) {
      const a = 1 - tr.t / 260;
      g.moveTo((tr.from.x + 0.5) * TILE, (tr.from.y + 0.5) * TILE)
        .lineTo((tr.to.x + 0.5) * TILE, (tr.to.y + 0.5) * TILE)
        .stroke({ width: 3, color: tr.color, alpha: a });
    }
    this.flashes = this.flashes.filter((f) => (f.t += dt) < 300);
    for (const f of this.flashes) {
      const size = 6 + Math.floor(f.t / 60) * 3;
      const x = (f.at.x + 0.5) * TILE;
      const y = (f.at.y + 0.5) * TILE;
      g.rect(x - size, y - 3, size * 2, 6).rect(x - 3, y - size, 6, size * 2).fill({ color: 0xffff00, alpha: 1 - f.t / 300 });
    }
  }

  private tweenToken(id: string, from: Vec, to: Vec, ms: number): Promise<void> {
    const token = this.tokens.get(id);
    if (!token) return Promise.resolve();
    token.label = 'tween';
    return new Promise((resolve) => {
      let t = 0;
      const step = (tk: { deltaMS: number }) => {
        t = Math.min(1, t + tk.deltaMS / ms);
        token.position.set((from.x + (to.x - from.x) * t) * TILE, (from.y + (to.y - from.y) * t) * TILE);
        if (t >= 1) {
          this.app.ticker.remove(step);
          token.label = '';
          resolve();
        }
      };
      this.app.ticker.add(step);
    });
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; time: number; moved: boolean } | null = null;
    let pinch: { dist: number } | null = null;
    let longPress: ReturnType<typeof setTimeout> | null = null;

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const toTile = (p: { x: number; y: number }): Vec | null => {
      if (!this.view) return null;
      const x = Math.floor((p.x - this.world.x) / (TILE * this.zoom));
      const y = Math.floor((p.y - this.world.y) / (TILE * this.zoom));
      return x >= 0 && y >= 0 && x < this.view.map.width && y < this.view.map.height ? { x, y } : null;
    };
    const clearLong = () => {
      if (longPress) clearTimeout(longPress);
      longPress = null;
    };

    canvas.addEventListener('pointerdown', (e) => {
      this.cb.onPointer(e);
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        down = { ...p, time: performance.now(), moved: false };
        if (e.pointerType === 'touch') {
          longPress = setTimeout(() => {
            const tile = toTile(p);
            if (tile && down && !down.moved) {
              down.moved = true; // suppress the tap
              this.cb.onLongPress(tile);
            }
          }, 500);
        }
      } else if (pointers.size === 2) {
        clearLong();
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
        if (down) down.moved = true;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this.cb.onHover(toTile(p));
        return;
      }
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        this.zoomBy(dist / pinch.dist, { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 });
        pinch.dist = dist;
        // Two-finger pan follows the midpoint.
        this.world.x += (p.x - prev.x) / 2;
        this.world.y += (p.y - prev.y) / 2;
        return;
      }
      if (down && Math.hypot(p.x - down.x, p.y - down.y) > 8) {
        down.moved = true;
        clearLong();
      }
      if (down?.moved) {
        this.world.x += p.x - prev.x;
        this.world.y += p.y - prev.y;
        this.cb.onCamera(true);
      } else if (e.pointerType === 'mouse') {
        this.cb.onHover(toTile(p));
      }
    });

    const up = (e: PointerEvent) => {
      const p = local(e);
      pointers.delete(e.pointerId);
      clearLong();
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0 && down && !down.moved && e.type === 'pointerup') {
        const tile = toTile(p);
        if (tile) this.cb.onTap(tile, e.pointerType === 'mouse' ? 'mouse' : 'touch');
      }
      if (pointers.size === 0) down = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.cb.onHover(null);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, local(e as unknown as PointerEvent));
      },
      { passive: false },
    );
  }
}

function brackets(g: Graphics, x: number, y: number, color: number): void {
  for (const dx of [3, TILE - 15]) {
    for (const dy of [3, TILE - 15]) {
      g.rect(x + dx, y + dy + (dy === 3 ? 0 : 9), 12, 3)
        .rect(x + dx + (dx === 3 ? 0 : 9), y + dy, 3, 12).fill(color);
    }
  }
}

function drawToken(g: Graphics, u: Unit, selected: boolean, own: boolean): void {
  g.clear();
  const color = selected ? 0xffff00 : SIDE_COLORS[u.side] ?? 0xffffff;
  if (!u.alive) {
    for (let i = 0; i < 6; i++) {
      g.rect(15 + i * 3, 15 + i * 3, 3, 3).rect(30 - i * 3, 15 + i * 3, 3, 3).fill(color);
    }
    return;
  }
  // Knock out the terrain behind the silhouette so stipple never fills its gaps.
  g.rect(3, 0, 42, 45).fill(0x000000);
  for (const [y, row] of SOLDIER_SPRITES[u.facing]!.entries()) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#' || row[x] === '+') g.rect(x * 3, y * 3, 3, 3).fill(row[x] === '+' ? 0xffffff : color);
    }
  }
  if (selected) brackets(g, 0, 0, color);
  // The compass pip supplements the rotating body and bright rifle.
  const directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const [dx, dy] = directions[u.facing]!;
  g.rect(21 + dx! * 18, 21 + dy! * 18, 6, 6).fill(0xffffff);
  g.rect(9, 45, 30, 3).fill(0x000000);
  g.rect(9, 45, Math.ceil(10 * u.hp / u.maxHp) * 3, 3).fill(u.hp / u.maxHp > 0.5 ? 0x00ff00 : u.hp / u.maxHp > 0.25 ? 0xffff00 : 0xff3333);
  if (own) {
    for (let i = 0; i < 4; i++) {
      g.rect(0, 15 + i * 6, 3, 3).fill(u.ap / u.maxAp > i / 4 ? 0x00ffff : 0x005555);
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
