import { useEffect, useRef } from "react";
import type { ClassId } from "@/game/classes";

export function ClassPreview({ cls }: { cls: ClassId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let cancelled = false;
    let cleanup: null | (() => void) = null;

    (async () => {
      const [models, THREE, classesMod] = await Promise.all([
        import("@/game/classModel"),
        import("three"),
        import("@/game/classes"),
      ]);
      const el = canvasRef.current;
      if (cancelled || !el) return;

      const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0.8, 1.6, 4.8);
      camera.lookAt(0, 1.05, 0);
      scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4438, 1.35));
      const sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
      sun.position.set(3, 6, 4);
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0x9cc4dd, 0.8);
      rim.position.set(-3, 2.2, -4);
      scene.add(rim);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 28),
        new THREE.MeshLambertMaterial({ color: 0x2b323b })
      );
      disc.rotation.x = -Math.PI / 2;
      scene.add(disc);

      const model = models.buildClassModel(0, cls);
      const def = classesMod.CLASSES[cls].weapons[0] as NonNullable<(typeof classesMod.CLASSES)[ClassId]["weapons"][number]>;
      model.gun.add(models.buildWeaponModel(def, 0));
      const arms = { l: model.g.userData["leftArm"], r: model.g.userData["rightArm"] };
      const legs = { l: model.g.userData["leftLeg"], r: model.g.userData["rightLeg"] };
      if (arms.l) arms.l.rotation.x = 0.5; // relaxed weapon-hold pose
      if (arms.r) arms.r.rotation.x = -0.15;
      scene.add(model.g);

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const clock = new THREE.Clock();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const tick = () => {
        if (cancelled) return;
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.getElapsedTime();
        model.g.rotation.y = Math.PI + 0.45 + (reduced ? 0 : Math.sin(t * 0.45) * 0.35);
        model.g.position.y = reduced ? 0 : Math.sin(t * 1.6) * 0.012;
        if (arms.l) arms.l.rotation.x = -0.7 + (reduced ? 0 : Math.sin(t * 2) * 0.025);
        if (arms.r) arms.r.rotation.x = -0.55;
        if (legs.l) legs.l.rotation.x = 0.03;
        if (legs.r) legs.r.rotation.x = -0.03;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        scene.traverse((o: any) => {
          o.geometry?.dispose?.();
          if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.());
          else o.material?.dispose?.();
        });
        renderer.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [cls]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-label={`${cls} preview`} />;
}
