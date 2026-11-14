import { Texture } from 'pixi.js';

/**
 * Prebuilt white textures (tinted at runtime). Built once from 2D canvases so
 * no Graphics are rebuilt per frame.
 */
export interface FxTextures {
  /** Soft radial glow, 128px, white centre fading to transparent. */
  glow: Texture;
  /** Solid anti-aliased disc, 64px. */
  disc: Texture;
  /** Thin ring, 256px. */
  ring: Texture;
  /** Thick soft ring (shockwave look), 256px. */
  ringSoft: Texture;
  /** Horizontal streak: bright centre fading at both ends, 64x8. */
  streak: Texture;
  /** Crescent swoosh (kick arc), 128px, opening toward +x. */
  swoosh: Texture;
  /** Wall crack decal, 128px, cracks spreading toward +x. */
  crack: Texture;
  /** Aim chevron, 32px, pointing +x. */
  chevron: Texture;
  /** Screen vignette, 256px. */
  vignette: Texture;
  /** Screen-edge glow: transparent centre, white edges (tint for edge flashes), 256px. */
  edge: Texture;
  /** Solid white (flashes). */
  white: Texture;
  /** Limb strip 4x16: white core of LIMB_CORE rows with soft transparent edges (anti-aliasing). */
  limb: Texture;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): Texture {
  return Texture.from(c);
}

/** Opaque rows in the limb texture: sprite scale.y = thickness / LIMB_CORE. */
export const LIMB_CORE = 12;

let cache: FxTextures | null = null;

export function getTextures(): FxTextures {
  if (cache) return cache;

  const [gc, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);

  const [dc, d] = canvas(64, 64);
  d.fillStyle = '#fff';
  d.beginPath();
  d.arc(32, 32, 30, 0, Math.PI * 2);
  d.fill();

  const [rc, r] = canvas(256, 256);
  r.strokeStyle = '#fff';
  r.lineWidth = 6;
  r.beginPath();
  r.arc(128, 128, 122, 0, Math.PI * 2);
  r.stroke();

  const [sc, s] = canvas(256, 256);
  const sg = s.createRadialGradient(128, 128, 70, 128, 128, 128);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.7, 'rgba(255,255,255,0.8)');
  sg.addColorStop(0.85, 'rgba(255,255,255,0.35)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  s.fillStyle = sg;
  s.fillRect(0, 0, 256, 256);

  const [stc, st] = canvas(64, 8);
  const lg = st.createLinearGradient(0, 0, 64, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.7, 'rgba(255,255,255,1)');
  lg.addColorStop(1, 'rgba(255,255,255,0.2)');
  st.fillStyle = lg;
  st.beginPath();
  st.ellipse(32, 4, 32, 3.5, 0, 0, Math.PI * 2);
  st.fill();

  // Crescent: big arc minus an offset arc, thick at the middle, tapering at the tips.
  const [swc, sw] = canvas(128, 128);
  sw.fillStyle = '#fff';
  sw.beginPath();
  sw.arc(64, 64, 60, -Math.PI * 0.42, Math.PI * 0.42);
  sw.arc(40, 64, 48, Math.PI * 0.36, -Math.PI * 0.36, true);
  sw.closePath();
  sw.fill();

  // Crack decal: a few jagged branches from the left-centre (the wall) toward +x.
  const [cc, cr] = canvas(128, 128);
  cr.strokeStyle = '#fff';
  cr.lineCap = 'round';
  let seed = 7;
  const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 7; b++) {
    let x = 4, y = 64 + (rr() - 0.5) * 30;
    const ang = (rr() - 0.5) * 2.4;
    cr.lineWidth = 3.5 - b * 0.3;
    cr.beginPath();
    cr.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += Math.cos(ang + (rr() - 0.5) * 0.9) * (8 + rr() * 10);
      y += Math.sin(ang + (rr() - 0.5) * 0.9) * (8 + rr() * 10);
      cr.lineTo(x, y);
    }
    cr.stroke();
  }

  const [chc, ch] = canvas(32, 32);
  ch.strokeStyle = '#fff';
  ch.lineWidth = 5;
  ch.lineCap = 'round';
  ch.lineJoin = 'round';
  ch.beginPath();
  ch.moveTo(9, 6);
  ch.lineTo(24, 16);
  ch.lineTo(9, 26);
  ch.stroke();

  const [vc, vg] = canvas(256, 256);
  const vgr = vg.createRadialGradient(128, 128, 60, 128, 128, 182);
  vgr.addColorStop(0, 'rgba(0,0,0,0)');
  vgr.addColorStop(1, 'rgba(0,0,0,0.85)');
  vg.fillStyle = vgr;
  vg.fillRect(0, 0, 256, 256);

  const [ec, eg] = canvas(256, 256);
  const egr = eg.createRadialGradient(128, 128, 70, 128, 128, 182);
  egr.addColorStop(0, 'rgba(255,255,255,0)');
  egr.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  egr.addColorStop(1, 'rgba(255,255,255,1)');
  eg.fillStyle = egr;
  eg.fillRect(0, 0, 256, 256);

  const [lc, lm] = canvas(4, 16);
  lm.fillStyle = '#fff';
  lm.fillRect(0, 2, 4, LIMB_CORE);

  cache = {
    glow: tex(gc), disc: tex(dc), ring: tex(rc), ringSoft: tex(sc), streak: tex(stc),
    swoosh: tex(swc), crack: tex(cc), chevron: tex(chc), vignette: tex(vc), edge: tex(ec), white: Texture.WHITE, limb: tex(lc),
  };
  return cache;
}
