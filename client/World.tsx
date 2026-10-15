import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FACTIONS } from "../shared/game";
export function World({
  game,
  onSelect,
  selected,
  cosmetic,
}: {
  cosmetic?: string;
  game: any;
  onSelect?: (id: string) => void;
  selected?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    [fallback, setFallback] = useState(false),
    callback = useRef(onSelect);
  callback.current = onSelect;
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback(true);
      return;
    }
    const el = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    if (cosmetic === "moonwatch")
      scene.fog = new THREE.FogExp2("#293044", 0.026);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(10, 12, 13);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xe1f2e1, 0x344438, 2));
    const sun = new THREE.DirectionalLight(0xffe6ba, 3);
    sun.position.set(4, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10,
    });
    scene.add(sun);
    const meshes: THREE.Mesh[] = [],
      actors: THREE.Group[] = [];
    const geo: THREE.BufferGeometry[] = [],
      mats: THREE.Material[] = [];
    function mesh(
      g: THREE.BufferGeometry,
      color: string,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = scene,
    ) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      const a = new THREE.Mesh(g, m);
      a.position.set(x, y, z);
      a.castShadow = true;
      a.receiveShadow = true;
      parent.add(a);
      geo.push(g);
      mats.push(m);
      return a;
    }
    const point = (q: number, r: number) => [
      Math.sqrt(3) * (q + r / 2),
      1.5 * r,
    ];
    for (const t of game.tiles) {
      const [x, z] = point(t.q, t.r),
        fog = t.kind === "fog",
        color = fog
          ? "#263b36"
          : t.owner >= 0
            ? FACTIONS[t.owner].color
            : t.kind === "rock"
              ? "#65766c"
              : t.kind === "forest"
                ? "#536d4d"
                : "#829169";
      const tile = mesh(
        new THREE.CylinderGeometry(0.96, 0.9, 0.32, 6),
        color,
        x,
        -0.18,
        z,
      );
      tile.userData.tile = t.id;
      meshes.push(tile);
      if (selected === t.id) {
        const ring = mesh(
          new THREE.TorusGeometry(0.8, 0.055, 8, 6),
          "#f6efc8",
          x,
          0.06,
          z,
        );
        ring.rotation.x = -Math.PI / 2;
      }
      if (fog) continue;
      if (t.kind === "forest")
        for (let n = 0; n < 3; n++) {
          const dx = (n - 1) * 0.34,
            dz = (n % 2) * 0.3;
          mesh(
            new THREE.CylinderGeometry(0.045, 0.07, 0.4, 5),
            "#4b4333",
            x + dx,
            0.2,
            z + dz,
          );
          mesh(
            new THREE.ConeGeometry(0.3, 0.75, 5),
            "#314e3d",
            x + dx,
            0.65,
            z + dz,
          );
        }
      if (t.kind === "rock")
        mesh(new THREE.DodecahedronGeometry(0.38, 0), "#a5ac99", x, 0.26, z);
      if (t.kind === "base" || t.fort) {
        mesh(new THREE.BoxGeometry(0.8, 0.4, 0.65), "#ddd4b3", x, 0.2, z);
        for (const dx of [-0.35, 0.35])
          mesh(
            new THREE.BoxGeometry(0.22, 0.65, 0.25),
            "#e5dfc4",
            x + dx,
            0.35,
            z - 0.23,
          );
        mesh(
          new THREE.BoxGeometry(0.18, 0.25, 0.04),
          "#384239",
          x,
          0.14,
          z + 0.34,
        );
      }
      if (t.kind === "flag") {
        mesh(
          new THREE.CylinderGeometry(0.035, 0.05, 1.4, 6),
          "#e1d6b0",
          x,
          0.7,
          z,
        );
        mesh(
          new THREE.BoxGeometry(0.65, 0.35, 0.04),
          t.owner >= 0 ? FACTIONS[t.owner].color : "#f1e9ca",
          x + 0.3,
          1.2,
          z,
        );
        mesh(
          new THREE.CylinderGeometry(0.4, 0.5, 0.12, 6),
          "#b9ae87",
          x,
          0.03,
          z,
        );
      }
      if (t.kind === "cache") {
        mesh(new THREE.BoxGeometry(0.55, 0.35, 0.5), "#b9a078", x, 0.18, z);
        mesh(new THREE.BoxGeometry(0.6, 0.055, 0.55), "#dbc295", x, 0.37, z);
      }
    }
    for (const f of game.factions) {
      if (!f.pos) continue;
      const tile = game.tiles.find((t: any) => t.id === f.pos);
      if (!tile) continue;
      const [x, z] = point(tile.q, tile.r),
        group = new THREE.Group();
      scene.add(group);
      group.position.set(x, 0, z);
      actors.push(group);
      for (let n = 0; n < 4; n++) {
        const dx = n === 0 ? 0 : (n - 2) * 0.25,
          dz = n === 0 ? -0.2 : 0.25;
        mesh(
          new THREE.CylinderGeometry(
            n ? 0.075 : 0.13,
            n ? 0.1 : 0.17,
            n ? 0.25 : 0.45,
            6,
          ),
          FACTIONS[f.id].color,
          dx,
          n ? 0.22 : 0.3,
          dz,
          group,
        );
        mesh(
          new THREE.SphereGeometry(n ? 0.085 : 0.12, 6, 5),
          "#f0d6ad",
          dx,
          n ? 0.42 : 0.62,
          dz,
          group,
        );
      }
      mesh(
        new THREE.ConeGeometry(0.18, 0.18, 4),
        cosmetic === "moss-crown" && f.id === (game.you ?? 0)
          ? "#ebdf8a"
          : FACTIONS[f.id].color,
        0,
        0.8,
        -0.2,
        group,
      );
      if (f.id === (game.you ?? 0) && cosmetic === "ember-standard") {
        mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 1.2, 5),
          "#a78b68",
          0.25,
          0.6,
          0,
          group,
        );
        mesh(
          new THREE.BoxGeometry(0.35, 0.3, 0.025),
          "#e99c74",
          0.4,
          1,
          0,
          group,
        );
      }
      if (f.id === (game.you ?? 0) && cosmetic === "founder-seal") {
        const seal = mesh(
          new THREE.TorusGeometry(0.38, 0.035, 6, 12),
          "#e4d3a5",
          0,
          0.1,
          0,
          group,
        );
        seal.rotation.x = -Math.PI / 2;
      }
    }
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    const ray = new THREE.Raycaster(),
      mouse = new THREE.Vector2();
    const click = (e: PointerEvent) => {
      const box = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - box.left) / box.width) * 2 - 1,
        (-(e.clientY - box.top) / box.height) * 2 + 1,
      );
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(meshes)[0];
      if (hit) callback.current?.(hit.object.userData.tile);
    };
    renderer.domElement.addEventListener("pointerup", click);
    let frame = 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animate = (time: number) => {
      if (!reduced)
        actors.forEach(
          (a, i) => (a.position.y = Math.sin(time * 0.0015 + i) * 0.04),
        );
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerup", click);
      geo.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game, selected, cosmetic]);
  return (
    <div
      className="world"
      ref={host}
      aria-label="Interactive isometric hex battlefield"
    >
      {fallback && (
        <div className="fallback">
          {game.tiles.map((t: any) => (
            <button key={t.id} onClick={() => onSelect?.(t.id)}>
              {t.id} · {t.kind}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
