/**
 * The surface.
 *
 * Two ridges of columns in space — Model A at the back, Model B at the front.
 * X = difficulty 1..10, Z (height) = accuracy 0..100%, colour = mean reasoning
 * tokens. A vertical marker stands at the crossover difficulty.
 *
 * Plain three.js, no react-three-fiber, so the render loop stays under our
 * control and the 2x PNG export can re-render deterministically.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { rampColor, SLOT_COLORS } from './colour';
import { DIFFICULTIES, type Aggregate, type Cell, type Crossover, type ModelSlot } from './types';

export interface SurfaceData {
  aggregate: Aggregate;
  crossover: Crossover;
  /** The reasoning-disabled run, drawn as a ghost ridge when the overlay is on. */
  ghost?: Aggregate | null;
  /** Difficulty levels flagged as wasted compute. */
  wasted: number[];
  modelNames: Record<ModelSlot, string>;
  /** True while a sweep is still running, so the surface can show its progress. */
  live?: boolean;
  /** Samples each cell will hold once the run finishes. */
  expectedSamples?: number;
}

export interface HoverInfo {
  difficulty: number;
  /** Screen position, in CSS pixels relative to the viewport element. */
  x: number;
  y: number;
}

export interface SurfaceHandle {
  setData: (data: SurfaceData) => void;
  setGhostVisible: (visible: boolean) => void;
  /** Re-render at a scale factor and return a PNG data URL. */
  exportPng: (scale: number) => string;
  resize: () => void;
  dispose: () => void;
  resetView: () => void;
}

const ROW_A_Z = -2.4;
const ROW_B_Z = 2.4;
const COLUMN_WIDTH = 1.5;
const ACCURACY_HEIGHT = 8; // world units for 100%
const X_STEP = 2.1;

export function createSurface(
  container: HTMLElement,
  initial: SurfaceData,
  onHover: (info: HoverInfo | null) => void,
): SurfaceHandle {
  let data = initial;
  let ghostVisible = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0e12');
  scene.fog = new THREE.Fog('#0b0e12', 34, 62);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true, // required for toDataURL
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 15, 27);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 12;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 3.2, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.42;

  // Slow auto-rotate when idle: pause while the pointer is over the canvas or
  // the user is dragging, resume a moment after they stop.
  let idleTimer: number | undefined;
  const wake = () => {
    controls.autoRotate = false;
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      controls.autoRotate = true;
    }, 4000);
  };
  controls.addEventListener('start', wake);
  renderer.domElement.addEventListener('pointermove', wake);
  renderer.domElement.addEventListener('pointerleave', () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      controls.autoRotate = true;
    }, 1500);
  });

  // ------------------------------------------------------------- static rig
  const rig = new THREE.Group();
  scene.add(rig);

  const grid = new THREE.GridHelper(26, 13, 0x232b36, 0x1a212b);
  grid.position.y = 0;
  rig.add(grid);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 22),
    new THREE.MeshBasicMaterial({ color: 0x0e1218, transparent: true, opacity: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  rig.add(floor);

  // Axis labels, drawn as canvas sprites so they stay legible from any angle.
  rig.add(makeLabel('DIFFICULTY  →', 0, 0.05, 6.4, 0.42, '#8a93a0'));
  rig.add(makeLabel('ACCURACY  ↑', -13.6, 4.6, 0, 0.42, '#8a93a0', true));
  rig.add(makeLabel('MODEL A', 0, 0.05, ROW_A_Z - 1.9, 0.4, SLOT_COLORS.A));
  rig.add(makeLabel('MODEL B', 0, 0.05, ROW_B_Z + 1.9, 0.4, SLOT_COLORS.B));

  for (const d of DIFFICULTIES) {
    rig.add(makeLabel(String(d), xFor(d), 0.05, ROW_B_Z + 3.1, 0.34, '#5c6673'));
  }

  // Accuracy scale on the left, as faint guide lines.
  for (const pct of [25, 50, 75, 100]) {
    const y = (pct / 100) * ACCURACY_HEIGHT;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(xFor(1) - 1.1, y, ROW_A_Z - 1),
        new THREE.Vector3(xFor(10) + 1.1, y, ROW_B_Z + 1),
      ]),
      new THREE.LineBasicMaterial({ color: 0x1e2630, transparent: true, opacity: 0.7 }),
    );
    rig.add(line);
    rig.add(makeLabel(`${pct}%`, xFor(1) - 2.1, y, ROW_B_Z + 0.6, 0.3, '#4d5661'));
  }

  // ------------------------------------------------------------ dynamic bits
  const columnsGroup = new THREE.Group();
  rig.add(columnsGroup);

  const ghostGroup = new THREE.Group();
  rig.add(ghostGroup);

  const pendingGroup = new THREE.Group();
  rig.add(pendingGroup);

  const markerGroup = new THREE.Group();
  rig.add(markerGroup);

  const pickTargets: THREE.Mesh[] = [];

  // ------------------------------------------------------------------ build
  function clear(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      disposeDeep(child);
    }
  }

  function build() {
    clear(columnsGroup);
    clear(ghostGroup);
    clear(markerGroup);
    clear(pendingGroup);
    pickTargets.length = 0;

    const { min, max } = reasoningRange(data.aggregate);
    const expected = data.expectedSamples ?? 5;

    for (const slot of ['A', 'B'] as ModelSlot[]) {
      const rowZ = slot === 'A' ? ROW_A_Z : ROW_B_Z;
      for (const difficulty of DIFFICULTIES) {
        const cell = data.aggregate.cells.find((c) => c.difficulty === difficulty && c.slot === slot);

        // Not measured yet: show the empty slot so the field reads as a grid
        // still being filled in, rather than as a finished shape.
        if (!cell || cell.samples === 0) {
          const box = new THREE.BoxGeometry(COLUMN_WIDTH, ACCURACY_HEIGHT, COLUMN_WIDTH);
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(box),
            new THREE.LineBasicMaterial({ color: 0x2b3644, transparent: true, opacity: 0.55 }),
          );
          outline.position.set(xFor(difficulty), ACCURACY_HEIGHT / 2, rowZ);
          pendingGroup.add(outline);
          box.dispose();

          // A footprint on the floor, so the slot is visible from above too.
          const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(COLUMN_WIDTH, 0.04, COLUMN_WIDTH),
            new THREE.MeshBasicMaterial({ color: 0x2b3644, transparent: true, opacity: 0.5 }),
          );
          plinth.position.set(xFor(difficulty), 0.02, rowZ);
          pendingGroup.add(plinth);
          continue;
        }

        // Measured, but not yet with every sample: draw it provisional so a
        // half-finished cell is never mistaken for a settled number.
        const provisional = data.live === true && cell.samples < expected;

        const height = Math.max(0.06, (cell.accuracy / 100) * ACCURACY_HEIGHT);
        const t = normaliseTokens(cell.meanReasoningTokens, min, max);
        const colour = rampColor(t);

        const wasted = data.wasted.includes(difficulty);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(COLUMN_WIDTH, height, COLUMN_WIDTH),
          new THREE.MeshStandardMaterial({
            color: colour,
            roughness: 0.45,
            metalness: 0.1,
            emissive: colour.clone().multiplyScalar(wasted ? 0.42 : 0.16),
            transparent: provisional,
            opacity: provisional ? 0.62 : 1,
          }),
        );
        mesh.position.set(xFor(difficulty), height / 2, rowZ);
        mesh.userData = { difficulty };
        columnsGroup.add(mesh);
        pickTargets.push(mesh);

        // A thin cap so the top of each column reads clearly at a glance.
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(COLUMN_WIDTH * 1.06, 0.06, COLUMN_WIDTH * 1.06),
          new THREE.MeshBasicMaterial({
            color: colour.clone().lerp(new THREE.Color('#ffffff'), 0.35),
            transparent: provisional,
            opacity: provisional ? 0.7 : 1,
          }),
        );
        cap.position.set(xFor(difficulty), height + 0.03, rowZ);
        cap.userData = { difficulty };
        columnsGroup.add(cap);
        pickTargets.push(cap);

        // An outline around a provisional column, so "still measuring" is
        // legible at a glance rather than only via a lighter fill.
        if (provisional) {
          const box = new THREE.BoxGeometry(COLUMN_WIDTH, height, COLUMN_WIDTH);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(box),
            new THREE.LineBasicMaterial({ color: 0x9fb0c4, transparent: true, opacity: 0.8 }),
          );
          edges.position.set(xFor(difficulty), height / 2, rowZ);
          columnsGroup.add(edges);
          box.dispose();
        }
      }
    }

    // Ghost ridge: the reasoning-disabled run, drawn as translucent outlines.
    if (data.ghost) {
      for (const slot of ['A', 'B'] as ModelSlot[]) {
        const rowZ = slot === 'A' ? ROW_A_Z : ROW_B_Z;
        for (const difficulty of DIFFICULTIES) {
          const cell = data.ghost.cells.find((c) => c.difficulty === difficulty && c.slot === slot);
          if (!cell || cell.samples === 0) continue;
          const height = Math.max(0.06, (cell.accuracy / 100) * ACCURACY_HEIGHT);
          const box = new THREE.BoxGeometry(COLUMN_WIDTH * 0.92, height, COLUMN_WIDTH * 0.92);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(box),
            new THREE.LineBasicMaterial({ color: 0xff4d3d, transparent: true, opacity: 0.75 }),
          );
          edges.position.set(xFor(difficulty), height / 2, rowZ);
          ghostGroup.add(edges);
          box.dispose();
        }
      }
      ghostGroup.visible = ghostVisible;
    }

    buildCrossoverMarker();
  }

  function buildCrossoverMarker() {
    const d = data.crossover.difficulty;
    if (d === null) return;
    const x = xFor(d);
    const z = (ROW_A_Z + ROW_B_Z) / 2;

    // A vertical plane standing between the two ridges.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, ACCURACY_HEIGHT + 1.6),
      new THREE.MeshBasicMaterial({
        color: 0xff4d3d,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    plane.position.set(x, (ACCURACY_HEIGHT + 1.6) / 2, z);
    markerGroup.add(plane);

    // A footprint line on the floor, so the marker reads from above too.
    const foot = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.02, ROW_A_Z - 1.6),
        new THREE.Vector3(x, 0.02, ROW_B_Z + 1.6),
      ]),
      new THREE.LineBasicMaterial({ color: 0xff4d3d }),
    );
    markerGroup.add(foot);

    const label = makeLabel(
      `CROSSOVER  D${d}`,
      x,
      ACCURACY_HEIGHT + 2.1,
      z,
      0.52,
      '#ff4d3d',
      false,
      3.6,
    );
    markerGroup.add(label);
  }

  // -------------------------------------------------------------- lighting
  scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x0a0d11, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(9, 18, 11);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fa8c9, 0.5);
  rim.position.set(-12, 7, -10);
  scene.add(rim);

  // ------------------------------------------------------------------ hover
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovering = false;

  function onPointerMove(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickTargets, false);
    const hit = hits[0];
    if (hit) {
      const difficulty = hit.object.userData['difficulty'] as number;
      hovering = true;
      renderer.domElement.style.cursor = 'crosshair';
      onHover({
        difficulty,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    } else if (hovering) {
      hovering = false;
      renderer.domElement.style.cursor = 'grab';
      onHover(null);
    }
  }

  function onPointerLeave() {
    if (!hovering) return;
    hovering = false;
    onHover(null);
  }

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  // ------------------------------------------------------------------- loop
  let raf = 0;
  let disposed = false;

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function tick() {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }

  resize();
  build();
  tick();

  const observer = new ResizeObserver(() => resize());
  observer.observe(container);

  return {
    setData(next: SurfaceData) {
      data = next;
      build();
    },
    setGhostVisible(visible: boolean) {
      ghostVisible = visible;
      ghostGroup.visible = visible;
    },
    exportPng(scale: number) {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      const previousRatio = renderer.getPixelRatio();
      renderer.setPixelRatio(scale);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      // Restore the interactive size.
      renderer.setPixelRatio(previousRatio);
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
      return url;
    },
    resize,
    resetView() {
      camera.position.set(0, 15, 27);
      controls.target.set(0, 3.2, 0);
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      clear(columnsGroup);
      clear(ghostGroup);
      clear(pendingGroup);
      clear(markerGroup);
      disposeDeep(rig);
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

// --------------------------------------------------------------------- utils

function xFor(difficulty: number): number {
  return (difficulty - 5.5) * X_STEP;
}

function normaliseTokens(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

function reasoningRange(agg: Aggregate): { min: number; max: number } {
  const values = agg.cells.map((c) => c.meanReasoningTokens);
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: max === min ? min + 1 : max };
}

function makeLabel(
  text: string,
  x: number,
  y: number,
  z: number,
  scale: number,
  colour: string,
  rotateY = false,
  widthScale = 1,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontPx = 64;
  ctx.font = `600 ${fontPx}px "IBM Plex Mono", monospace`;
  const metrics = ctx.measureText(text);
  const pad = 18;
  canvas.width = Math.ceil(metrics.width + pad * 2);
  canvas.height = fontPx + pad * 2;

  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = `600 ${fontPx}px "IBM Plex Mono", monospace`;
  ctx2.fillStyle = colour;
  ctx2.textBaseline = 'middle';
  ctx2.fillText(text, pad, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect * widthScale, scale, 1);
  sprite.position.set(x, y, z);
  if (rotateY) sprite.material.rotation = Math.PI / 2;
  sprite.renderOrder = 10;
  return sprite;
}

function disposeDeep(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      for (const m of material) disposeMaterial(m);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material) {
  const map = (material as unknown as { map?: THREE.Texture | null }).map;
  if (map) map.dispose();
  material.dispose();
}

export type { Cell };