import { useEffect, useRef } from "react";
import { useShader } from "../contexts/shader-context";
import { getShaderDef, PARAM_DEFS, VERTEX_SRC, type ShaderDef } from "../lib/shaders";

const MAX_RIPPLES = 8;
const RIPPLE_LIFE = 2.6; // seconds
const DPR_CAP = 1.25; // background is soft/grainy — a low cap saves a lot of GPU
const FPS_CAP = 32; // the wallpaper moves slowly; 32fps halves GPU vs 60
const FRAME_MS = 1000 / FPS_CAP;
const INTRO_MS = 5000; // lively intro at full speed
const BRAKE_MS = 3000; // then ease the time-rate to zero over this long (smooth stop)
const SIM_SCALE = 0.5; // feedback simulation runs at half the canvas resolution
const SIM_MAX_DIM = 480; // ...capped so large screens stay cheap

type Prog = {
  program: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
};

type CompiledSimple = { kind: "simple"; main: Prog };
type CompiledFeedback = {
  kind: "feedback";
  sim: Prog;
  show: Prog;
  texs: WebGLTexture[];
  fbos: WebGLFramebuffer[];
  w: number;
  h: number;
  cur: number;
  ready: boolean;
};
type CompiledPostfx = {
  kind: "postfx";
  scene: Prog;
  post: Prog;
  tex: WebGLTexture | null;
  fbo: WebGLFramebuffer | null;
  w: number;
  h: number;
  ready: boolean;
};
type Compiled = CompiledSimple | CompiledFeedback | CompiledPostfx;

/**
 * Persistent interactive shader wallpaper.
 *
 * Rendered once inside the root layout so its WebGL context, animation clock
 * and any feedback-shader simulation textures survive client-side
 * navigation — the background never resets between pages. The canvas is fixed
 * behind all content with `pointer-events: none`; pointer interaction is read
 * from window-level listeners so links and scrolling keep working.
 */
export default function ShaderBackground() {
  const { shader, accentHue, params } = useShader();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live values the render loop reads without re-running the setup effect.
  const shaderRef = useRef(shader);
  shaderRef.current = shader;
  const hueRef = useRef(accentHue);
  hueRef.current = accentHue;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Lets the [shader] effect restart the loop after it parks itself on "off".
  const kickRef = useRef<(() => void) | null>(null);

  // Reveal the wallpaper by making the page background transparent only while
  // a shader is selected.
  useEffect(() => {
    document.documentElement.classList.toggle("shader-active", shader !== "off");
  }, [shader]);

  useEffect(() => {
    if (shader !== "off") kickRef.current?.();
  }, [shader]);

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

    const vs = compileShader(g, g.VERTEX_SHADER, VERTEX_SRC);
    if (!vs) return;

    const vao = g.createVertexArray();
    g.bindVertexArray(vao);

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

    const compiledMap = new Map<string, Compiled>();
    function getCompiled(def: ShaderDef): Compiled | null {
      const existing = compiledMap.get(def.id);
      if (existing) return existing;
      if (def.kind === "simple") {
        const main = makeProg(def.frag);
        if (!main) return null;
        const c: Compiled = { kind: "simple", main };
        compiledMap.set(def.id, c);
        return c;
      }
      if (def.kind === "postfx") {
        const scene = makeProg(def.sceneFrag);
        const post = makeProg(def.postFrag);
        if (!scene || !post) return null;
        const c: Compiled = { kind: "postfx", scene, post, tex: null, fbo: null, w: 0, h: 0, ready: false };
        compiledMap.set(def.id, c);
        return c;
      }
      const sim = makeProg(def.simFrag);
      const show = makeProg(def.showFrag);
      if (!sim || !show) return null;
      const c: Compiled = {
        kind: "feedback",
        sim,
        show,
        texs: [],
        fbos: [],
        w: 0,
        h: 0,
        cur: 0,
        ready: false,
      };
      compiledMap.set(def.id, c);
      return c;
    }

    // ---- canvas sizing -----------------------------------------------------
    let cw = 0;
    let ch = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (w === cw && h === ch) return;
      cw = w;
      ch = h;
      canvas!.width = w;
      canvas!.height = h;
      // Offscreen buffers depend on canvas size — flag them for reallocation.
      for (const c of compiledMap.values()) {
        if (c.kind === "feedback" || c.kind === "postfx") c.ready = false;
      }
    }

    function initFeedback(c: CompiledFeedback) {
      let w = Math.max(2, Math.floor(cw * SIM_SCALE));
      let h = Math.max(2, Math.floor(ch * SIM_SCALE));
      const m = Math.max(w, h);
      if (m > SIM_MAX_DIM) {
        const k = SIM_MAX_DIM / m;
        w = Math.max(2, Math.floor(w * k));
        h = Math.max(2, Math.floor(h * k));
      }
      c.texs.forEach((t) => g.deleteTexture(t));
      c.fbos.forEach((f) => g.deleteFramebuffer(f));
      c.texs = [];
      c.fbos = [];
      for (let i = 0; i < 2; i++) {
        const tex = g.createTexture()!;
        g.bindTexture(g.TEXTURE_2D, tex);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        const fb = g.createFramebuffer()!;
        g.bindFramebuffer(g.FRAMEBUFFER, fb);
        g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
        g.clearColor(0, 0, 0, 1);
        g.clear(g.COLOR_BUFFER_BIT);
        c.texs.push(tex);
        c.fbos.push(fb);
      }
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      c.w = w;
      c.h = h;
      c.cur = 0;
      c.ready = true;
    }

    function initPostfx(c: CompiledPostfx) {
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

    // ---- pointer / theme / motion state ------------------------------------
    // Non-interactive: the light is fixed at the centre and the shader adds its
    // own autonomous drift. (These stay constant; kept for setCommon and the
    // unused simple/feedback code paths.)
    const smx = 0.5;
    const smy = 0.5;
    const lightX = 0.5;
    const lightY = 0.5;
    const vx = 0;
    const vy = 0;
    const activity = 0;
    const ripples: { x: number; y: number; t: number }[] = [];
    const click = { x: 0.5, y: 0.5, t: -100 };

    let theme = document.documentElement.classList.contains("dark") ? 1 : 0;
    const themeObserver = new MutationObserver(() => {
      theme = document.documentElement.classList.contains("dark") ? 1 : 0;
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

    // ---- uniform helpers ---------------------------------------------------
    const ripPos = new Float32Array(MAX_RIPPLES * 2);
    const ripAge = new Float32Array(MAX_RIPPLES);

    function setCommon(u: Prog["u"], resW: number, resH: number) {
      const r = u("uResolution");
      if (r) g.uniform2f(r, resW, resH);
      const t = u("uTime");
      if (t) g.uniform1f(t, timeSec);
      const ip = u("uIntro");
      if (ip) g.uniform1f(ip, introProgress);
      const m = u("uMouse");
      if (m) g.uniform2f(m, smx, smy);
      const lt = u("uLight");
      if (lt) g.uniform2f(lt, lightX, lightY);
      const mv = u("uMouseVel");
      if (mv) g.uniform2f(mv, vx, vy);
      const th = u("uTheme");
      if (th) g.uniform1f(th, theme);
      const h = u("uHue");
      if (h) g.uniform1f(h, hueRef.current);
      const a = u("uActive");
      if (a) g.uniform1f(a, Math.min(1, activity));
      const mo = u("uMotion");
      if (mo) g.uniform1f(mo, motion);
      // Live-tunable look parameters (?tune slider panel).
      for (const dParam of PARAM_DEFS) {
        const loc = u(dParam.uniform);
        if (loc) g.uniform1f(loc, paramsRef.current[dParam.key]);
      }
    }

    // ---- render loop -------------------------------------------------------
    let timeSec = Math.random() * 1000; // random phase so each landing differs
    let lastTs = performance.now();
    let rafId = 0;
    let introStart = performance.now();
    let frozen = false; // after the intro the last frame is held (≈0 GPU)
    let introProgress = 1; // 0->1 across the intro (drives the entrance bloom)

    const loop = (ts: number) => {
      if (!visible) {
        rafId = 0;
        return;
      }
      const def = getShaderDef(shaderRef.current);
      if (!def) {
        // "off": stop the loop entirely; the [shader] effect restarts it.
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
      // Lively for INTRO_MS, then brake over BRAKE_MS: the time-rate eases
      // 1 -> 0 (quadratic), so all motion glides to a smooth stop instead of
      // cutting out abruptly.
      const elapsed = ts - introStart;
      let rate = 1;
      if (elapsed > INTRO_MS) {
        const b = Math.min(1, (elapsed - INTRO_MS) / BRAKE_MS);
        rate = (1 - b) * (1 - b);
      }
      timeSec += dt * (reduced ? 0 : rate);
      introProgress = reduced ? 1 : Math.min(1, elapsed / INTRO_MS);

      resize();

      const compiled = getCompiled(def);
      if (!compiled) {
        rafId = 0;
        return;
      }

      if (compiled.kind === "simple") {
        // Prune expired ripples and pack the most recent into the uniforms.
        for (let i = ripples.length - 1; i >= 0; i--) {
          if (timeSec - ripples[i].t > RIPPLE_LIFE) ripples.splice(i, 1);
        }
        for (let i = 0; i < MAX_RIPPLES; i++) {
          ripAge[i] = -1;
          ripPos[i * 2] = 0;
          ripPos[i * 2 + 1] = 0;
        }
        const n = Math.min(ripples.length, MAX_RIPPLES);
        for (let i = 0; i < n; i++) {
          const r = ripples[ripples.length - 1 - i];
          ripPos[i * 2] = r.x;
          ripPos[i * 2 + 1] = r.y;
          ripAge[i] = timeSec - r.t;
        }

        g.bindFramebuffer(g.FRAMEBUFFER, null);
        g.viewport(0, 0, cw, ch);
        g.useProgram(compiled.main.program);
        setCommon(compiled.main.u, cw, ch);
        const rp = compiled.main.u("uRipplePos[0]");
        if (rp) g.uniform2fv(rp, ripPos);
        const ra = compiled.main.u("uRippleAge[0]");
        if (ra) g.uniform1fv(ra, ripAge);
        g.drawArrays(g.TRIANGLES, 0, 3);
      } else if (compiled.kind === "postfx") {
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
      } else {
        if (!compiled.ready) initFeedback(compiled);

        // Simulation pass: read current state, write the next into the spare.
        const read = compiled.texs[compiled.cur];
        const writeFb = compiled.fbos[1 - compiled.cur];
        g.bindFramebuffer(g.FRAMEBUFFER, writeFb);
        g.viewport(0, 0, compiled.w, compiled.h);
        g.useProgram(compiled.sim.program);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, read);
        const sp = compiled.sim.u("uPrev");
        if (sp) g.uniform1i(sp, 0);
        setCommon(compiled.sim.u, compiled.w, compiled.h);
        const cu = compiled.sim.u("uClick");
        if (cu) g.uniform3f(cu, click.x, click.y, timeSec - click.t);
        g.drawArrays(g.TRIANGLES, 0, 3);
        compiled.cur = 1 - compiled.cur;

        // Display pass: theme the freshly written state onto the screen.
        g.bindFramebuffer(g.FRAMEBUFFER, null);
        g.viewport(0, 0, cw, ch);
        g.useProgram(compiled.show.program);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, compiled.texs[compiled.cur]);
        const wp = compiled.show.u("uPrev");
        if (wp) g.uniform1i(wp, 0);
        setCommon(compiled.show.u, cw, ch);
        g.drawArrays(g.TRIANGLES, 0, 3);
      }

      // Play a short intro, then freeze the last frame and stop drawing
      // entirely (≈0 GPU while reading). Re-kicked on theme/resize/re-select;
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
      if (!rafId && visible && shaderRef.current !== "off") {
        rafId = requestAnimationFrame(loop);
      }
    };
    kickRef.current = kick;

    const onVisibility = () => {
      visible = !document.hidden;
      // Resume an interrupted intro; if already frozen, keep the held frame.
      if (visible && !frozen) kick();
    };
    const onResize = () => {
      resize();
      kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize, { passive: true });

    resize();
    kick();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      kickRef.current = null;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedQuery.removeEventListener("change", onReducedChange);
      themeObserver.disconnect();
      for (const c of compiledMap.values()) {
        if (c.kind === "simple") {
          g.deleteProgram(c.main.program);
        } else if (c.kind === "postfx") {
          g.deleteProgram(c.scene.program);
          g.deleteProgram(c.post.program);
          if (c.tex) g.deleteTexture(c.tex);
          if (c.fbo) g.deleteFramebuffer(c.fbo);
        } else {
          g.deleteProgram(c.sim.program);
          g.deleteProgram(c.show.program);
          c.texs.forEach((t) => g.deleteTexture(t));
          c.fbos.forEach((f) => g.deleteFramebuffer(f));
        }
      }
      g.deleteShader(vs);
      if (vao) g.deleteVertexArray(vao);
      g.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // The loop reads shader/hue from refs, so this effect runs once.
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
