import { MOVEMENT, type MovementConfig } from '../config/movement';
import type { LevelData, Vec3 } from './types';

/** Ein Problem in den Level-Daten; `element` ist der Index in `elements`. */
export interface ValidationIssue {
  element?: number;
  message: string;
}

const isFiniteVec = (v: Vec3): boolean => v.every((n) => Number.isFinite(n));
const isPositiveVec = (v: Vec3): boolean => v.every((n) => Number.isFinite(n) && n > 0);

/**
 * Prüft Level-Daten auf Fehler, die das Spiel kaputt machen würden (fehlendes Ziel, negative
 * Größen, Tunnel ohne Durchkommen …). Rein datenbasiert; Physik-Checks laufen in den Tests.
 */
export function validateLevel(level: LevelData, cfg: MovementConfig = MOVEMENT): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (message: string, element?: number): void => {
    issues.push(element === undefined ? { message } : { element, message });
  };

  if (!/^[a-z0-9-]+$/.test(level.id)) issue(`Ungültige Level-ID „${level.id}“`);
  if (!level.name.trim()) issue('Level ohne Namen');
  if (!isFiniteVec(level.spawn.pos)) issue('Spawn-Position ungültig');
  if (level.spawn.pos[1] <= level.killY) issue('Spawn liegt unterhalb der Absturzhöhe');
  if (level.elements.length === 0) issue('Level ohne Elemente');

  const goals = level.elements.filter((e) => e.type === 'goal').length;
  if (goals !== 1) issue(`Genau ein Ziel erwartet, gefunden: ${goals}`);

  level.elements.forEach((element, index) => {
    switch (element.type) {
      case 'platform':
      case 'wallrun':
        if (!isFiniteVec(element.pos)) issue('Position ungültig', index);
        if (!isPositiveVec(element.size)) issue('Größe muss positiv sein', index);
        break;
      case 'ramp': {
        const [ax, ay, az] = element.from;
        const [bx, by, bz] = element.to;
        const horizontal = Math.hypot(bx - ax, bz - az);
        if (element.width <= 0) issue('Rampenbreite muss positiv sein', index);
        if (horizontal < 0.5) issue('Rampe ist zu steil oder zu kurz', index);
        else if (
          Math.abs(by - ay) / horizontal >
          Math.tan((cfg.player.maxSlopeDeg * Math.PI) / 180)
        ) {
          issue('Rampe ist steiler als der begehbare Hangwinkel', index);
        }
        break;
      }
      case 'slideTunnel':
        if (element.clearance <= cfg.player.crouchHeight + 0.05) {
          issue('Tunnel zu niedrig – auch geduckt kein Durchkommen', index);
        }
        if (element.clearance >= cfg.player.standHeight) {
          issue('Tunnel so hoch, dass man nicht sliden muss', index);
        }
        if (element.length <= 0 || element.width <= cfg.player.radius * 2) {
          issue('Tunnel zu kurz oder zu schmal', index);
        }
        break;
      case 'grapple':
        if (!isFiniteVec(element.pos)) issue('Grapple-Position ungültig', index);
        if (element.range !== undefined && element.range <= 0)
          issue('Reichweite muss positiv sein', index);
        break;
      case 'checkpoint':
        if (element.pos[1] <= level.killY)
          issue('Checkpoint liegt unterhalb der Absturzhöhe', index);
        if (element.size && !isPositiveVec(element.size)) issue('Checkpoint-Größe ungültig', index);
        break;
      case 'killZone':
        if (!isPositiveVec(element.size)) issue('Kill-Zonen-Größe muss positiv sein', index);
        break;
      case 'moving':
        if (element.path.length < 2)
          issue('Bewegliche Plattform braucht mindestens zwei Wegpunkte', index);
        if (!(element.speed > 0)) issue('Geschwindigkeit muss positiv sein', index);
        if (!isPositiveVec(element.size)) issue('Plattformgröße muss positiv sein', index);
        break;
      case 'jumpPad':
        if (!(element.power > 0)) issue('Sprungpad-Stärke muss positiv sein', index);
        break;
      case 'goal':
        if (element.pos[1] <= level.killY) issue('Ziel liegt unterhalb der Absturzhöhe', index);
        break;
      case 'hint':
        if (!element.text.trim()) issue('Hinweis ohne Text', index);
        if (!isPositiveVec(element.size)) issue('Hinweis-Bereich muss positiv sein', index);
        break;
    }
  });
  return issues;
}
