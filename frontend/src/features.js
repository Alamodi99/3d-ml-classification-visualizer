import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 1 — GRENZBEREICH-ALARM
// Findet Datenpunkte die nahe an Punkten anderer Klassen liegen.
// Diese Punkte sind für das Modell schwer zu klassifizieren.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Berechnet für jeden Punkt ob er im Grenzbereich liegt.
 * Ein Punkt ist im Grenzbereich wenn sein nächster Nachbar
 * eine andere Klasse hat.
 *
 * @param {Array}  samples   - Datenpunkte
 * @param {string} reduction - "pca" | "umap" | "tsne"
 * @param {number} threshold - Abstand-Schwellwert (Standard: 1.5)
 * @returns {Set<number>} IDs der Grenzpunkte
 */
export function findBorderPoints(samples, reduction, threshold = 1.5) {
  const borderIds = new Set();

  // Position eines Punktes bestimmen
  function getPos(s) {
    if      (reduction === "umap") return s.position_umap ?? s.position;
    else if (reduction === "tsne") return s.position_tsne ?? s.position;
    else                           return s.position_pca  ?? s.position;
  }

  for (let i = 0; i < samples.length; i++) {
    const pi = getPos(samples[i]);

    for (let j = 0; j < samples.length; j++) {
      if (i === j) continue;
      if (samples[i].predicted_label === samples[j].predicted_label) continue;

      const pj = getPos(samples[j]);

      // Euklidische Distanz im 3D-Raum
      const dx = pi[0] - pj[0];
      const dy = pi[1] - pj[1];
      const dz = pi[2] - pj[2];
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < threshold) {
        borderIds.add(samples[i].id);
        break;
      }
    }
  }

  return borderIds;
}

/**
 * Fügt pulsierende 3D-Ringe um Grenzpunkte zur Szene hinzu.
 * Verwendet WireframeGeometry damit andere Punkte nicht verdeckt werden.
 *
 * @param {THREE.Scene} scene
 * @param {Array}       samples   - Alle Datenpunkte
 * @param {Set<number>} borderIds - IDs der Grenzpunkte
 * @param {string}      reduction
 * @returns {THREE.Group}
 */
export function addBorderAlarms(scene, samples, borderIds, reduction) {
  // Alte Grenzbereich-Gruppe entfernen
  const existing = scene.getObjectByName("borderAlarms");
  if (existing) scene.remove(existing);

  const group = new THREE.Group();
  group.name  = "borderAlarms";

  for (const s of samples) {
    if (!borderIds.has(s.id)) continue;

    let p;
    if      (reduction === "umap") p = s.position_umap ?? s.position;
    else if (reduction === "tsne") p = s.position_tsne ?? s.position;
    else                           p = s.position_pca  ?? s.position;

    // Wireframe Kugel — verdeckt keine anderen Punkte
    const sphereGeo  = new THREE.SphereGeometry(0.22, 8, 8);
    const wireGeo    = new THREE.WireframeGeometry(sphereGeo);
    const wireMat    = new THREE.LineBasicMaterial({
      color:       0xff8800,
      transparent: true,
      opacity:     0.7,
    });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    wire.position.set(p[0], p[1], p[2]);
    wire.userData.pulseTime = Math.random() * Math.PI * 2;
    group.add(wire);
  }

  scene.add(group);
  return group;
}

/**
 * Animiert die Grenzbereich-Kugeln (pulsieren + rotieren).
 * Muss im Animationsloop aufgerufen werden.
 *
 * @param {THREE.Group} group - Grenzbereich-Gruppe
 */
export function animateBorderAlarms(group) {
  if (!group) return;

  group.children.forEach((wire) => {
    wire.userData.pulseTime += 0.03;
    const t = wire.userData.pulseTime;

    // Pulsieren — Größe wechselt sanft
    const pulse = 1.0 + Math.sin(t * 2) * 0.15;
    wire.scale.set(pulse, pulse, pulse);

    // Langsam rotieren — sieht elegant aus
    wire.rotation.x += 0.008;
    wire.rotation.y += 0.012;

    // Opacity pulsiert
    wire.material.opacity = 0.4 + Math.abs(Math.sin(t * 2)) * 0.5;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 2 — MODELL-VERTRAUENS-AMPEL
// Bewertet für jeden Datenpunkt ob alle Modelle übereinstimmen.
// Grün = alle einig + hohe Konfidenz
// Gelb = uneinig oder mittlere Konfidenz
// Rot  = Widerspruch oder niedrige Konfidenz
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Berechnet die Ampelfarbe für einen Datenpunkt.
 * Vergleicht die Vorhersagen aller Modelle für diesen Punkt.
 *
 * @param {Object} datasetData - Komplette JSON-Daten mit allen Modellen
 * @param {number} sampleId    - ID des Datenpunkts
 * @returns {"green"|"yellow"|"red"} Ampelfarbe
 */
export function getTrafficLight(datasetData, sampleId) {
  if (!datasetData?.models?.length) return "yellow";

  const predictions = [];
  const confidences = [];

  for (const model of datasetData.models) {
    const sample = model.samples.find(s => s.id === sampleId);
    if (!sample) continue;
    predictions.push(sample.predicted_label);
    confidences.push(sample.confidence);
  }

  if (predictions.length === 0) return "yellow";

  // Alle Modelle einig?
  const allAgree = predictions.every(p => p === predictions[0]);

  // Durchschnittliche Konfidenz
  const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  if (allAgree && avgConf >= 0.8)  return "green";
  if (allAgree && avgConf >= 0.5)  return "yellow";
  if (!allAgree && avgConf >= 0.7) return "yellow";
  return "red";
}

/**
 * Erstellt HTML für die Ampel-Anzeige in der Info-Box.
 *
 * @param {Object} datasetData - Komplette JSON-Daten
 * @param {Object} sample      - Der angeklickte Datenpunkt
 * @returns {string} HTML-String
 */
export function buildTrafficLightHTML(datasetData, sample) {
  if (!datasetData?.models?.length) return "";

  const color = getTrafficLight(datasetData, sample.id);

  const emoji  = color === "green"  ? "🟢" : color === "yellow" ? "🟡" : "🔴";
  const label  = color === "green"  ? "Alle Modelle einig — hohe Konfidenz"
               : color === "yellow" ? "Modelle uneinig oder mittlere Konfidenz"
               : "Modelle widersprechen sich oder niedrige Konfidenz";

  // Vorhersagen aller Modelle sammeln
  let rows = "";
  for (const model of datasetData.models) {
    const s = model.samples.find(s => s.id === sample.id);
    if (!s) continue;
    const confPct = (s.confidence * 100).toFixed(1);
    const check   = s.is_correct ? "✓" : "✗";
    const checkColor = s.is_correct ? "#34d399" : "#f87171";
    rows += `
      <div style="display:flex;justify-content:space-between;font-size:11px;
                  margin:3px 0;color:#94a3b8;">
        <span>${model.model_name.replace(/_/g," ")}</span>
        <span style="color:#e2e8f0;">${s.predicted_label}</span>
        <span>${confPct}%</span>
        <span style="color:${checkColor}">${check}</span>
      </div>
    `;
  }

  return `
    <div style="margin-top:12px;padding-top:12px;
                border-top:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:12px;font-weight:700;color:#a5b4fc;margin-bottom:8px;">
        ${emoji} Modell-Konsens
      </div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;">${label}</div>
      <div style="display:flex;justify-content:space-between;font-size:10px;
                  color:#475569;margin-bottom:4px;">
        <span>Modell</span><span>Vorhersage</span><span>Konf.</span><span>OK?</span>
      </div>
      ${rows}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 3 — PATIENTENRISIKO-NAVIGATOR (Ähnlichkeits-Suche)
// Findet die N ähnlichsten Datenpunkte im 3D-Raum und
// verbindet sie mit leuchtenden Linien.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Findet die N ähnlichsten Datenpunkte im 3D-Raum.
 *
 * @param {Object} target    - Der Referenzpunkt
 * @param {Array}  samples   - Alle Datenpunkte
 * @param {string} reduction
 * @param {number} n         - Anzahl ähnlicher Punkte (Standard: 5)
 * @returns {Array} Die N ähnlichsten Punkte mit Distanz
 */
export function findSimilarPoints(target, samples, reduction, n = 5) {
  function getPos(s) {
    if      (reduction === "umap") return s.position_umap ?? s.position;
    else if (reduction === "tsne") return s.position_tsne ?? s.position;
    else                           return s.position_pca  ?? s.position;
  }

  const targetPos = getPos(target);

  const distances = samples
    .filter(s => s.id !== target.id)
    .map(s => {
      const p  = getPos(s);
      const dx = targetPos[0] - p[0];
      const dy = targetPos[1] - p[1];
      const dz = targetPos[2] - p[2];
      return { sample: s, dist: Math.sqrt(dx*dx + dy*dy + dz*dz) };
    })
    .sort((a, b) => a.dist - b.dist);

  return distances.slice(0, n);
}

/**
 * Zeichnet animierte Linien von einem Punkt zu seinen ähnlichsten Nachbarn.
 *
 * @param {THREE.Scene} scene
 * @param {Object}      target    - Referenzpunkt
 * @param {Array}       similar   - Ähnliche Punkte mit Distanz
 * @param {string}      reduction
 * @returns {THREE.Group}
 */
export function drawSimilarityLines(scene, target, similar, reduction) {
  // Alte Linien entfernen
  const existing = scene.getObjectByName("similarityLines");
  if (existing) scene.remove(existing);

  const group = new THREE.Group();
  group.name  = "similarityLines";

  function getPos(s) {
    if      (reduction === "umap") return s.position_umap ?? s.position;
    else if (reduction === "tsne") return s.position_tsne ?? s.position;
    else                           return s.position_pca  ?? s.position;
  }

  const targetPos = getPos(target);
  const from      = new THREE.Vector3(targetPos[0], targetPos[1], targetPos[2]);

  similar.forEach(({ sample, dist }, idx) => {
    const p  = getPos(sample);
    const to = new THREE.Vector3(p[0], p[1], p[2]);

    // Farbe: grün für gleiche Klasse, orange für andere
    const sameClass = sample.predicted_label === target.predicted_label;
    const color     = sameClass ? 0x34d399 : 0xfb923c;

    // Linie mit abnehmender Deckkraft je nach Rang
    const opacity = 1.0 - (idx / similar.length) * 0.6;

    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      linewidth: 2,
    });

    group.add(new THREE.Line(geo, mat));

    // Kleiner Punkt am Ziel
    const dotGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const dot    = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(to);
    group.add(dot);
  });

  scene.add(group);
  return group;
}

/**
 * Erstellt HTML für die Ähnlichkeits-Anzeige.
 *
 * @param {Array} similar - Ähnliche Punkte mit Distanz
 * @returns {string} HTML-String
 */
export function buildSimilarityHTML(similar) {
  if (!similar?.length) return "";

  let rows = "";
  similar.forEach(({ sample, dist }, idx) => {
    const sameClass  = idx < similar.length;
    const distStr    = dist.toFixed(2);
    const confPct    = (sample.confidence * 100).toFixed(1);
    rows += `
      <div style="display:flex;justify-content:space-between;font-size:11px;
                  margin:3px 0;color:#94a3b8;">
        <span>#${sample.id}</span>
        <span style="color:#e2e8f0;">${sample.predicted_label}</span>
        <span>d=${distStr}</span>
        <span>${confPct}%</span>
      </div>
    `;
  });

  return `
    <div style="margin-top:12px;padding-top:12px;
                border-top:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:12px;font-weight:700;color:#34d399;margin-bottom:8px;">
        🔍 Ähnlichste Punkte
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;
                  color:#475569;margin-bottom:4px;">
        <span>ID</span><span>Klasse</span><span>Abstand</span><span>Konf.</span>
      </div>
      ${rows}
      <div style="font-size:10px;color:#475569;margin-top:6px;">
        🟢 gleiche Klasse &nbsp; 🟠 andere Klasse
      </div>
    </div>
  `;
}