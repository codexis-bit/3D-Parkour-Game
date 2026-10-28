import './style.css';
import * as THREE from 'three';
import { GAME } from './config/game';
import { DEFAULT_ENVIRONMENT } from './config/render';
import { Graphics } from './core/Graphics';
import { initPhysics, Physics } from './core/Physics';
import { Environment } from './level/Environment';
import { MaterialLibrary, TEXTURE_TILE_SIZE } from './level/materials';
import { createWorldBox } from './level/geometry';

/**
 * Meilenstein 1: leere Szene mit Boden, Licht, Himmel und initialisierter Physik.
 */
async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('DOM-Grundgerüst fehlt');

  ui.innerHTML = `<div class="boot-overlay"><div><h1>${GAME.name}</h1>Lade Physik …</div></div>`;

  const graphics = new Graphics(canvas);
  graphics.setQuality('high');
  graphics.setHorizontalFov(95);
  const environment = new Environment(graphics.scene, DEFAULT_ENVIRONMENT);
  environment.setQuality(graphics.preset);

  const rapier = await initPhysics();
  const physics = new Physics(1 / 60);
  const materials = new MaterialLibrary(graphics.anisotropy);

  // Boden als Box (Collider + Mesh mit Welt-UVs).
  const groundSize = new THREE.Vector3(80, 1, 80);
  const groundCenter = new THREE.Vector3(0, -0.5, 0);
  physics.addStaticBox(
    groundCenter,
    { x: groundSize.x / 2, y: groundSize.y / 2, z: groundSize.z / 2 },
    null,
    { kind: 'solid', elementId: 0, wallRunnable: false },
  );
  const ground = new THREE.Mesh(
    createWorldBox(
      groundSize,
      new THREE.Matrix4().makeTranslation(groundCenter),
      TEXTURE_TILE_SIZE,
    ),
    materials.get('base'),
  );
  ground.receiveShadow = true;
  graphics.scene.add(ground);

  // Ein paar Referenzblöcke, damit Licht und Schatten sichtbar sind.
  const blocks: [THREE.Vector3, THREE.Vector3, Parameters<MaterialLibrary['get']>[0]][] = [
    [new THREE.Vector3(-6, 1.5, -10), new THREE.Vector3(4, 3, 4), 'base'],
    [new THREE.Vector3(6, 3, -14), new THREE.Vector3(0.6, 6, 12), 'wallRun'],
    [new THREE.Vector3(0, 0.25, -4), new THREE.Vector3(3, 0.5, 3), 'jumpPad'],
  ];
  for (const [center, size, key] of blocks) {
    const mesh = new THREE.Mesh(
      createWorldBox(size, new THREE.Matrix4().makeTranslation(center), TEXTURE_TILE_SIZE),
      materials.get(key),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    graphics.scene.add(mesh);
  }
  physics.step();

  ui.innerHTML = '';
  console.info(
    `${GAME.name} ${GAME.version} – Rapier ${rapier.version()}, Three r${THREE.REVISION}`,
  );

  const focus = new THREE.Vector3();
  let last = performance.now();
  let angle = 0;
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    angle += dt * 0.15;
    graphics.camera.position.set(Math.sin(angle) * 22, 7, Math.cos(angle) * 22 - 6);
    graphics.camera.lookAt(0, 1.5, -6);
    environment.update(focus, graphics.camera);
    physics.step();
    graphics.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((error: unknown) => {
  console.error(error);
  const ui = document.querySelector('#ui');
  if (ui) {
    ui.innerHTML = `<div class="fatal-error"><div><h2>Start fehlgeschlagen</h2><p>${
      error instanceof Error ? error.message : String(error)
    }</p><p>Bitte verwende einen aktuellen Browser mit WebGL2-Unterstützung.</p></div></div>`;
  }
});
