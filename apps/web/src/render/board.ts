import { Application, Container, Graphics } from 'pixi.js';
import type { GameEvent, PlayerView, Tile, Unit, Vec } from '@sp/engine';

export const TILE = 48;

const SIDE_COLORS: Record<string, number> = { blue: 0x4aa3ff, red: 0xff5a4f };
const TERRAIN: Record<Tile['terrain'], number> = {
  floor: 0x3a4250,
  grass: 0x2f4a32,
  rubble: 0x4d463c,
  water: 0x1d3c5c,
  void: 0x0b0e13,
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
      background: 0x0b0e13,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.world.addChild(this.tiles, this.overlay, this.unitsLayer, this.fog, this.fx);
    this.app.stage.addChild(this.world);
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
        this.tracers.push({ from: e.from, to: e.impact, t: 0, color: e.reaction ? 0xffd34d : 0xfff2b3 });
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
    this.cb.onCamera(false);
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
    const z = Math.min(s.width / (this.view.map.width * TILE), s.height / (this.view.map.height * TILE));
    this.zoom = Math.max(0.4, Math.min(1.4, z * 0.95));
    this.world.scale.set(this.zoom);
    this.world.position.set(
      (s.width - this.view.map.width * TILE * this.zoom) / 2,
      (s.height - this.view.map.height * TILE * this.zoom) / 2,
    );
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
        g.rect(px, py, TILE, TILE).fill(TERRAIN[t.terrain]);
        if (t.terrain !== 'void') g.rect(px, py, TILE, TILE).stroke({ width: 1, color: 0x000000, alpha: 0.18 });
        if (t.terrain === 'rubble') {
          for (let i = 0; i < 4; i++) g.circle(px + 10 + ((i * 13 + x * 7) % 30), py + 12 + ((i * 17 + y * 5) % 26), 3).fill(0x6a6052);
        }
        if (t.feature === 'wall') {
          g.rect(px, py, TILE, TILE).fill(0x8a93a3);
          g.rect(px, py, TILE, 6).fill(0xb8c0cc);
          g.rect(px, py + TILE - 4, TILE, 4).fill(0x5c6370);
        } else if (t.feature === 'crate') {
          g.roundRect(px + 7, py + 7, TILE - 14, TILE - 14, 4).fill(0x8a6a3a).stroke({ width: 2, color: 0x5e4626 });
          g.moveTo(px + 9, py + 9).lineTo(px + TILE - 9, py + TILE - 9).stroke({ width: 2, color: 0x5e4626 });
        } else if (t.feature === 'window') {
          g.rect(px, py + TILE / 2 - 5, TILE, 10).fill({ color: 0x9fdcff, alpha: 0.75 });
        } else if (t.feature === 'door') {
          if (t.doorOpen) g.rect(px + 2, py + 2, 8, TILE - 4).fill(0xc79a4a);
          else g.rect(px + 2, py + TILE / 2 - 7, TILE - 4, 14).fill(0xc79a4a).stroke({ width: 2, color: 0x7a5a24 });
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
        g.circle((p.x + 0.5) * TILE, (p.y + 0.5) * TILE, i === path.length - 1 ? 9 : 5).fill({ color: ok ? 0x7cf29a : 0xff6b6b, alpha: 0.9 });
      });
    }
    const sel = this.view?.units.find((u) => u.id === this.selected);
    if (target && sel) {
      g.moveTo((sel.pos.x + 0.5) * TILE, (sel.pos.y + 0.5) * TILE)
        .lineTo((target.x + 0.5) * TILE, (target.y + 0.5) * TILE)
        .stroke({ width: 2, color: 0xffd34d, alpha: 0.7 });
      g.circle((target.x + 0.5) * TILE, (target.y + 0.5) * TILE, TILE * 0.42).stroke({ width: 3, color: 0xffd34d });
    }
    if (this.cursor) {
      g.rect(this.cursor.x * TILE + 2, this.cursor.y * TILE + 2, TILE - 4, TILE - 4).stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
    }
  }

  private tick(dt: number): void {
    const g = this.fx.clear();
    this.clock += dt;
    if (this.hint) {
      const a = 0.45 + 0.4 * Math.sin(this.clock / 220);
      g.circle((this.hint.x + 0.5) * TILE, (this.hint.y + 0.5) * TILE, TILE * 0.48).stroke({ width: 4, color: 0xffd34d, alpha: a });
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
      g.circle((f.at.x + 0.5) * TILE, (f.at.y + 0.5) * TILE, 8 + f.t / 12).fill({ color: 0xff8844, alpha: 1 - f.t / 300 });
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

function drawToken(g: Graphics, u: Unit, selected: boolean, own: boolean): void {
  g.clear();
  const c = TILE / 2;
  const color = SIDE_COLORS[u.side] ?? 0xcccccc;
  if (!u.alive) {
    g.moveTo(c - 10, c - 10).lineTo(c + 10, c + 10).moveTo(c + 10, c - 10).lineTo(c - 10, c + 10).stroke({ width: 4, color, alpha: 0.6 });
    return;
  }
  if (selected) g.circle(c, c, TILE * 0.46).stroke({ width: 3, color: 0xffffff });
  g.circle(c, c, TILE * 0.32).fill(color).stroke({ width: 2, color: 0x0b0e13 });
  // Facing wedge.
  const ang = (u.facing * Math.PI) / 4 - Math.PI / 2;
  const tip = { x: c + Math.cos(ang) * TILE * 0.44, y: c + Math.sin(ang) * TILE * 0.44 };
  const l = { x: c + Math.cos(ang - 0.5) * TILE * 0.26, y: c + Math.sin(ang - 0.5) * TILE * 0.26 };
  const r = { x: c + Math.cos(ang + 0.5) * TILE * 0.26, y: c + Math.sin(ang + 0.5) * TILE * 0.26 };
  g.poly([tip.x, tip.y, l.x, l.y, r.x, r.y]).fill(0xffffff);
  // HP bar.
  const w = TILE * 0.7;
  g.rect(c - w / 2, TILE - 7, w, 4).fill(0x000000);
  g.rect(c - w / 2, TILE - 7, (w * u.hp) / u.maxHp, 4).fill(u.hp / u.maxHp > 0.5 ? 0x7cf29a : u.hp / u.maxHp > 0.25 ? 0xffd34d : 0xff6b6b);
  if (own) {
    // AP pip ring hint.
    const frac = u.ap / u.maxAp;
    g.moveTo(c, c - TILE * 0.38).arc(c, c, TILE * 0.38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
