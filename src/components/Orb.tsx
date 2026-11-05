import type { ReactNode } from "react";

/*
 * Sphères graphiques générées : chaque personne reçoit un petit visuel, toujours le
 * même pour elle, tiré de vingt-quatre motifs. Toutes les sphères sont déclinées
 * dans les nuances de la couleur d'accent : l'ensemble reste uniforme et suit
 * l'accent choisi dans les réglages, en clair comme en sombre.
 * Tout est déterministe (aucun aléa au rendu), donc identique côté serveur et client.
 */

/**
 * Huit nuances de l'accent, du presque blanc au très foncé : la teinte de l'accent,
 * à des clartés fixes et régulièrement espacées (OKLCH relatif). Chaque accent, même
 * le graphite presque noir, garde ainsi huit nuances bien distinctes.
 * Ce sont des couleurs CSS : elles s'appliquent par style, jamais par attribut SVG,
 * les attributs n'acceptant pas les variables dans tous les navigateurs.
 */
const LADDER: [lightness: number, chroma: number][] = [
  [0.96, 0.22],
  [0.89, 0.45],
  [0.8, 0.7],
  [0.71, 0.9],
  [0.61, 1],
  [0.51, 1],
  [0.41, 0.9],
  [0.31, 0.75],
];
const SHADES = LADDER.map(([l, c]) => `oklch(from var(--accent) ${l} calc(c * ${c}) h)`);

type Rng = () => number;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
const intBetween = (rng: Rng, a: number, b: number) => Math.floor(between(rng, a, b + 1));

/** Nuances tirées au hasard (sans répétition), et paires nettement contrastées pour les traits fins. */
type Shades = ((count: number) => string[]) & {
  light: string;
  dark: string;
  pair: () => [string, string];
};

function shadesOf(rng: Rng): Shades {
  const pick = (count: number) => {
    const pool = [...SHADES];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  };
  const pair = (): [string, string] => {
    const i = Math.floor(rng() * SHADES.length);
    const far = SHADES.map((_, j) => j).filter((j) => Math.abs(j - i) >= 4);
    return [SHADES[i], SHADES[far[Math.floor(rng() * far.length)]]];
  };
  return Object.assign(pick, { light: SHADES[0], dark: SHADES[SHADES.length - 1], pair });
}

const fill = (color: string) => ({ fill: color });
const stroke = (color: string) => ({ stroke: color });

/** Forme organique fermée (spline passant par des points bruités autour d'un centre). */
function blob(rng: Rng, cx: number, cy: number, r: number, n = 8): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * between(rng, 0.65, 1.3);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C ${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)}, ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(
      p2[1] - (p3[1] - p1[1]) / 6,
    )}, ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d} Z`;
}

/** Losange en escalier centré, façon pixel. */
function stepped(radius: number, step: number): string {
  const n = Math.max(1, Math.round(radius / step));
  const quarter: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    quarter.push([i * step, -radius + i * step], [(i + 1) * step, -radius + i * step]);
  }
  const pts: [number, number][] = [];
  for (let q = 0; q < 4; q++) {
    for (const [x, y] of quarter) {
      // Rotation d'un quart de tour par quadrant.
      const [rx, ry] = q === 0 ? [x, y] : q === 1 ? [-y, x] : q === 2 ? [-x, -y] : [y, -x];
      pts.push([50 + rx, 50 + ry]);
    }
  }
  return `M ${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L ")} Z`;
}

/** Hexagone régulier (pointe en haut) de centre (cx, cy) et de rayon r. */
function hexagon(cx: number, cy: number, r: number) {
  return `M ${Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return `${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`;
  }).join(" L ")} Z`;
}

type Pattern = (rng: Rng, pal: Shades) => { bg: string; body: ReactNode };

const PATTERNS: Pattern[] = [
  /* ------------------------------------------------ les douze premiers */

  // Points
  (rng, pal) => {
    const [bg, ink] = pal.pair();
    const s = between(rng, 10, 14);
    const rad = between(rng, 1.8, 2.8);
    const dots: ReactNode[] = [];
    for (let row = 0, y = s / 2; y < 100; row++, y += s) {
      for (let x = row % 2 ? s : s / 2; x < 100; x += s) dots.push(<circle key={`${x}-${y}`} cx={r1(x)} cy={r1(y)} r={r1(rad)} />);
    }
    return { bg, body: <g style={fill(ink)}>{dots}</g> };
  },
  // Bandes horizontales
  (rng, pal) => {
    const [bg, a] = pal.pair();
    const [b] = pal(1);
    const n = intBetween(rng, 5, 7);
    return {
      bg,
      body: Array.from({ length: n }, (_, i) => {
        const y = 14 + (i * 72) / (n - 1);
        const half = Math.sqrt(Math.max(0, 50 * 50 - (y - 50) ** 2)) * between(rng, 0.7, 1);
        return <ellipse key={i} cx={50} cy={r1(y)} rx={r1(half)} ry={r1(between(rng, 3.5, 6))} style={fill(i % 2 ? a : b)} />;
      }),
    };
  },
  // Taches
  (rng, pal) => {
    const [bg, a, b] = pal(3);
    return {
      bg,
      body: (
        <>
          <path d={blob(rng, between(rng, 35, 60), between(rng, 35, 60), between(rng, 20, 28))} style={fill(a)} />
          <circle cx={r1(between(rng, 25, 40))} cy={r1(between(rng, 60, 75))} r={r1(between(rng, 9, 14))} style={fill(a)} />
          {rng() < 0.6 && <circle cx={r1(between(rng, 65, 78))} cy={r1(between(rng, 22, 32))} r={r1(between(rng, 5, 8))} style={fill(b)} />}
        </>
      ),
    };
  },
  // Boucles
  (rng, pal) => {
    const [bg, line] = pal.pair();
    const n = intBetween(rng, 6, 9);
    return {
      bg,
      body: (
        <g fill="none" style={stroke(line)} strokeWidth={2.4}>
          {Array.from({ length: n }, (_, i) => (
            <ellipse
              key={i}
              cx={r1(50 + between(rng, -8, 8))}
              cy={r1(18 + (i * 64) / (n - 1))}
              rx={r1(between(rng, 22, 36))}
              ry={r1(between(rng, 4, 9))}
              transform={`rotate(${r1(between(rng, -12, 12))} 50 50)`}
            />
          ))}
        </g>
      ),
    };
  },
  // Quartiers rayonnants
  (rng, pal) => {
    const pool = pal(6);
    const n = intBetween(rng, 9, 14);
    const cuts = Array.from({ length: n }, () => between(rng, 0.6, 1.4));
    const total = cuts.reduce((s, c) => s + c, 0);
    let a = rng() * Math.PI * 2;
    return {
      bg: pool[0],
      body: cuts.map((c, i) => {
        const a2 = a + (c / total) * Math.PI * 2;
        const d = `M 50 50 L ${r1(50 + 75 * Math.cos(a))} ${r1(50 + 75 * Math.sin(a))} L ${r1(50 + 75 * Math.cos(a2))} ${r1(
          50 + 75 * Math.sin(a2),
        )} Z`;
        a = a2;
        return <path key={i} d={d} style={fill(pool[(i % (pool.length - 1)) + 1])} />;
      }),
    };
  },
  // Orbites
  (rng, pal) => {
    const [bg, line] = pal.pair();
    const n = intBetween(rng, 5, 7);
    return {
      bg,
      body: (
        <g fill="none" style={stroke(line)} strokeWidth={2}>
          {Array.from({ length: n }, (_, i) => (
            <ellipse
              key={i}
              cx={50}
              cy={50}
              rx={r1(between(rng, 28, 40))}
              ry={r1(between(rng, 8, 36))}
              transform={`rotate(${r1(between(rng, 0, 180))} 50 50)`}
            />
          ))}
        </g>
      ),
    };
  },
  // Ballon
  (rng, pal) => {
    const [bg, a, b, c] = pal(4);
    const edge = () => {
      const t = rng() * Math.PI * 2;
      return [50 + 62 * Math.cos(t), 50 + 62 * Math.sin(t)];
    };
    return {
      bg,
      body: [a, b, c].map((color, i) => {
        const [x, y] = edge();
        return <circle key={i} cx={r1(x)} cy={r1(y)} r={r1(between(rng, 40, 58))} style={fill(color)} />;
      }),
    };
  },
  // Spirales
  (rng, pal) => {
    const [bg, line] = pal.pair();
    const ring = (cx: number, cy: number, key: string) =>
      Array.from({ length: 4 }, (_, i) => (
        <ellipse key={`${key}${i}`} cx={r1(cx + i * 1.2)} cy={r1(cy + i * 0.8)} rx={r1(16 - i * 3.6)} ry={r1(10 - i * 2.2)} />
      ));
    return {
      bg,
      body: (
        <g fill="none" style={stroke(line)} strokeWidth={1.8}>
          {ring(between(rng, 42, 58), 22, "h")}
          {ring(between(rng, 42, 58), 78, "b")}
          <ellipse cx={50} cy={50} rx={r1(between(rng, 30, 38))} ry={r1(between(rng, 12, 18))} />
        </g>
      ),
    };
  },
  // Croix en escalier
  (rng, pal) => {
    const [bg, ...rings] = pal(4);
    const step = rng() < 0.5 ? 8 : 10;
    return {
      bg,
      body: rings.map((color, i) => <path key={i} d={stepped(40 - i * 13, step)} style={fill(color)} />),
    };
  },
  // Diaphragme
  (rng, pal) => {
    const [bg, line] = pal.pair();
    const [core] = pal(1);
    const n = intBetween(rng, 5, 7);
    const rot = rng() * Math.PI * 2;
    const inner = Array.from({ length: n }, (_, i) => rot + (i * Math.PI * 2) / n);
    return {
      bg,
      body: (
        <>
          <path
            d={`M ${inner.map((a) => `${r1(50 + 20 * Math.cos(a + 1.1))} ${r1(50 + 20 * Math.sin(a + 1.1))}`).join(" L ")} Z`}
            style={fill(core)}
          />
          <g fill="none" style={stroke(line)} strokeWidth={3} strokeLinecap="round">
            {inner.map((a, i) => (
              <path
                key={i}
                d={`M ${r1(50 + 60 * Math.cos(a))} ${r1(50 + 60 * Math.sin(a))} Q ${r1(50 + 40 * Math.cos(a + 0.5))} ${r1(
                  50 + 40 * Math.sin(a + 0.5),
                )} ${r1(50 + 20 * Math.cos(a + 1.1))} ${r1(50 + 20 * Math.sin(a + 1.1))}`}
              />
            ))}
          </g>
        </>
      ),
    };
  },
  // Œil
  (rng, pal) => {
    const [bg, side, ...rings] = pal(5);
    return {
      bg,
      body: (
        <>
          <circle cx={-8} cy={50} r={r1(between(rng, 34, 44))} style={fill(side)} />
          <circle cx={108} cy={50} r={r1(between(rng, 26, 40))} style={fill(side)} />
          {rings.map((color, i) => (
            <circle key={i} cx={50} cy={50} r={r1(30 - i * 10)} style={fill(color)} />
          ))}
        </>
      ),
    };
  },
  // Vagues
  (rng, pal) => {
    const [bg, a, b] = pal(3);
    const amp = between(rng, 4, 8);
    const n = intBetween(rng, 5, 7);
    return {
      bg,
      body: (
        <g fill="none" strokeWidth={4.5} strokeLinecap="round">
          {Array.from({ length: n }, (_, i) => {
            const y = 12 + (i * 76) / (n - 1);
            return (
              <path
                key={i}
                d={`M -5 ${r1(y)} Q 17 ${r1(y - amp)} 40 ${r1(y)} T 85 ${r1(y)} T 130 ${r1(y)}`}
                style={stroke(i % 2 ? a : b)}
              />
            );
          })}
        </g>
      ),
    };
  },

  /* ------------------------------------------------ les douze nouveaux */

  // Damier
  (rng, pal) => {
    const [bg, a] = pal.pair();
    const size = [12.5, 16.7, 20, 25][intBetween(rng, 0, 3)];
    const tilt = rng() < 0.5 ? 0 : 45;
    const cells: ReactNode[] = [];
    for (let y = -50; y < 150; y += size) {
      for (let x = -50; x < 150; x += size) {
        if ((Math.round((x + 50) / size) + Math.round((y + 50) / size)) % 2 === 0) {
          cells.push(<rect key={`${x}-${y}`} x={r1(x)} y={r1(y)} width={r1(size)} height={r1(size)} />);
        }
      }
    }
    return { bg, body: <g style={fill(a)} transform={`rotate(${tilt} 50 50)`}>{cells}</g> };
  },
  // Rayures obliques
  (rng, pal) => {
    const [bg, a, b] = pal(3);
    const w = between(rng, 6, 11);
    const angle = r1(between(rng, 20, 70) * (rng() < 0.5 ? 1 : -1));
    return {
      bg,
      body: (
        <g transform={`rotate(${angle} 50 50)`}>
          {Array.from({ length: Math.ceil(200 / (w * 2)) }, (_, i) => (
            <rect key={i} x={r1(-50 + i * w * 2)} y={-50} width={r1(w)} height={200} style={fill(i % 3 === 2 ? b : a)} />
          ))}
        </g>
      ),
    };
  },
  // Cibles décentrées
  (rng, pal) => {
    const [bg, a, b] = pal(3);
    const cx = r1(between(rng, 10, 90));
    const cy = r1(between(rng, 10, 90));
    const step = between(rng, 9, 14);
    return {
      bg,
      body: Array.from({ length: Math.ceil(140 / step) }, (_, i) => {
        const r = 140 - i * step;
        return <circle key={i} cx={cx} cy={cy} r={r1(r)} style={fill(i % 2 ? bg : i % 4 === 0 ? a : b)} />;
      }),
    };
  },
  // Soleil levant
  (rng, pal) => {
    const [bg, ray] = pal.pair();
    const [disk] = pal(1);
    const ox = r1(between(rng, 20, 80));
    const n = intBetween(rng, 10, 16);
    return {
      bg,
      body: (
        <>
          <g style={fill(ray)}>
            {Array.from({ length: n }, (_, i) => {
              const a1 = Math.PI + (i * Math.PI) / n;
              const a2 = a1 + Math.PI / n / 2;
              return (
                <path
                  key={i}
                  d={`M ${ox} 100 L ${r1(ox + 160 * Math.cos(a1))} ${r1(100 + 160 * Math.sin(a1))} L ${r1(ox + 160 * Math.cos(a2))} ${r1(100 + 160 * Math.sin(a2))} Z`}
                />
              );
            })}
          </g>
          <circle cx={ox} cy={100} r={r1(between(rng, 18, 30))} style={fill(disk)} />
        </>
      ),
    };
  },
  // Croissant de lune
  (rng, pal) => {
    const [bg, moon] = pal.pair();
    const r = between(rng, 26, 34);
    const cx = between(rng, 40, 60);
    const cy = between(rng, 40, 60);
    const off = between(rng, 10, 16);
    const a = rng() * Math.PI * 2;
    const stars = Array.from({ length: intBetween(rng, 3, 6) }, () => [between(rng, 8, 92), between(rng, 8, 92), between(rng, 1.2, 2.4)]);
    return {
      bg,
      body: (
        <>
          <g style={fill(moon)}>
            {stars.map(([x, y, s], i) => (
              <circle key={i} cx={r1(x)} cy={r1(y)} r={r1(s)} />
            ))}
            <circle cx={r1(cx)} cy={r1(cy)} r={r1(r)} />
          </g>
          <circle cx={r1(cx + off * Math.cos(a))} cy={r1(cy + off * Math.sin(a))} r={r1(r * 0.92)} style={fill(bg)} />
        </>
      ),
    };
  },
  // Triangles
  (rng, pal) => {
    const pool = pal(4);
    const s = [20, 25, 33.4][intBetween(rng, 0, 2)];
    const h = s * 0.866;
    const tris: ReactNode[] = [];
    for (let row = 0, y = 0; y < 100; row++, y += h) {
      for (let col = -1, x = -s; x < 100 + s; col++, x += s / 2) {
        const up = (col + row) % 2 === 0;
        const d = up
          ? `M ${r1(x)} ${r1(y + h)} L ${r1(x + s / 2)} ${r1(y)} L ${r1(x + s)} ${r1(y + h)} Z`
          : `M ${r1(x)} ${r1(y)} L ${r1(x + s)} ${r1(y)} L ${r1(x + s / 2)} ${r1(y + h)} Z`;
        tris.push(<path key={`${row}-${col}`} d={d} style={fill(pool[Math.floor(rng() * pool.length)])} />);
      }
    }
    return { bg: pool[0], body: tris };
  },
  // Fleur
  (rng, pal) => {
    const [bg, petal, heart] = pal(3);
    const n = intBetween(rng, 5, 9);
    const len = between(rng, 26, 34);
    const rot = between(rng, 0, 360 / n);
    return {
      bg,
      body: (
        <>
          <g style={fill(petal)}>
            {Array.from({ length: n }, (_, i) => (
              <ellipse key={i} cx={50} cy={r1(50 - len / 2 - 4)} rx={r1(between(rng, 7, 10))} ry={r1(len / 2)} transform={`rotate(${r1(rot + (i * 360) / n)} 50 50)`} />
            ))}
          </g>
          <circle cx={50} cy={50} r={r1(between(rng, 8, 12))} style={fill(heart)} />
        </>
      ),
    };
  },
  // Bulles
  (rng, pal) => {
    const [bg, ...pool] = pal(4);
    const n = intBetween(rng, 9, 15);
    return {
      bg,
      body: Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          cx={r1(between(rng, 5, 95))}
          cy={r1(between(rng, 5, 95))}
          r={r1(between(rng, 4, 18))}
          style={fill(pool[i % pool.length])}
        />
      )),
    };
  },
  // Dunes : couches de plus en plus foncées, dans l'ordre des nuances
  (rng) => {
    const pool = [...SHADES].slice(intBetween(rng, 0, 2), undefined);
    const n = intBetween(rng, 3, 5);
    const step = Math.floor((pool.length - 1) / n);
    return {
      bg: pool[0],
      body: Array.from({ length: n }, (_, i) => {
        const y = 30 + (i * 60) / n + between(rng, -4, 4);
        const amp = between(rng, 6, 14);
        const d = `M -10 ${r1(y)} C 20 ${r1(y - amp)}, 45 ${r1(y + amp)}, 70 ${r1(y)} S 110 ${r1(y - amp)}, 120 ${r1(y)} L 120 110 L -10 110 Z`;
        return <path key={i} d={d} style={fill(pool[Math.min(pool.length - 1, (i + 1) * step)])} />;
      }),
    };
  },
  // Arc-en-ciel
  (rng, pal) => {
    const [bg, ...pool] = pal(5);
    const w = between(rng, 7, 10);
    const cy = r1(between(rng, 70, 100));
    return {
      bg,
      body: (
        <g fill="none" strokeWidth={r1(w)}>
          {pool.map((color, i) => (
            <circle key={i} cx={50} cy={cy} r={r1(52 - i * (w + 1))} style={stroke(color)} />
          ))}
        </g>
      ),
    };
  },
  // Nid d'abeille
  (rng, pal) => {
    const [bg, a, b] = pal(3);
    const r = between(rng, 8, 12);
    const w = r * Math.sqrt(3);
    const cells: ReactNode[] = [];
    for (let row = 0, y = 0; y < 110; row++, y += r * 1.5) {
      for (let x = row % 2 ? w / 2 : 0; x < 110; x += w) {
        const pick = rng();
        if (pick < 0.75) cells.push(<path key={`${row}-${x}`} d={hexagon(x, y, r * 0.9)} style={fill(pick < 0.5 ? a : b)} />);
      }
    }
    return { bg, body: cells };
  },
  // Écossais
  (rng, pal) => {
    const [bg, a, b] = pal(3);
    const w = between(rng, 10, 16);
    const gap = w * between(rng, 1.6, 2.4);
    const bands = Array.from({ length: Math.ceil(110 / gap) }, (_, i) => i * gap + between(rng, -2, 2));
    return {
      bg,
      body: (
        <>
          <g style={fill(a)}>
            {bands.map((y, i) => (
              <rect key={`h${i}`} x={0} y={r1(y)} width={100} height={r1(w)} />
            ))}
          </g>
          <g style={{ fill: b, mixBlendMode: "multiply" }}>
            {bands.map((x, i) => (
              <rect key={`v${i}`} x={r1(x)} y={0} width={r1(w * 0.6)} height={100} />
            ))}
          </g>
        </>
      ),
    };
  },
];

/** Sphère graphique propre à une graine (identifiant ou nom). */
export function Orb({ seed, className = "" }: { seed: string | number; className?: string }) {
  const rng = mulberry32(hash(String(seed)));
  const pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)];
  const { bg, body } = pattern(rng, shadesOf(rng));
  return (
    <svg viewBox="0 0 100 100" className={`block size-full ${className}`} aria-hidden>
      <rect width="100" height="100" style={fill(bg)} />
      {body}
    </svg>
  );
}
