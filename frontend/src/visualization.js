import * as THREE from "three";
import { PALETTE } from "./config.js";

// ── FARB-CACHE ────────────────────────────────────────────────────────────────

/**
 * Speichert die zugewiesene Farbe pro Klassenbezeichnung.
 * Wird beim Datensatzwechsel zurückgesetzt, damit Farben
 * nicht zwischen verschiedenen Datensätzen vermischt werden.
 */
const labelColorCache = {};
let colorIndex = 0;

/**
 * Setzt den Farb-Cache zurück.
 * Muss bei jedem Datensatzwechsel aufgerufen werden.
 */
export function resetColorCache() {
  Object.keys(labelColorCache).forEach((k) => delete labelColorCache[k]);
  colorIndex = 0;
}

/**
 * Gibt eine stabile THREE.Color für ein gegebenes Klassenlabel zurück.
 * Im Fehlermodus werden feste Farben verwendet:
 *   correct   → grün  (#34d399)
 *   incorrect → rot   (#f87171)
 *
 * @param {string}      label    - Klassenbezeichnung (z.B. "setosa")
 * @param {string|null} errorKey - "correct" | "incorrect" | null
 * @returns {THREE.Color}
 */
export function getColor(label, errorKey = null) {
  if (errorKey === "correct")   return new THREE.Color(0x34d399);
  if (errorKey === "incorrect") return new THREE.Color(0xf87171);

  if (!labelColorCache[label]) {
    labelColorCache[label] = new THREE.Color(
      PALETTE[colorIndex % PALETTE.length]
    );
    colorIndex++;
  }
  return labelColorCache[label];
}

// ── KREIS-TEXTUR ──────────────────────────────────────────────────────────────

/**
 * Erstellt eine kreisförmige Punkttextur als Canvas.
 * Three.js PointsMaterial rendert standardmäßig Quadrate —
 * durch diese Textur werden die Punkte rund und weich.
 * Der radiale Gradient erzeugt einen Anti-Aliasing-Effekt.
 *
 * @returns {THREE.CanvasTexture}
 */
export function createCircleTexture() {
  const size    = 64;
  const canvas  = document.createElement("canvas");
  canvas.width  = size;
  canvas.height = size;
  const ctx     = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0.0, "rgba(255,255,255,1.0)"); // Mitte: voll sichtbar
  gradient.addColorStop(0.6, "rgba(255,255,255,0.8)"); // Rand: leicht transparent
  gradient.addColorStop(1.0, "rgba(255,255,255,0.0)"); // Außen: unsichtbar

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

// ── PUNKTWOLKE AUFBAUEN ───────────────────────────────────────────────────────

/**
 * Erzeugt aus den Sample-Daten eine Three.js-Punktwolke (THREE.Points).
 *
 * Visuelles Encoding:
 * - Farbe    → Klassenzugehörigkeit (abhängig vom Farbmodus)
 * - Größe    → Konfidenz des Modells (höhere Konfidenz = größerer Punkt)
 * - Position → PCA, UMAP oder t-SNE Koordinaten im 3D-Raum
 *
 * Filterbedingungen:
 * - Konfidenz-Schwellwert: Punkte unterhalb werden ausgeblendet
 * - Klassen-Toggle: ausgeblendete Klassen werden nicht gerendert
 *
 * @param {Array}    samples       - Datenpunkte aus der JSON-Datei
 * @param {string}   colorMode     - "predicted" | "true" | "errors"
 * @param {string}   reduction     - "pca" | "umap" | "tsne"
 * @param {number}   confThreshold - Minimale Konfidenz (0–1)
 * @param {Set}      hiddenClasses - Ausgeblendete Klassen
 * @returns {THREE.Points}
 */
export function buildPointCloud(
  samples,
  colorMode     = "predicted",
  reduction     = "pca",
  confThreshold = 0,
  hiddenClasses = new Set()
) {
  // Gefilterte Samples basierend auf Konfidenz und Klassen-Toggle
  const filtered = samples.filter((s) => {
    if (s.confidence < confThreshold)         return false;
    if (hiddenClasses.has(s.predicted_label)) return false;
    if (hiddenClasses.has(s.true_label))      return false;
    return true;
  });

  const n = filtered.length;

  // Typed Arrays für maximale WebGL-Rendering-Performance
  const positions = new Float32Array(n * 3);
  const colors    = new Float32Array(n * 3);
  const sizes     = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    // Position aus dem gewählten Reduktionsverfahren
    let p;
    if      (reduction === "umap") p = filtered[i].position_umap;
    else if (reduction === "tsne") p = filtered[i].position_tsne;
    else                           p = filtered[i].position_pca ?? filtered[i].position;

    positions[i * 3 + 0] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];

    // Farbe je nach Farbmodus zuweisen
    let color;
    if (colorMode === "true") {
      color = getColor(filtered[i].true_label);
    } else if (colorMode === "errors") {
      const key = filtered[i].is_correct ? "correct" : "incorrect";
      color = getColor(key, key);
    } else {
      color = getColor(filtered[i].predicted_label);
    }

    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // Punktgröße proportional zur Modellkonfidenz
    sizes[i] = 0.08 + filtered[i].confidence * 0.10;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
  geometry.setAttribute("size",     new THREE.BufferAttribute(sizes,     1));

  // PointsMaterial mit runder Kreis-Textur und Vertex-Farben
  const material = new THREE.PointsMaterial({
    size:            0.18,
    vertexColors:    true,
    transparent:     true,
    opacity:         1.0,
    sizeAttenuation: true,
    map:             createCircleTexture(),
    alphaTest:       0.5,
    depthWrite:      true,
  });

  // Gefilterte Samples als userData speichern für Raycasting
  const cloud            = new THREE.Points(geometry, material);
  cloud.userData.samples = filtered;
  return cloud;
}

// ── ACHSEN ────────────────────────────────────────────────────────────────────

/**
 * Fügt drei farbige Koordinatenachsen mit Beschriftung zur Szene hinzu.
 * X = rot, Y = grün, Z = blau (Three.js Standard).
 * Die Beschriftung passt sich dem Reduktionsverfahren an:
 *   PCA   → PC1, PC2, PC3
 *   UMAP  → UMAP1, UMAP2, UMAP3
 *   t-SNE → tSNE1, tSNE2, tSNE3
 *
 * @param {THREE.Scene} scene
 * @param {string}      reduction - "pca" | "umap" | "tsne"
 */
export function addAxes(scene, reduction = "pca") {
  // Alte Achsengruppe entfernen falls vorhanden
  const existing = scene.getObjectByName("axesGroup");
  if (existing) scene.remove(existing);

  const group = new THREE.Group();
  group.name  = "axesGroup";

  /**
   * Zeichnet eine Linie zwischen zwei Punkten.
   * @param {number[]} from  - Startpunkt [x,y,z]
   * @param {number[]} to    - Endpunkt [x,y,z]
   * @param {number}   color - Hex-Farbe
   */
  function makeLine(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ]);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  }

  /**
   * Erstellt ein Text-Label als Canvas-Sprite.
   * @param {string}   text     - Anzeigetext
   * @param {number[]} position - Position [x,y,z]
   * @param {string}   color    - CSS-Farbe
   */
  function makeLabel(text, position, color) {
    const canvas  = document.createElement("canvas");
    canvas.width  = 256;
    canvas.height = 64;
    const ctx     = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.font      = "bold 36px system-ui, Arial";
    ctx.fillText(text, 10, 46);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map:         new THREE.CanvasTexture(canvas),
        transparent: true,
      })
    );
    sprite.position.set(...position);
    sprite.scale.set(1.4, 0.35, 1);
    return sprite;
  }

  // Achsenpräfix abhängig vom Reduktionsverfahren
  const prefix = reduction === "umap"
    ? "UMAP"
    : reduction === "tsne"
    ? "tSNE"
    : "PC";

  // X-Achse (rot)
  group.add(makeLine([0,0,0], [5,0,0], 0xff4444));
  group.add(makeLabel(`${prefix}1`, [5.8, 0, 0], "#ff6666"));

  // Y-Achse (grün)
  group.add(makeLine([0,0,0], [0,5,0], 0x44ff44));
  group.add(makeLabel(`${prefix}2`, [0, 5.8, 0], "#66ff66"));

  // Z-Achse (blau)
  group.add(makeLine([0,0,0], [0,0,5], 0x4444ff));
  group.add(makeLabel(`${prefix}3`, [0, 0, 5.8], "#6688ff"));

  scene.add(group);
}

// ── GITTER ────────────────────────────────────────────────────────────────────

/**
 * Fügt ein Gitter in der XZ-Ebene zur Szene hinzu.
 * Dient als visuelle Referenzfläche für die räumliche Tiefe.
 *
 * @param {THREE.Scene} scene
 */
export function addGrid(scene) {
  const grid = new THREE.GridHelper(20, 20, 0x2d3748, 0x2d3748);
  grid.position.y = -7;
  scene.add(grid);
}

// ── LEGENDE ───────────────────────────────────────────────────────────────────

/**
 * Aktualisiert die Legende abhängig vom aktuellen Farbmodus.
 * Sammelt alle sichtbaren Labels, sortiert sie alphabetisch
 * und zeigt sie mit ihrer zugehörigen Farbe an.
 *
 * @param {Array}  samples   - Die aktuell sichtbaren Datenpunkte
 * @param {string} colorMode - "predicted" | "true" | "errors"
 */
export function updateLegend(samples, colorMode) {
  const legendBox = document.getElementById("legend");
  if (!legendBox) return;

  legendBox.innerHTML = `<div class="legend-title">Legende</div>`;

  // Alle vorkommenden Labels sammeln
  const labels = new Set();
  for (const s of samples) {
    if      (colorMode === "true")      labels.add(s.true_label);
    else if (colorMode === "predicted") labels.add(s.predicted_label);
    else if (colorMode === "errors")    labels.add(s.is_correct ? "correct" : "incorrect");
  }

  if (labels.size === 0) {
    legendBox.innerHTML += `<span style="color:#64748b;">Keine Punkte sichtbar</span>`;
    return;
  }

  // Labels alphabetisch sortieren für stabile Darstellung
  for (const label of Array.from(labels).sort()) {
    const color = colorMode === "errors"
      ? getColor(label, label)
      : getColor(label);

    const hex = `rgb(${Math.floor(color.r*255)},${Math.floor(color.g*255)},${Math.floor(color.b*255)})`;

    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `
      <div class="legend-dot" style="background:${hex};"></div>
      <span style="color:#cbd5e1;">${label}</span>
    `;
    legendBox.appendChild(row);
  }

  // Hinweis: Punktgröße = Konfidenz
  const hint = document.createElement("div");
  hint.className   = "legend-hint";
  hint.textContent = "Punktgröße = Konfidenz";
  legendBox.appendChild(hint);
}

// ── KLASSEN-TOGGLE ────────────────────────────────────────────────────────────

/**
 * Befüllt den Klassen-Toggle-Bereich mit Buttons für jede Klasse.
 * Ermöglicht dem Nutzer einzelne Klassen ein- und auszublenden.
 *
 * @param {string[]}    classNames     - Liste aller Klassenbezeichnungen
 * @param {Set<string>} hiddenClasses  - Set der aktuell ausgeblendeten Klassen
 * @param {HTMLElement} container      - Container für die Toggle-Buttons
 * @param {Function}    onToggle       - Callback bei Klassen-Toggle
 */
export function buildClassToggles(classNames, hiddenClasses, container, onToggle) {
  container.innerHTML = "";

  for (const cls of classNames) {
    const color  = getColor(cls);
    const hex    = `rgb(${Math.floor(color.r*255)},${Math.floor(color.g*255)},${Math.floor(color.b*255)})`;
    const active = !hiddenClasses.has(cls);

    const btn = document.createElement("button");
    btn.textContent = cls;
    btn.className   = "class-btn";
    btn.dataset.cls = cls;
    btn.style.background = active ? hex : "rgba(255,255,255,0.05)";
    btn.style.border     = `1px solid ${active ? hex : "rgba(255,255,255,0.1)"}`;
    btn.style.color      = active ? "#0f1117" : "#64748b";

    btn.addEventListener("click", () => {
      if (hiddenClasses.has(cls)) {
        hiddenClasses.delete(cls);
      } else {
        hiddenClasses.add(cls);
      }
      const isActive       = !hiddenClasses.has(cls);
      btn.style.background = isActive ? hex : "rgba(255,255,255,0.05)";
      btn.style.border     = `1px solid ${isActive ? hex : "rgba(255,255,255,0.1)"}`;
      btn.style.color      = isActive ? "#0f1117" : "#64748b";
      onToggle();
    });

    container.appendChild(btn);
  }
}

// ── ANIMIERTER ÜBERGANG ───────────────────────────────────────────────────────

/**
 * Animierter Übergang zwischen zwei Reduktionsverfahren.
 * Die Datenpunkte morphen sanft von ihrer aktuellen Position
 * zur Zielposition des neuen Reduktionsverfahrens.
 * Dauer: 1.5 Sekunden mit Ease-In-Out Interpolation.
 *
 * @param {THREE.Points} cloud         - Aktuelle Punktwolke
 * @param {string}       fromReduction - Ausgangsverfahren "pca"|"umap"|"tsne"
 * @param {string}       toReduction   - Zielverfahren "pca"|"umap"|"tsne"
 */
export function animateTransition(cloud, fromReduction, toReduction) {
  if (!cloud || !cloud.userData.samples?.length) return;

  const samples  = cloud.userData.samples;
  const n        = samples.length;
  const duration = 1500;
  const start    = performance.now();

  const fromPositions = new Float32Array(n * 3);
  const toPositions   = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    let pFrom;
    if      (fromReduction === "umap") pFrom = samples[i].position_umap;
    else if (fromReduction === "tsne") pFrom = samples[i].position_tsne;
    else                               pFrom = samples[i].position_pca ?? samples[i].position;

    fromPositions[i*3+0] = pFrom[0];
    fromPositions[i*3+1] = pFrom[1];
    fromPositions[i*3+2] = pFrom[2];

    let pTo;
    if      (toReduction === "umap") pTo = samples[i].position_umap;
    else if (toReduction === "tsne") pTo = samples[i].position_tsne;
    else                             pTo = samples[i].position_pca ?? samples[i].position;

    toPositions[i*3+0] = pTo[0];
    toPositions[i*3+1] = pTo[1];
    toPositions[i*3+2] = pTo[2];
  }

  const posAttr = cloud.geometry.attributes.position;

  /**
   * Ease-In-Out Interpolation für sanfte Animation.
   * @param {number} t - Fortschritt 0–1
   * @returns {number}
   */
  function easeInOut(t) {
    return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
  }

  function step(now) {
    const elapsed  = now - start;
    const raw      = Math.min(elapsed / duration, 1.0);
    const progress = easeInOut(raw);

    for (let i = 0; i < n; i++) {
      posAttr.array[i*3+0] = fromPositions[i*3+0] + (toPositions[i*3+0] - fromPositions[i*3+0]) * progress;
      posAttr.array[i*3+1] = fromPositions[i*3+1] + (toPositions[i*3+1] - fromPositions[i*3+1]) * progress;
      posAttr.array[i*3+2] = fromPositions[i*3+2] + (toPositions[i*3+2] - fromPositions[i*3+2]) * progress;
    }
    posAttr.needsUpdate = true;

    if (raw < 1.0) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}