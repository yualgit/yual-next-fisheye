"use client";

import React, { useEffect, useRef } from "react";

// Minimal WebGL helpers
function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile failed: " + info);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("Program link failed: " + info);
  }
  return program;
}

// Vertex and fragment shaders using fisheye mapping similar to bluemir/fisheye-correction-webgl
const VS = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5; // from clip space to uv
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uK;        // quadratic distortion
uniform float uKcube;    // cubic distortion
uniform vec2 uResolution; // for potential scaling (not strictly needed here)

void main() {
  vec2 uv = vUv;
  // center and compute radial distance
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);
  // bluemir-like mapping: f = 1 + r^2 * (k + kcube * sqrt(r^2))
  float f = 1.0 + r2 * (uK + uKcube * sqrt(r2));
  vec2 distorted = f * centered + 0.5;

  // keep inside bounds to avoid artifacts
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    vec4 col = texture2D(uTexture, distorted);
    // mild vignette for depth
    float vignette = smoothstep(0.9, 0.2, r2);
    col.rgb *= mix(0.85, 1.0, vignette);
    gl_FragColor = col;
  }
}
`;

export default function FisheyeTextScene({
  text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  speed = 20, // pixels per second
  k = -0.28, // distortion strength (negative => bulge/fish-eye)
  kcube = 0.10, // cubic tweak
}: {
  text?: string;
  speed?: number;
  k?: number;
  kcube?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
  const canvas = canvasRef.current!;
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false }) as WebGLRenderingContext;
  if (!gl) return;

  // Ensure image Y is aligned with canvas (top-left origin)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // Create program
    const program = createProgram(gl, VS, FS);
    gl.useProgram(program);

    // Fullscreen quad
    const quad = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uTexture = gl.getUniformLocation(program, "uTexture");
    const uK = gl.getUniformLocation(program, "uK");
    const uKcube = gl.getUniformLocation(program, "uKcube");
    const uResolution = gl.getUniformLocation(program, "uResolution");
    gl.uniform1f(uK, k);
    gl.uniform1f(uKcube, kcube);

    // Offscreen 2D canvas to draw gradient + scrolling text
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d")!;

    // Create texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let raf = 0;
    let start = performance.now();
    let scroll = 0; // vertical scroll in pixels

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uResolution, canvas.width, canvas.height);

      // Offscreen matches visible for crisp text
      off.width = w;
      off.height = h;
    }

    function drawOffscreen(dt: number) {
      // Background gradient (red-ish like provided image)
      const w = off.width;
      const h = off.height;
      const ctx = offCtx;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#b91c1c"); // red-700
      grad.addColorStop(0.5, "#ef4444"); // red-500
      grad.addColorStop(1, "#dc2626"); // red-600
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // soft spot at bottom
      const rad = Math.max(w, h) * 0.25;
      const rg = ctx.createRadialGradient(w * 0.5, h * 0.82, rad * 0.1, w * 0.5, h * 0.85, rad);
      rg.addColorStop(0, "rgba(255,200,180,0.35)");
      rg.addColorStop(1, "rgba(255,150,150,0.0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.85, rad, 0, Math.PI * 2);
      ctx.fill();

  // Scroll text upward (bottom -> top)
      scroll += (speed * dt);
      // prepare text settings
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const isMobile = window.innerWidth < 768;
      const fontPx = Math.max(16, Math.floor((isMobile ? h * 0.04 : h * 0.05)));
      ctx.font = `bold ${fontPx}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = Math.floor(fontPx * 0.3);

      const lines = wrapText(ctx, text, Math.floor((isMobile ? w * 0.8 : w * 0.65)));
      const lineHeight = Math.floor(fontPx * 1.25);

      // duplicate content vertically to loop
      const blockHeight = lines.length * lineHeight + h * 0.2;
      const bottomMargin = h * 0.10;
      const baseY = h - bottomMargin - (scroll % blockHeight);

      // draw two stacks so scrolling is seamless
      for (let pass = -1; pass <= 0; pass++) {
        const y = baseY + pass * blockHeight;
        // fade edges top/bottom
        for (let i = 0; i < lines.length; i++) {
          const lx = w * 0.5;
          const ly = y + i * lineHeight;
          const a = edgeAlpha(ly, h, lineHeight * 2);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          ctx.fillText(lines[i], lx, ly);
        }
      }

      ctx.globalAlpha = 1;
    }

    function wrapText(ctx: CanvasRenderingContext2D, t: string, maxWidth: number) {
      const words = t.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (let i = 0; i < words.length; i++) {
        const test = line ? line + " " + words[i] : words[i];
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = words[i];
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    function edgeAlpha(y: number, h: number, fade: number) {
      const top = Math.min(1, (y - 0) / fade);
      const bottom = Math.min(1, (h - y) / fade);
      return Math.max(0, Math.min(top, bottom));
    }

    function render(now: number) {
      const dt = Math.min(0.05, (now - start) / 1000);
      start = now;

      drawOffscreen(dt);

      // Upload to texture
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
  gl.uniform1i(uTexture, 0);

      // Clear and draw quad
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

      raf = requestAnimationFrame(render);
    }

    const onResize = () => {
      resize();
    };
    resize();
    raf = requestAnimationFrame(render);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      gl.deleteTexture(tex);
      gl.deleteBuffer(vbo);
      gl.useProgram(null);
    };
  }, [text, speed, k, kcube]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
