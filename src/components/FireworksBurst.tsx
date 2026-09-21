import { useEffect, useRef } from "react";

/**
 * Luxury fireworks overlay rendered on a full-screen canvas.
 * Fires an initial celebratory volley, then gentle periodic bursts.
 * Respects prefers-reduced-motion and cleans up after ~6 seconds.
 */
interface FireworksBurstProps {
  /** Fire when this key changes (e.g. increment to replay) */
  trigger?: number;
  /** Total duration in ms before the show ends (particles fade out) */
  duration?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
  sparkle: boolean;
}

const PALETTE = [
  "250, 204, 21",  // gold
  "253, 224, 71",  // light gold
  "190, 24, 93",   // maroon/rose
  "16, 185, 129",  // emerald
  "255, 255, 255", // white sparkle
];

export const FireworksBurst = ({ trigger = 0, duration = 6000 }: FireworksBurstProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    let raf = 0;
    const start = performance.now();
    let running = true;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const explode = (cx: number, cy: number, color: string, count = 46, power = 4.2) => {
      const isWhite = color === "255, 255, 255";
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.12, 0.12);
        const speed = rand(0.45, 1) * power;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: rand(50, 85),
          color,
          size: isWhite ? rand(1, 1.8) : rand(1.4, 2.6),
          gravity: 0.035,
          sparkle: Math.random() < 0.35,
        });
      }
    };

    const launchVolley = () => {
      // Big opening burst near the top center
      const cx = width * rand(0.42, 0.58);
      const cy = height * rand(0.16, 0.3);
      explode(cx, cy, PALETTE[Math.floor(rand(0, 3))], 60, 5);
      explode(width * rand(0.12, 0.3), height * rand(0.12, 0.24), PALETTE[Math.floor(rand(0, 3))], 40, 4);
      explode(width * rand(0.7, 0.88), height * rand(0.12, 0.24), PALETTE[3], 40, 4);
      explode(width * rand(0.3, 0.45), height * rand(0.34, 0.44), "255, 255, 255", 24, 3);
    };

    launchVolley();

    const burstTimer = window.setInterval(() => {
      // Stop spawning new bursts once the show duration has elapsed
      if (!running || performance.now() - start >= duration) {
        window.clearInterval(burstTimer);
        return;
      }
      explode(width * rand(0.15, 0.85), height * rand(0.12, 0.4), PALETTE[Math.floor(rand(0, PALETTE.length))], rand(24, 44), rand(3, 4.4));
    }, 750);

    const tick = () => {
      if (!running) return;
      const elapsed = performance.now() - start;
      ctx.clearRect(0, 0, width, height);
      // Trail fade
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.985;
        p.vy *= 0.985;
        const t = 1 - p.life / p.maxLife;
        if (t <= 0) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = t * (p.sparkle && Math.random() < 0.4 ? 0.35 : 1);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.color}, ${alpha.toFixed(3)})`;
        ctx.arc(p.x, p.y, p.size * t + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (elapsed < duration) {
        raf = requestAnimationFrame(tick);
      } else if (particles.length === 0) {
        running = false;
        ctx.clearRect(0, 0, width, height);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.clearInterval(burstTimer);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [trigger, duration]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
};
