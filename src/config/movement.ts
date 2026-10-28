/**
 * Zentrale Tuning-Werte für das Movement.
 *
 * Einheiten: Meter (m), Sekunden (s), Geschwindigkeit in m/s, Beschleunigung in m/s².
 * Winkel sind in Grad angegeben. Alle Mechaniken lesen ausschließlich aus diesem Objekt –
 * zum Nachjustieren reicht es, hier Werte zu ändern (Hot Reload übernimmt sie im Dev-Server).
 */

export interface PlayerShapeConfig {
  /** Radius der Spielerkapsel. */
  radius: number;
  /** Gesamthöhe stehend. */
  standHeight: number;
  /** Gesamthöhe geduckt / beim Sliden (passt unter niedrige Decken). */
  crouchHeight: number;
  /** Augenhöhe über den Füßen, stehend. */
  eyeHeightStand: number;
  /** Augenhöhe über den Füßen, geduckt / im Slide. */
  eyeHeightCrouch: number;
  /** Abstand, den der Character Controller zu Oberflächen hält. */
  skinWidth: number;
  /** Maximale Stufenhöhe, die automatisch erstiegen wird. */
  stepHeight: number;
  /** Steilster begehbarer Hang. */
  maxSlopeDeg: number;
  /** Bis zu diesem Abstand wird der Spieler am Boden „festgeklebt“ (bergab laufen). */
  snapDistance: number;
  /** Stabilisierung des Character Controllers an Ecken (siehe Rapier normalNudgeFactor). */
  normalNudge: number;
  /** Kleine Abwärtsgeschwindigkeit am Boden, damit der Bodenkontakt nicht abreißt. */
  groundStickSpeed: number;
}

export interface GroundConfig {
  /** Laufgeschwindigkeit – das Spiel kennt nur Sprint, kein Gehen. */
  runSpeed: number;
  /** Beschleunigung bis runSpeed (70 → in ~0,13 s auf Tempo). */
  acceleration: number;
  /** Abbremsen ohne Eingabe. */
  deceleration: number;
  /** Wie schnell Überschuss-Tempo (z. B. nach Slide-Jump) am Boden abgebaut wird. */
  overspeedDeceleration: number;
  /** Lenkrate (1/s), mit der Überschuss-Tempo der Eingaberichtung folgt. */
  overspeedSteer: number;
  /** Geschwindigkeit geduckt. */
  crouchSpeed: number;
  /** Schrittlänge für Head-Bob und Schrittgeräusche. */
  stepLength: number;
}

export interface AirConfig {
  /** Beschleunigung durch Eingabe in der Luft (reduziert gegenüber dem Boden). */
  acceleration: number;
  /** Bis zu diesem Tempo kann die Eingabe in Blickrichtung beschleunigen. */
  inputSpeed: number;
  /** Proportionaler Luftwiderstand (1/s); 0 = Schwung bleibt voll erhalten. */
  drag: number;
  /** Faktor auf die Gravitation beim Fallen – > 1 macht Sprungkurven knackiger. */
  fallGravityMultiplier: number;
}

export interface JumpConfig {
  /** Sprunghöhe bei voll gehaltener Taste. */
  height: number;
  /** Faktor auf die Aufwärtsgeschwindigkeit beim frühen Loslassen (variable Sprunghöhe). */
  cutMultiplier: number;
  /** Zeit nach dem Verlassen einer Kante, in der noch gesprungen werden darf. */
  coyoteTime: number;
  /** So lange vor der Landung wird ein Sprung-Tastendruck gemerkt. */
  bufferTime: number;
  /** Anteil der Plattformgeschwindigkeit, der beim Absprung übernommen wird. */
  platformInherit: number;
}

export interface SlideConfig {
  /** Mindesttempo, damit die Slide-Taste einen Slide statt Ducken auslöst. */
  minStartSpeed: number;
  /** Tempo-Boost beim Start des Slides. */
  boost: number;
  /** Bis zu diesem Tempo wirkt der Boost (schnellere Slides bekommen keinen Boost). */
  boostMaxSpeed: number;
  /** Mindestabstand zwischen zwei Boosts – verhindert endloses Slide-Spammen. */
  boostCooldown: number;
  /** Reibung auf ebenem Boden. */
  friction: number;
  /** Faktor auf die Hangabtriebskraft (g·sinθ·cosθ): bergab schneller, bergauf langsamer. */
  slopeAcceleration: number;
  /** Wie schnell sich die Slide-Richtung per Eingabe lenken lässt (rad/s). */
  steerRate: number;
  /** Unter diesem Tempo endet der Slide. */
  minSpeed: number;
  maxSpeed: number;
  /** Mindestdauer, bevor Loslassen der Taste den Slide beendet. */
  minDuration: number;
  /** Faktor auf die Sprunghöhe beim Slide-Jump. */
  jumpHeightMultiplier: number;
  /** Faktor auf das horizontale Tempo beim Slide-Jump (1 = Schwung bleibt voll erhalten). */
  jumpSpeedMultiplier: number;
}

export interface WallRunConfig {
  /** Horizontales Mindesttempo für den Start. */
  minSpeed: number;
  /** Mindesttempo entlang der Wand (wer frontal gegen die Wand springt, läuft nicht). */
  minAlongSpeed: number;
  /** Mindestabstand zum Boden, damit kein Wall Run in Kniehöhe startet. */
  minHeight: number;
  /** Erkennungsweite für Wände über den Kapselradius hinaus. */
  detectDistance: number;
  /** Wer schneller fällt, kann keinen Wall Run mehr starten. */
  maxEntryFallSpeed: number;
  /** Aufwärtstempo beim Start wird hierauf begrenzt (kleiner „Hüpfer“ an der Wand). */
  entryUpSpeedMax: number;
  /** Fallen beim Start wird auf dieses Tempo abgefangen. */
  entryDownSpeedMax: number;
  /** Anteil des Gesamttempos, der beim Andocken in Laufrichtung umgelenkt wird. */
  entrySpeedKeep: number;
  /** Zieltempo entlang der Wand. */
  speed: number;
  acceleration: number;
  /** Abbremsen ohne Vorwärts-Eingabe. */
  friction: number;
  /** Maximale Dauer eines Wall Runs. */
  duration: number;
  /** Gravitationsfaktor am Anfang und am Ende des Wall Runs (steigt dazwischen an). */
  gravityStart: number;
  gravityEnd: number;
  /** Exponent der Gravitationskurve (> 1: lange fast schwerelos, dann zunehmend). */
  gravityCurve: number;
  /** Maximale Fallgeschwindigkeit an der Wand. */
  maxFallSpeed: number;
  /** Leichter Zug zur Wand, damit der Kontakt nicht abreißt. */
  stickSpeed: number;
  /** Abstoß von der Wand, wenn der Wall Run regulär endet. */
  exitPush: number;
  /** Nach dem Ablösen bleibt so lange ein Wall Jump von dieser Wand möglich. */
  wallJumpGrace: number;
}

export interface WallJumpConfig {
  /** Aufwärtstempo des Wall Jumps. */
  upSpeed: number;
  /** Abstoß entlang der Wandnormalen. */
  outSpeed: number;
  /** Zusätzlicher Schub in Blickrichtung (ohne Anteil in die Wand hinein). */
  lookBoost: number;
  /** Anteil des Tempos entlang der Wand, der erhalten bleibt. */
  keepAlong: number;
  /** Maximaler Tempogewinn pro Wall Jump – verhindert endloses Aufschaukeln. */
  maxSpeedGain: number;
  /** Reichweite für Wall Jumps ohne vorherigen Wall Run (über den Kapselradius hinaus). */
  reach: number;
}

export interface GrappleConfig {
  /** Maximale Reichweite zum Grapple-Punkt. */
  range: number;
  /** Näher als das wird ein Punkt ignoriert. */
  minDistance: number;
  /** Zielkegel um die Blickrichtung (halber Öffnungswinkel in Grad). */
  aimConeDeg: number;
  /** Fluggeschwindigkeit des Hakens (Zeit bis zum Einrasten = Distanz / Tempo). */
  hookSpeed: number;
  /** Ein zu früher Tastendruck wird so lange gemerkt, bis ein Ziel erfasst ist. */
  bufferTime: number;
  /** Abklingzeit nach dem Lösen. */
  cooldown: number;

  /** Pull: Beschleunigung zum Punkt. */
  pullAcceleration: number;
  pullMaxSpeed: number;
  /** Pull: Restgravitation während des Ziehens. */
  pullGravityScale: number;
  /** Pull: Dämpfung quer zur Zugrichtung (1/s) – macht den Zug zielgenau. */
  pullPerpDamping: number;
  /** Pull: Ab diesem Abstand löst sich das Seil automatisch. */
  pullDetachDistance: number;
  /** Pull: Aufwärtstempo beim automatischen Lösen (hilft über Kanten). */
  pullEndUpBoost: number;
  /** Pull: Anteil des Tempos, der beim Ankommen erhalten bleibt (kein wildes Überschießen). */
  pullArriveKeep: number;
  pullMaxDuration: number;

  /** Swing: Seillänge beim Einrasten = Abstand × Faktor (< 1 sorgt für einen Ruck). */
  swingRopeShorten: number;
  swingMinLength: number;
  /** Swing: Längeres Seil wird auf diese Länge eingeholt (flacherer, besser steuerbarer Bogen). */
  swingMaxLength: number;
  /** Swing: Gravitationsfaktor am Seil (< 1 = etwas mehr Schwung und Höhe). */
  swingGravityScale: number;
  /** Swing: So schnell wird das Seil nach dem Einrasten auf Ziellänge eingeholt (m/s). */
  swingReelSpeed: number;
  /** Swing: Beschleunigung durch WASD („Pumpen“). */
  swingPumpAcceleration: number;
  /** Swing: Luftwiderstand (1/s). */
  swingDrag: number;
  swingMaxSpeed: number;
  /** Swing: Zusätzliches Aufwärtstempo beim Loslassen in der Aufwärtsbewegung. */
  swingReleaseUpBoost: number;

  /** Sprung während des Grapples: Seil lösen und mindestens so schnell nach oben. */
  jumpReleaseUpSpeed: number;
}

export interface MovementConfig {
  /** Feste Physik-Taktrate. */
  physicsHz: number;
  gravity: number;
  maxFallSpeed: number;
  player: PlayerShapeConfig;
  ground: GroundConfig;
  air: AirConfig;
  jump: JumpConfig;
  slide: SlideConfig;
  wallRun: WallRunConfig;
  wallJump: WallJumpConfig;
  grapple: GrappleConfig;
}

export const MOVEMENT: MovementConfig = {
  physicsHz: 60,
  gravity: 26,
  maxFallSpeed: 55,

  player: {
    radius: 0.35,
    standHeight: 1.8,
    crouchHeight: 1.0,
    eyeHeightStand: 1.62,
    eyeHeightCrouch: 0.82,
    skinWidth: 0.02,
    stepHeight: 0.35,
    maxSlopeDeg: 50,
    snapDistance: 0.3,
    normalNudge: 0.01,
    groundStickSpeed: 1.5,
  },

  ground: {
    runSpeed: 9,
    acceleration: 70,
    deceleration: 60,
    overspeedDeceleration: 9,
    overspeedSteer: 7,
    crouchSpeed: 4,
    stepLength: 2.3,
  },

  air: {
    acceleration: 16,
    inputSpeed: 9,
    drag: 0,
    fallGravityMultiplier: 1.12,
  },

  jump: {
    height: 1.45,
    cutMultiplier: 0.5,
    coyoteTime: 0.1,
    bufferTime: 0.1,
    platformInherit: 1,
  },

  slide: {
    minStartSpeed: 6.5,
    boost: 3.5,
    boostMaxSpeed: 13,
    boostCooldown: 1.0,
    friction: 4,
    slopeAcceleration: 1.1,
    steerRate: 1.6,
    minSpeed: 3,
    maxSpeed: 32,
    minDuration: 0.3,
    jumpHeightMultiplier: 1,
    jumpSpeedMultiplier: 1.03,
  },

  wallRun: {
    minSpeed: 5,
    minAlongSpeed: 4,
    minHeight: 0.5,
    detectDistance: 0.45,
    maxEntryFallSpeed: 16,
    entryUpSpeedMax: 2.5,
    entryDownSpeedMax: 1,
    entrySpeedKeep: 0.85,
    speed: 11,
    acceleration: 18,
    friction: 4,
    duration: 1.5,
    gravityStart: 0.05,
    gravityEnd: 0.55,
    gravityCurve: 2,
    maxFallSpeed: 6,
    stickSpeed: 1.5,
    exitPush: 2.5,
    wallJumpGrace: 0.2,
  },

  wallJump: {
    upSpeed: 7.5,
    outSpeed: 6.5,
    lookBoost: 3,
    keepAlong: 0.95,
    maxSpeedGain: 1.5,
    reach: 0.6,
  },

  grapple: {
    range: 36,
    minDistance: 2.5,
    aimConeDeg: 11,
    hookSpeed: 220,
    bufferTime: 0.15,
    cooldown: 0.35,

    pullAcceleration: 75,
    pullMaxSpeed: 26,
    pullGravityScale: 0.25,
    pullPerpDamping: 5,
    pullDetachDistance: 2.2,
    pullEndUpBoost: 5,
    pullArriveKeep: 0.55,
    pullMaxDuration: 2.5,

    swingRopeShorten: 0.92,
    swingMinLength: 4,
    swingMaxLength: 11,
    swingGravityScale: 0.8,
    swingReelSpeed: 12,
    swingPumpAcceleration: 9,
    swingDrag: 0.05,
    swingMaxSpeed: 32,
    swingReleaseUpBoost: 3,

    jumpReleaseUpSpeed: 6.5,
  },
};

/** Abfluggeschwindigkeit, die genau die konfigurierte Sprunghöhe erreicht: v = √(2·g·h). */
export function jumpVelocity(cfg: Pick<MovementConfig, 'gravity'>, height: number): number {
  return Math.sqrt(2 * cfg.gravity * height);
}
