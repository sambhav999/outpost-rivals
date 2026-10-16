import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FACTIONS, distance, hash } from "../shared/game";

type WorldProps = {
  game: any;
  cosmetic?: string;
  selected?: string;
  reachable?: string[];
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
};
type Controls = { reset: () => void; zoom: (direction: number) => void };
const at = (q: number, r: number) =>
  new THREE.Vector3(Math.sqrt(3) * (q + r / 2), 0, 1.5 * r);

export function World({ game, cosmetic, selected, reachable, onSelect, onHover }: WorldProps) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect);
  const hoverCallback = useRef(onHover);
  const selection = useRef(selected);
  const legal = useRef(reachable);
  const control = useRef<Controls | null>(null);
  const cameraState = useRef({ azimuth: 0.72, polar: 0.9, radius: 18 });
  const previousActors = useRef<Record<number, string>>({});
  const [fallback, setFallback] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  callback.current = onSelect;
  hoverCallback.current = onHover;
  selection.current = selected;
  legal.current = reachable;

  useEffect(() => {
    const el = host.current;
    if (!el || !game?.tiles || !game?.factions) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 760 ? 1.3 : 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    el.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Interactive hex world. Drag to rotate, scroll to zoom, click a hex to inspect.");

    const night = cosmetic === "moonwatch";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(night ? "#151c31" : "#172520");
    scene.fog = new THREE.FogExp2(night ? "#151c31" : "#172520", 0.018);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 90);
    const target = new THREE.Vector3(0, 0, 0);
    const aim = { ...cameraState.current };
    scene.add(new THREE.HemisphereLight(night ? 0xb0b8f4 : 0xe9efdc, 0x314840, night ? 2 : 2.5));
    const sun = new THREE.DirectionalLight(night ? 0xadb8ff : 0xffdfad, night ? 2.8 : 3.4);
    sun.position.set(-4, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -11;
    sun.shadow.camera.right = sun.shadow.camera.top = 11;
    sun.shadow.bias = -0.00025;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x97d4b0, 0.8);
    rim.position.set(7, 3, -5);
    scene.add(rim);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const track = <T extends THREE.BufferGeometry>(g: T) => (geometries.add(g), g);
    const mat = (color: THREE.ColorRepresentation, options: Record<string, any> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true, ...options });
      materials.add(m);
      return m;
    };
    const ground = mat(night ? "#344365" : "#667955");
    const stone = mat("#d7c5a2");
    const darkStone = mat("#a9a68b");
    const timber = mat("#705d45");
    const topGeometries = {
      side: track(new THREE.CylinderGeometry(0.99, 0.91, 0.55, 6, 1)),
      top: track(new THREE.CylinderGeometry(0.93, 0.95, 0.08, 6, 1)),
      ring: track(new THREE.TorusGeometry(0.76, 0.025, 4, 6)),
      pole: track(new THREE.CylinderGeometry(0.025, 0.035, 1.05, 6)),
      trunk: track(new THREE.CylinderGeometry(0.04, 0.07, 0.33, 5)),
      evergreen: track(new THREE.ConeGeometry(0.24, 0.64, 5)),
      rock: track(new THREE.DodecahedronGeometry(0.29, 0)),
      brick: track(new THREE.BoxGeometry(0.18, 0.19, 0.18)),
      wall: track(new THREE.BoxGeometry(0.73, 0.33, 0.65)),
      banner: track(new THREE.BoxGeometry(0.48, 0.27, 0.055)),
      crystal: track(new THREE.OctahedronGeometry(0.26, 0)),
      squad: track(new THREE.CylinderGeometry(0.09, 0.14, 0.35, 6)),
      head: track(new THREE.IcosahedronGeometry(0.12, 0)),
      cape: track(new THREE.ConeGeometry(0.17, 0.28, 5)),
    };
    const put = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const plinth = put(
      track(new THREE.CylinderGeometry(7.4, 7.6, 0.16, 48)),
      mat(night ? "#29354d" : "#28392c"),
      scene,
      0,
      -0.64,
      0,
    );
    plinth.castShadow = false;
    const halo = put(
      track(new THREE.RingGeometry(7.4, 7.49, 64)),
      mat(night ? "#7c83bb" : "#8da780", { emissive: night ? "#464d88" : "#425f3e", emissiveIntensity: 0.4, side: THREE.DoubleSide }),
      scene,
      0,
      -0.55,
      0,
    );
    halo.rotation.x = -Math.PI / 2;
    const floor = put(track(new THREE.PlaneGeometry(200, 200)), mat(night ? "#151c31" : "#172520"), scene, 0, -0.76, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;

    const interactives: THREE.Mesh[] = [];
    const crowns: Record<string, THREE.Mesh> = {};
    const rings: Record<string, THREE.Mesh> = {};
    const points: Record<string, THREE.Vector3> = {};
    const neutral = mat(night ? "#697490" : "#a1b17d");
    const forest = mat(night ? "#405874" : "#5f866c");
    const ridge = mat(night ? "#7b7f9a" : "#a4a891");
    const unknown = mat(night ? "#33415a" : "#43594f");
    const flagTop = mat("#d9c195", { emissive: "#786342", emissiveIntensity: 0.2 });
    const factionMaterials = FACTIONS.map((f) => mat(f.color, { emissive: f.color, emissiveIntensity: 0.12 }));
    const eligible = mat("#ccef9d", { emissive: "#81bd5f", emissiveIntensity: 0.75, transparent: true, opacity: 0.82 });
    const selectedMaterial = mat("#fff4cd", { emissive: "#e6bf6d", emissiveIntensity: 1.4 });
    const hoverMaterial = mat("#f8d5a1", { emissive: "#d8a65c", emissiveIntensity: 0.5 });
    const leaves = [mat("#315a47"), mat("#3e6e52"), mat("#5f8661")];

    for (const t of game.tiles) {
      const pos = at(t.q, t.r);
      points[t.id] = pos;
      const group = new THREE.Group();
      group.position.copy(pos);
      scene.add(group);
      const fog = t.kind === "fog";
      const terrain = fog ? unknown : t.owner >= 0 ? factionMaterials[t.owner] : t.kind === "forest" ? forest : t.kind === "rock" ? ridge : neutral;
      const side = put(topGeometries.side, mat(fog ? "#233d39" : t.kind === "rock" ? "#5f7568" : "#526650"), group, 0, -0.24);
      side.castShadow = false;
      const crown = put(topGeometries.top, terrain, group, 0, 0.07);
      crown.userData.tile = t.id;
      interactives.push(crown);
      crowns[t.id] = crown;
      const outline = put(topGeometries.ring, eligible, group, 0, 0.125);
      outline.rotation.x = -Math.PI / 2;
      outline.visible = false;
      outline.castShadow = false;
      rings[t.id] = outline;
      if (fog) {
        for (let i = 0; i < 3; i++) {
          const haze = put(topGeometries.rock, unknown, group, (i - 1) * 0.37, 0.23 + i * 0.025, ((i % 2) - 0.5) * 0.38);
          haze.scale.set(1.6, 0.25, 0.8);
        }
        continue;
      }
      const variation = hash(t.id);
      if (t.kind === "forest") {
        for (let i = 0; i < 4; i++) {
          const angle = i * 2.399 + variation * 0.000002;
          const radius = i === 0 ? 0.2 : 0.34 + (variation % 9) * 0.012;
          const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
          put(topGeometries.trunk, timber, group, x, 0.3, z);
          const foliage = put(topGeometries.evergreen, leaves[(i + variation) % leaves.length], group, x, 0.67, z);
          foliage.rotation.y = angle;
          foliage.scale.setScalar(i % 2 ? 0.8 : 1);
        }
      }
      if (t.kind === "rock") {
        for (let i = 0; i < 3; i++) {
          const b = put(topGeometries.rock, i % 2 ? ridge : darkStone, group, (i - 1) * 0.27, 0.28, i % 2 ? 0.15 : -0.18);
          b.rotation.set(0.2 * i, 0.6 * i, 0.15 * i);
          b.scale.setScalar(i === 1 ? 0.9 : 0.62);
        }
      }
      if (t.kind === "cache") {
        put(topGeometries.wall, timber, group, 0, 0.29).scale.set(0.8, 0.65, 0.7);
        put(topGeometries.crystal, mat("#a8e4d3", { emissive: "#6ec5b5", emissiveIntensity: 0.75 }), group, 0, 0.74);
        for (const x of [-0.25, 0.25]) put(topGeometries.brick, stone, group, x, 0.18, 0.28);
      }
      if (t.kind === "base" || t.fort) {
        put(topGeometries.wall, stone, group, 0, 0.32);
        for (const x of [-0.31, 0.31]) {
          put(topGeometries.brick, darkStone, group, x, 0.6, -0.25).scale.y = 2;
          put(topGeometries.brick, darkStone, group, x, 0.6, 0.25).scale.y = 2;
        }
        if (t.kind === "base") {
          put(topGeometries.wall, darkStone, group, 0, 0.74, -0.18).scale.set(0.55, 0.95, 0.5);
          put(topGeometries.pole, timber, group, 0.15, 1.32, -0.18);
          put(topGeometries.banner, factionMaterials[t.owner >= 0 ? t.owner : 0], group, 0.38, 1.57, -0.18);
        }
      }
      if (t.kind === "flag") {
        put(topGeometries.pole, timber, group, -0.08, 0.72, 0);
        put(topGeometries.banner, t.owner >= 0 ? factionMaterials[t.owner] : flagTop, group, 0.18, 1.13, 0);
        const dais = put(topGeometries.side, darkStone, group, 0, -0.05);
        dais.scale.set(0.48, 0.35, 0.48);
      }
    }

    const actorGroups: { group: THREE.Group; destination: THREE.Vector3; delay: number }[] = [];
    for (const f of game.factions) {
      if (!f.pos || !points[f.pos]) continue;
      const destination = points[f.pos];
      const group = new THREE.Group();
      const previous = previousActors.current[f.id];
      group.position.copy(previous && points[previous] ? points[previous] : destination);
      scene.add(group);
      actorGroups.push({ group, destination, delay: f.id * 0.08 });
      const cloth = factionMaterials[f.id];
      for (let i = 0; i < 4; i++) {
        const x = i === 0 ? 0 : (i - 2) * 0.24;
        const z = i === 0 ? -0.22 : 0.31;
        const size = i === 0 ? 1 : 0.68;
        const body = put(topGeometries.squad, cloth, group, x, 0.37 * size + 0.15, z);
        body.scale.setScalar(size);
        put(topGeometries.head, stone, group, x, 0.7 * size + 0.16, z).scale.setScalar(size);
      }
      put(topGeometries.cape, f.id === (game.you ?? 0) && cosmetic === "moss-crown" ? flagTop : cloth, group, 0, 0.88, -0.22);
      const standard = put(topGeometries.pole, timber, group, 0.18, 0.83, -0.24);
      standard.scale.y = 0.75;
      if (f.id === (game.you ?? 0) && cosmetic === "ember-standard") put(topGeometries.banner, cloth, group, 0.37, 1.12, -0.24);
      if (f.id === (game.you ?? 0) && cosmetic === "founder-seal") {
        const seal = put(topGeometries.ring, flagTop, group, 0, 0.18, -0.05);
        seal.rotation.x = -Math.PI / 2;
        seal.scale.setScalar(0.6);
      }
    }
    previousActors.current = Object.fromEntries(game.factions.filter((f: any) => !!f.pos).map((f: any) => [f.id, f.pos]));

    const particles = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      const a = i * 2.399, radius = 6.8 + (hash(String(i)) % 100) / 55;
      particles[i * 3] = Math.cos(a) * radius;
      particles[i * 3 + 1] = (i % 12) * 0.19 - 0.2;
      particles[i * 3 + 2] = Math.sin(a) * radius;
    }
    const dustGeometry = track(new THREE.BufferGeometry());
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(particles, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: night ? "#afb7ec" : "#c4dba5", size: 0.045, transparent: true, opacity: 0.45, depthWrite: false });
    materials.add(dustMaterial);
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    const marker = put(topGeometries.ring, selectedMaterial, scene);
    marker.rotation.x = -Math.PI / 2;
    marker.scale.setScalar(1.07);
    marker.castShadow = false;
    const routeMaterial = new THREE.LineDashedMaterial({ color: 0xe7d7a7, dashSize: 0.16, gapSize: 0.11, transparent: true, opacity: 0.88 });
    materials.add(routeMaterial);
    const routeGeometry = track(new THREE.BufferGeometry());
    const route = new THREE.Line(routeGeometry, routeMaterial);
    scene.add(route);
    let routeKey = "";
    let currentHover: string | null = null;
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const updateHover = (id: string | null) => {
      if (id === currentHover) return;
      currentHover = id;
      setHovered(id);
      hoverCallback.current?.(id);
      renderer.domElement.style.cursor = id ? "pointer" : "grab";
    };
    const pick = (event: PointerEvent) => {
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(interactives, false)[0]?.object.userData.tile as string | undefined;
    };
    let drag: { x: number; y: number; azimuth: number; polar: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, azimuth: cameraState.current.azimuth, polar: cameraState.current.polar, moved: false };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
        if (drag.moved) {
          cameraState.current.azimuth = drag.azimuth - dx * 0.006;
          cameraState.current.polar = THREE.MathUtils.clamp(drag.polar + dy * 0.004, 0.52, 1.26);
          updateHover(null);
          renderer.domElement.style.cursor = "grabbing";
          return;
        }
      }
      updateHover(pick(e) ?? null);
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const id = pick(e);
        if (id) callback.current?.(id);
      }
      drag = null;
      renderer.domElement.style.cursor = currentHover ? "pointer" : "grab";
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraState.current.radius = THREE.MathUtils.clamp(cameraState.current.radius + Math.sign(e.deltaY) * 1.15, 12, 25);
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") cameraState.current.azimuth += (e.key === "ArrowLeft" ? 1 : -1) * 0.12;
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") cameraState.current.polar = THREE.MathUtils.clamp(cameraState.current.polar + (e.key === "ArrowUp" ? -0.12 : 0.12), 0.52, 1.26);
      else if (e.key === "+" || e.key === "=") cameraState.current.radius = Math.max(12, cameraState.current.radius - 1);
      else if (e.key === "-") cameraState.current.radius = Math.min(25, cameraState.current.radius + 1);
      else return;
      e.preventDefault();
    };
    control.current = {
      reset: () => (cameraState.current = { azimuth: 0.72, polar: 0.9, radius: 18 }),
      zoom: (direction) => (cameraState.current.radius = THREE.MathUtils.clamp(cameraState.current.radius + direction * 1.5, 12, 25)),
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    const leave = () => updateHover(null);
    const contextLost = (event: Event) => { event.preventDefault(); setFallback(true); cancelAnimationFrame(frame); };
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    renderer.domElement.addEventListener("keydown", keydown);
    const resize = () => {
      const width = Math.max(1, el.clientWidth), height = Math.max(1, el.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0, lastFrame = 0;
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      if (document.hidden || (reduced && time - lastFrame < 50)) return;
      lastFrame = time;
      aim.azimuth += (cameraState.current.azimuth - aim.azimuth) * 0.12;
      aim.polar += (cameraState.current.polar - aim.polar) * 0.12;
      aim.radius += (cameraState.current.radius - aim.radius) * 0.12;
      camera.position.set(
        Math.sin(aim.polar) * Math.sin(aim.azimuth) * aim.radius,
        Math.cos(aim.polar) * aim.radius,
        Math.sin(aim.polar) * Math.cos(aim.azimuth) * aim.radius,
      );
      camera.lookAt(target);
      const chosen = selection.current;
      const allowed = new Set(legal.current || []);
      for (const [id, ring] of Object.entries(rings)) {
        const active = chosen === id;
        ring.visible = !active && allowed.has(id);
        if (ring.visible && !reduced) ring.scale.setScalar(1 + Math.sin(time * 0.003 + points[id].x) * 0.055);
        const crown = crowns[id];
        crown.material = active ? selectedMaterial : id === currentHover ? hoverMaterial : crown.userData.baseMaterial;
      }
      marker.visible = !!chosen && !!points[chosen];
      if (marker.visible) {
        marker.position.copy(points[chosen!]);
        marker.position.y = 0.15 + (reduced ? 0 : Math.sin(time * 0.004) * 0.025);
      }
      const player = game.factions[game.you ?? -1];
      const nextRoute = player?.pos && chosen && points[chosen] && player.pos !== chosen ? player.pos + ":" + chosen : "";
      if (nextRoute !== routeKey) {
        routeKey = nextRoute || "";
        routeGeometry.setFromPoints(nextRoute ? [points[player.pos].clone().setY(0.36), points[chosen!].clone().setY(0.36)] : []);
        route.computeLineDistances();
      }
      route.visible = !!nextRoute;
      for (const actor of actorGroups) {
        actor.group.position.lerp(actor.destination, reduced ? 1 : 0.085);
        if (!reduced) actor.group.position.y = Math.sin(time * 0.0018 + actor.delay) * 0.035;
      }
      if (!reduced) dust.rotation.y = time * 0.000015;
      renderer.render(scene, camera);
    };
    for (const tile of interactives) tile.userData.baseMaterial = tile.material;
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      control.current = null;
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.domElement.removeEventListener("keydown", keydown);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [game, cosmetic]);

  return (
    <div className="world" ref={host}>
      {fallback ? (
        <div className="world-fallback" role="group" aria-label="Text map, use buttons to inspect a hex">
          {game.tiles.map((t: any) => (
            <button key={t.id} className={t.id === selected ? "active" : ""} onClick={() => callback.current?.(t.id)}>
              {t.id} · {t.kind}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="world-vignette" aria-hidden="true" />
          <div className="world-coordinate">N · 01 / FRONTIER</div>
          <div className="world-controls" aria-label="World camera controls">
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => control.current?.zoom(-1)}>+</button>
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => control.current?.zoom(1)}>−</button>
            <button type="button" title="Reset camera" aria-label="Reset camera" onClick={() => control.current?.reset()}>⌕</button>
          </div>
          <div className="world-guide">DRAG TO ORBIT <span>·</span> SCROLL TO ZOOM <span>·</span> SELECT A HEX</div>
          {hovered && <div className="world-hover" aria-hidden="true">{hovered} <span>{game.tiles.find((t: any) => t.id === hovered)?.kind}</span></div>}
        </>
      )}
    </div>
  );
}
