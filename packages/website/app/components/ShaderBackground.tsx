import { useEffect, useRef } from "react";
import { useShader } from "../contexts/shader-context";
import { DEFAULT_PARAMS, DEFAULT_SHADER, getShaderDef, PARAM_DEFS, VERTEX_SRC, type ShaderDef } from "../lib/shaders";

const DPR_CAP = 1.25; // background is soft/grainy — a low cap saves a lot of GPU
const FPS_CAP = 32; // the wallpaper moves slowly; 32fps halves GPU vs 60
const FRAME_MS = 1000 / FPS_CAP;
const INTRO_MS = 2000; // lively intro at full speed
const BRAKE_MS = 3000; // then ease the time-rate to zero over this long (smooth stop)

// Base background colours (mirror shaders.ts baseBg) — used to clear the canvas
// before the first draw so an opaque (alpha:false) context shows the page colour
// rather than black for a frame. [light, dark].
const BASE_BG: [number, number, number][] = [
  [0.961, 0.965, 0.973],
  [0.067, 0.094, 0.153],
];

type Prog = {
  program: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
};

// The single "aura" wallpaper renders in two passes: a scene pass into an
// offscreen full-res texture, then a post pass (flare + paper) to the screen.
type Compiled = {
  scene: Prog;
  post: Prog;
  tex: WebGLTexture | null;
  fbo: WebGLFramebuffer | null;
  w: number;
  h: number;
  ready: boolean;
};

/**
 * Persistent shader wallpaper.
 *
 * Rendered once inside the root layout so its WebGL context and animation clock
 * survive client-side navigation — the background never resets between pages.
 * The canvas is fixed behind all content with `pointer-events: none`.
 *
 * Non-interactive and self-limiting: it plays a short intro on load /
 * navigation, then freezes the last frame and stops drawing entirely (≈0 GPU
 * while reading). It recovers automatically from WebGL context loss.
 */
export default function ShaderBackground() {
  const { accentHue, revealId } = useShader();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live value the render loop reads without re-running the setup effect.
  const accentHueRef = useRef(accentHue); // target hue (current page's key visual)
  accentHueRef.current = accentHue;

  // Let effects (re)start / re-trigger the loop without re-running setup.
  const kickRef = useRef<(() => void) | null>(null);
  const revealRef = useRef<(() => void) | null>(null);

  // The wallpaper is always on: make the page background transparent so the
  // canvas shows through. (root.tsx's inline script already sets this on first
  // paint; this keeps it set after hydration.)
  useEffect(() => {
    document.documentElement.classList.add("shader-active");
  }, []);

  // Every reveal() — each page mount/navigation, and theme flips — animates the
  // wallpaper toward that page's key-visual colour, blending from the current
  // colour instead of hard-cutting.
  useEffect(() => {
    revealRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      console.warn("[ShaderBackground] WebGL2 unavailable; keeping solid background");
      return;
    }
    const g = gl; // non-null alias for closures

    // GL resources that are invalidated by context loss and rebuilt on restore.
    let vs: WebGLShader | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    const compiledMap = new Map<string, Compiled>();

    function makeProg(frag: string): Prog | null {
      const fs = compileShader(g, g.FRAGMENT_SHADER, frag);
      if (!fs) return null;
      const program = g.createProgram();
      if (!program) {
        g.deleteShader(fs);
        return null;
      }
      g.attachShader(program, vs as WebGLShader);
      g.attachShader(program, fs);
      g.linkProgram(program);
      g.deleteShader(fs);
      if (!g.getProgramParameter(program, g.LINK_STATUS)) {
        console.error("[ShaderBackground] link failed:", g.getProgramInfoLog(program));
        return null;
      }
      const cache = new Map<string, WebGLUniformLocation | null>();
      const u = (name: string) => {
        if (!cache.has(name)) cache.set(name, g.getUniformLocation(program, name));
        return cache.get(name) ?? null;
      };
      return { program, u };
    }

    // (Re)create the vertex shader + VAO. Programs/FBOs are rebuilt lazily by
    // getCompiled/initPostfx. Returns false if the vertex shader won't compile.
    function buildGL(): boolean {
      vs = compileShader(g, g.VERTEX_SHADER, VERTEX_SRC);
      if (!vs) return false;
      vao = g.createVertexArray();
      g.bindVertexArray(vao);
      return true;
    }
    if (!buildGL()) return;

    function getCompiled(def: ShaderDef): Compiled | null {
      const existing = compiledMap.get(def.id);
      if (existing) return existing;
      const scene = makeProg(def.sceneFrag);
      const post = makeProg(def.postFrag);
      if (!scene || !post) return null;
      const c: Compiled = { scene, post, tex: null, fbo: null, w: 0, h: 0, ready: false };
      compiledMap.set(def.id, c);
      return c;
    }

    // ---- canvas sizing -----------------------------------------------------
    let cw = 0;
    let ch = 0;
    function resize(): boolean {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (w === cw && h === ch) return false;
      cw = w;
      ch = h;
      canvas!.width = w;
      canvas!.height = h;
      // Offscreen buffer depends on canvas size — flag it for reallocation.
      for (const c of compiledMap.values()) c.ready = false;
      return true;
    }

    function initPostfx(c: Compiled) {
      if (c.tex) g.deleteTexture(c.tex);
      if (c.fbo) g.deleteFramebuffer(c.fbo);
      const tex = g.createTexture()!;
      g.bindTexture(g.TEXTURE_2D, tex);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, cw, ch, 0, g.RGBA, g.UNSIGNED_BYTE, null);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      const fb = g.createFramebuffer()!;
      g.bindFramebuffer(g.FRAMEBUFFER, fb);
      g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      c.tex = tex;
      c.fbo = fb;
      c.w = cw;
      c.h = ch;
      c.ready = true;
    }

    // Paint the theme base colour straight to the screen so there's no black
    // flash before (or after a context loss, until) the first scene draw.
    function clearToBase() {
      const [r, gr, b] = BASE_BG[theme];
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.clearColor(r, gr, b, 1);
      g.clear(g.COLOR_BUFFER_BIT);
    }

    // ---- theme / motion / visibility state ---------------------------------
    let theme = document.documentElement.classList.contains("dark") ? 1 : 0;
    // Re-kick the intro only when the dark state actually flips. The
    // documentElement also gets unrelated class mutations (shader-active,
    // data-theme, hydration markers) that must NOT re-trigger the animation.
    const themeObserver = new MutationObserver(() => {
      const next = document.documentElement.classList.contains("dark") ? 1 : 0;
      if (next === theme) return;
      theme = next;
      kickRef.current?.();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motion = reducedQuery.matches ? 0 : 1;
    const onReducedChange = () => {
      motion = reducedQuery.matches ? 0 : 1;
      kickRef.current?.();
    };
    reducedQuery.addEventListener("change", onReducedChange);

    let visible = !document.hidden;
    let contextLost = false;

    // ---- uniforms ----------------------------------------------------------
    function setCommon(u: Prog["u"], resW: number, resH: number) {
      const r = u("uResolution");
      if (r) g.uniform2f(r, resW, resH);
      const t = u("uTime");
      if (t) g.uniform1f(t, timeSec);
      const ip = u("uIntro");
      if (ip) g.uniform1f(ip, bloomThisReveal ? introProgress : 1.0);
      const rs = u("uRest");
      if (rs) g.uniform1f(rs, restProgress);
      const th = u("uTheme");
      if (th) g.uniform1f(th, theme);
      const h = u("uHue");
      if (h) g.uniform1f(h, currentHue);
      // Fixed look parameters (defaults baked in; see PARAM_DEFS).
      for (const dParam of PARAM_DEFS) {
        const loc = u(dParam.uniform);
        if (loc) g.uniform1f(loc, DEFAULT_PARAMS[dParam.key]);
      }
    }

    // ---- render-loop state -------------------------------------------------
    let timeSec = Math.random() * 1000; // random phase so each landing differs
    let lastTs = performance.now();
    let rafId = 0;
    let introStart = performance.now();
    let frozen = false; // after the intro the last frame is held (≈0 GPU)
    let introProgress = 1; // 0->1 across the intro (drives the entrance bloom)
    let restProgress = 1; // 0->1 across the brake (settles the wallpaper to rest)
    // The displayed hue blends between pages. Persist it in sessionStorage so a
    // navigation that ends up reloading the document (or a fresh mount) still
    // cross-fades from the previous page's colour instead of snapping to it.
    const HUE_KEY = "sh-hue";
    const readStoredHue = (): number | null => {
      try {
        const v = sessionStorage.getItem(HUE_KEY);
        if (v == null) return null;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    };
    const storedHue = readStoredHue();
    // Hold at the stored colour until this page's own reveal redirects the
    // target — otherwise we'd briefly drift toward the context default first.
    let currentHue = storedHue ?? accentHueRef.current; // animated hue
    let targetHue = storedHue ?? accentHueRef.current;
    const hadPrevHue = storedHue != null; // a previous page left a colour to blend from
    let firstReveal = true; // the first reveal of this mount
    let bloomThisReveal = true;
    let lastStoredHue = Math.round(currentHue);
    const persistHue = () => {
      const r = Math.round(currentHue);
      if (r === lastStoredHue) return;
      lastStoredHue = r;
      try {
        sessionStorage.setItem(HUE_KEY, String(currentHue));
      } catch {
        /* storage unavailable — blend still works within a single document */
      }
    };

    const loop = (ts: number) => {
      if (!visible || contextLost) {
        rafId = 0;
        return;
      }
      const def = getShaderDef(DEFAULT_SHADER);
      if (!def) {
        rafId = 0;
        return;
      }
      if (frozen) {
        rafId = 0;
        return;
      }

      const reduced = motion === 0;
      // Throttle to ~FPS_CAP while animating.
      if (!reduced && ts - lastTs < FRAME_MS) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      let dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (dt > 0.1) dt = 0.1;
      if (dt < 0) dt = 0;
      // Blend the displayed hue toward the target (set by reveal): a smooth
      // colour cross-fade between pages instead of a hard switch.
      if (reduced) {
        currentHue = targetHue;
      } else {
        const dh = ((targetHue - currentHue + 540) % 360) - 180;
        currentHue += dh * Math.min(1, dt * 2.5);
      }
      persistHue();
      // Lively for INTRO_MS, then brake over BRAKE_MS: the time-rate eases
      // 1 -> 0 (quadratic), so all motion glides to a smooth stop instead of
      // cutting out abruptly.
      const elapsed = ts - introStart;
      const b = elapsed > INTRO_MS ? Math.min(1, (elapsed - INTRO_MS) / BRAKE_MS) : 0;
      const rate = (1 - b) * (1 - b);
      timeSec += dt * (reduced ? 0 : rate);
      introProgress = reduced ? 1 : Math.min(1, elapsed / INTRO_MS);
      restProgress = reduced ? 1 : b;

      resize();

      const compiled = getCompiled(def);
      if (!compiled) {
        rafId = 0;
        return;
      }
      if (!compiled.ready || !compiled.tex || !compiled.fbo) initPostfx(compiled);

      // Scene pass -> offscreen full-resolution texture.
      g.bindFramebuffer(g.FRAMEBUFFER, compiled.fbo);
      g.viewport(0, 0, cw, ch);
      g.useProgram(compiled.scene.program);
      setCommon(compiled.scene.u, cw, ch);
      g.drawArrays(g.TRIANGLES, 0, 3);
      // Post pass -> screen, reading the scene texture for flare + paper.
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, cw, ch);
      g.useProgram(compiled.post.program);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, compiled.tex);
      const sc = compiled.post.u("uScene");
      if (sc) g.uniform1i(sc, 0);
      setCommon(compiled.post.u, cw, ch);
      g.drawArrays(g.TRIANGLES, 0, 3);

      // Play a short intro, then freeze the last frame and stop drawing
      // entirely (≈0 GPU while reading). Re-kicked on theme/resize/restore;
      // reduced-motion shows a single static frame immediately.
      if (reduced || ts - introStart >= INTRO_MS + BRAKE_MS) {
        frozen = true;
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(loop);
    };

    // (Re)play the intro: unfreeze, reset the clock, and start the loop.
    const kick = () => {
      frozen = false;
      introStart = performance.now();
      lastTs = performance.now() - FRAME_MS;
      if (!rafId && visible && !contextLost) {
        rafId = requestAnimationFrame(loop);
      }
    };
    kickRef.current = kick;

    // A reveal sets a new target hue and (re)animates. The first reveal blooms
    // the light in from nothing; later reveals (navigation) keep the glow and
    // just blend the colour while re-energising the motion ("mix in").
    const doReveal = () => {
      targetHue = accentHueRef.current;
      if (firstReveal && !hadPrevHue) {
        // Very first colour this session: nothing to blend from, so snap.
        currentHue = targetHue;
      }
      // Bloom the glow in on a fresh mount or whenever it had faded to rest;
      // a mid-animation navigation keeps its bloom and just blends the colour.
      bloomThisReveal = firstReveal || frozen || restProgress > 0.5;
      firstReveal = false;
      kick();
    };
    revealRef.current = doReveal;

    // ---- context loss / restore --------------------------------------------
    // The background is always mounted, so a GPU/context reset would otherwise
    // strand it on the CSS fallback colour until a full reload. Recover in place.
    const onContextLost = (e: Event) => {
      e.preventDefault(); // required for 'webglcontextrestored' to fire
      contextLost = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onContextRestored = () => {
      // Every GL resource was invalidated: rebuild the shader/VAO, drop cached
      // programs/FBOs (recompiled lazily), force a resize, then replay.
      compiledMap.clear();
      cw = 0;
      ch = 0;
      if (!buildGL()) return;
      contextLost = false;
      resize();
      clearToBase();
      kick();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    const onVisibility = () => {
      visible = !document.hidden;
      // Resume an interrupted intro; if already frozen, keep the held frame.
      if (visible && !frozen) kick();
    };
    const onResize = () => {
      // Only re-animate on a real size change (rotation / window resize). The
      // 100lvh canvas keeps a stable size when the mobile URL bar shows/hides,
      // so that resize event is a no-op here and must NOT re-trigger the intro.
      if (resize()) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize, { passive: true });

    resize();
    clearToBase(); // paint base colour now so there's no first-frame black flash
    kick();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      kickRef.current = null;
      revealRef.current = null;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedQuery.removeEventListener("change", onReducedChange);
      themeObserver.disconnect();
      for (const c of compiledMap.values()) {
        g.deleteProgram(c.scene.program);
        g.deleteProgram(c.post.program);
        if (c.tex) g.deleteTexture(c.tex);
        if (c.fbo) g.deleteFramebuffer(c.fbo);
      }
      if (vs) g.deleteShader(vs);
      if (vao) g.deleteVertexArray(vao);
      g.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // The loop reads hue from refs, so this effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shader-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="shader-bg__canvas" />
    </div>
  );
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("[ShaderBackground] compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
