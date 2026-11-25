// Walking paths for police officers on foot: a grid over the whole city (1 m squares).
// Squares inside buildings, walls, stalls and crates are blocked. A* finds a way round them,
// then the path is "pulled tight" so officers walk in straight lines, not zig-zags.
import { MinHeap } from './traffic.js';

export class NavGrid {
  constructor(world, x0, z0, x1, z1, cell = 1, pad = 0.45) {
    this.cell = cell; this.x0 = x0; this.z0 = z0;
    this.w = Math.ceil((x1 - x0) / cell); this.h = Math.ceil((z1 - z0) / cell);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n); this.came = new Int32Array(n); this.seen = new Uint32Array(n); this.gen = 0;
    // Outside the map is blocked.
    for (const b of world.buildings) {
      if (b.h < 0.5) continue;
      this.fillRect(b.x0 - pad, b.z0 - pad, b.x1 + pad, b.z1 + pad);
    }
    for (const c of world.circles) this.fillRect(c.x - c.r - pad * 0.6, c.z - c.r - pad * 0.6, c.x + c.r + pad * 0.6, c.z + c.r + pad * 0.6);
  }

  fillRect(x0, z0, x1, z1) {
    const c = this.cell;
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / c - 0.5)), i1 = Math.min(this.w - 1, Math.floor((x1 - this.x0) / c - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / c - 0.5)), j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / c - 0.5));
    for (let j = j0; j <= j1; j++) this.blocked.fill(1, j * this.w + i0, j * this.w + i1 + 1);
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  cx(id) { return this.x0 + ((id % this.w) + 0.5) * this.cell; }
  cz(id) { return this.z0 + (Math.floor(id / this.w) + 0.5) * this.cell; }
  free(id) { return id >= 0 && !this.blocked[id]; }

  // Nearest free square (for a goal next to a wall).
  nearestFree(id) {
    if (this.free(id)) return id;
    if (id < 0) return -1;
    const i = id % this.w, j = Math.floor(id / this.w);
    for (let r = 1; r <= 4; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue;
        const k = jj * this.w + ii;
        if (!this.blocked[k]) return k;
      }
    }
    return -1;
  }

  // Straight walk possible? (samples every half square)
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (!this.free(this.idx(ax + (bx - ax) * t, az + (bz - az) * t))) return false;
    }
    return true;
  }

  // A* from (sx, sz) to (gx, gz). Returns [{x, z}, ...] (smoothed) or null.
  // With a long search it gives up and returns the path to the closest point it reached.
  findPath(sx, sz, gx, gz, maxExpand = 7000) {
    let start = this.nearestFree(this.idx(sx, sz));
    const goal = this.nearestFree(this.idx(gx, gz));
    if (start < 0 || goal < 0) return null;
    const W = this.w, g = this.g, came = this.came, seen = this.seen, B = this.blocked;
    const gen = ++this.gen;
    const gi = goal % W, gj = Math.floor(goal / W);
    const hOf = (id) => { const di = Math.abs(id % W - gi), dj = Math.abs(Math.floor(id / W) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    const heap = new MinHeap();
    g[start] = 0; came[start] = -1; seen[start] = gen;
    heap.push(start, hOf(start));
    let best = start, bestH = hOf(start), expanded = 0, found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) { found = true; best = goal; break; }
      if (++expanded > maxExpand) break;
      const ci = cur % W, cj = Math.floor(cur / W);
      const h = hOf(cur);
      if (h < bestH) { bestH = h; best = cur; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const nb = nj * W + ni;
        if (B[nb]) continue;
        if (di && dj && (B[cj * W + ni] || B[nj * W + ci])) continue;   // no cutting corners
        const cost = g[cur] + (di && dj ? 1.414 : 1);
        if (seen[nb] !== gen || cost < g[nb]) {
          seen[nb] = gen; g[nb] = cost; came[nb] = cur;
          heap.push(nb, cost + hOf(nb));
        }
      }
    }
    if (!found && best === start) return null;
    const cells = [];
    for (let c = best; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // Pull the path tight: keep only the corners we really need.
    const pts = [];
    let i = 0;
    while (i < cells.length - 1) {
      let j = Math.min(cells.length - 1, i + 40);
      while (j > i + 1 && !this.lineFree(this.cx(cells[i]), this.cz(cells[i]), this.cx(cells[j]), this.cz(cells[j]))) j--;
      pts.push({ x: this.cx(cells[j]), z: this.cz(cells[j]) });
      i = j;
    }
    if (found && pts.length) { pts[pts.length - 1].x = gx; pts[pts.length - 1].z = gz; }
    return pts;
  }
}
