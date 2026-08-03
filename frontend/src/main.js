import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ── EIGENE MODULE ─────────────────────────────────────────────────────────────
import { DATASETS }                                from "./config.js";
import {
  resetColorCache,
  buildPointCloud,
  addAxes,
  addGrid,
  updateLegend,
  buildClassToggles,
  animateTransition,
}                                                  from "./visualization.js";
import {
  showLoading, hideLoading,
  buildPanel,
  fillModelSelect,
  updateMetrics,
  updatePointCount,
  showPointDetails,
  resetInfoBox,
  showTooltip,
  hideTooltip,
  initCSVUpload,
}                                                  from "./ui.js";
import { createCompareView }                       from "./compare.js";
import {
  findBorderPoints,
  addBorderAlarms,
  animateBorderAlarms,
  getTrafficLight,
  buildTrafficLightHTML,
  findSimilarPoints,
  drawSimilarityLines,
  buildSimilarityHTML,
}                                                  from "./features.js";

// ── HAUPTPROGRAMM ─────────────────────────────────────────────────────────────

/**
 * Einstiegspunkt der Anwendung.
 * Initialisiert Three.js, baut die UI auf und startet den Animationsloop.
 */
async function main() {

  // ── THREE.JS SZENE ──────────────────────────────────────────────────────────

  // Szene initialisieren
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1117);

  // Perspektivkamera — simuliert menschliches Sehen mit Tiefenperspektive
  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    2000
  );
  camera.position.set(0, 0, 10);

  // WebGL-Renderer mit Anti-Aliasing für scharfe Punktdarstellung
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.style.margin = "0";
  document.body.appendChild(renderer.domElement);

  // OrbitControls: Drehen, Zoomen, Verschieben per Maus
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping   = true;  // Sanftes Abbremsen der Kamerabewegung
  controls.dampingFactor   = 0.05;
  controls.enableZoom      = true;
  controls.autoRotate      = false; // Wird per Checkbox gesteuert
  controls.autoRotateSpeed = 1.5;

  // Umgebungslicht für gleichmäßige Ausleuchtung der Szene
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  // Koordinatenachsen und Gitter zur räumlichen Orientierung
  addAxes(scene, "pca");
  addGrid(scene);

  // ── UI AUFBAUEN ─────────────────────────────────────────────────────────────

  // Alle Bedienelemente ins Panel einfügen
  const {
    dsSelect,
    mSelect,
    redSelect,
    colorModeSelect,
    confSlider,
    errOnly,
    autoRotate,
    resetBtn,
    screenshotBtn,
    compareBtn,
    searchInput,
    searchBtn,
    classToggleRow,
  } = buildPanel();

  // ── ANWENDUNGSZUSTAND ───────────────────────────────────────────────────────

  let datasetData      = null;      // Geladene JSON-Daten des aktuellen Datensatzes
  let currentCloud     = null;      // Aktuell angezeigte THREE.Points Punktwolke
  let visibleSamples   = [];        // Datenpunkte nach Fehlerfilter
  let hiddenClasses    = new Set(); // Aktuell ausgeblendete Klassen
  let highlightedSphere = null;     // Hervorgehobener Punkt bei ID-Suche
  let csvDataCache     = null;      // Gespeicherte CSV-Daten für Zurück-Navigation
  let borderGroup      = null;      // Grenzbereich-Alarm Ringe
  let borderActive     = false;     // Grenzbereich-Alarm aktiv?
  let similarityGroup  = null;      // Ähnlichkeits-Linien
  let lastClickedSample = null;     // Zuletzt angeklickter Datenpunkt

  // Raycaster für präzise Maus-Interaktion mit 3D-Punkten
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.15;
  const mouse = new THREE.Vector2();

  // ── CLOUD AUFBAUEN ──────────────────────────────────────────────────────────

  /**
   * Baut die Punktwolke vollständig neu auf.
   * Berücksichtigt alle aktiven Filter und aktualisiert UI-Elemente.
   */
  function rebuildCloud() {
    if (!datasetData) return;

    const modelObj = datasetData.models.find(
      (m) => m.model_name === mSelect.value
    );
    if (!modelObj) return;

    // Metriken und Fehlerfilter anwenden
    updateMetrics(modelObj.metrics);

    visibleSamples = errOnly.checked
      ? modelObj.samples.filter((s) => !s.is_correct)
      : modelObj.samples;

    const confThreshold = parseInt(confSlider.value) / 100;

    // Alte Punktwolke entfernen und GPU-Speicher freigeben
    if (currentCloud) {
      scene.remove(currentCloud);
      currentCloud.geometry.dispose();
      currentCloud.material.dispose();
      currentCloud = null;
    }

    // Neue Punktwolke aufbauen
    currentCloud = buildPointCloud(
      visibleSamples,
      colorModeSelect.value,
      redSelect.value,
      confThreshold,
      hiddenClasses
    );
    scene.add(currentCloud);

    // Achsenbeschriftung aktualisieren
    addAxes(scene, redSelect.value);

    // Legende und Punktanzahl aktualisieren
    updateLegend(currentCloud.userData.samples, colorModeSelect.value);
    updatePointCount(
      currentCloud.userData.samples.length,
      modelObj.samples.length
    );
  }

  // ── DATENSATZ LADEN ─────────────────────────────────────────────────────────

  /**
   * Lädt einen Datensatz per Fetch und aktualisiert die gesamte UI.
   * Setzt Farb-Cache, Kamera und Filter zurück.
   *
   * @param {string} key - Datensatz-Schlüssel (z. B. "iris")
   */
  async function loadDataset(key) {
    showLoading();
    resetColorCache();
    hiddenClasses.clear();

    // Kamera auf Standardposition zurücksetzen
    camera.position.set(0, 0, 10);
    controls.target.set(0, 0, 0);
    controls.update();

    try {
      const ds    = DATASETS.find((d) => d.key === key);
      datasetData = await fetchJSON(ds.file);
      fillModelSelect(mSelect, datasetData.models);

      // Klassen-Toggle aufbauen
      const classNames = datasetData.class_names ?? [];
      buildClassToggles(classNames, hiddenClasses, classToggleRow, () => rebuildCloud());

      rebuildCloud();
    } finally {
      hideLoading();
    }
  }

  /**
   * Lädt eine JSON-Datei aus dem public-Verzeichnis.
   * @param {string} path - Relativer Pfad zur JSON-Datei
   * @returns {Promise<Object>}
   */
  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`JSON nicht gefunden: ${path}`);
    return res.json();
  }

  // ── CSV-UPLOAD ──────────────────────────────────────────────────────────────

  /**
   * Initialisiert den CSV-Upload-Dialog.
   * Nach erfolgreichem Upload wird der neue Datensatz visualisiert.
   */
  initCSVUpload((csvData) => {
    resetColorCache();
    hiddenClasses.clear();
    csvDataCache = csvData;
    datasetData  = csvData;

    camera.position.set(0, 0, 10);
    controls.target.set(0, 0, 0);
    controls.update();

    fillModelSelect(mSelect, csvData.models);
    buildClassToggles(
      csvData.class_names ?? [],
      hiddenClasses,
      classToggleRow,
      () => rebuildCloud()
    );

    // CSV als Option im Datensatz-Dropdown hinzufügen
    const existing = Array.from(dsSelect.options).find(o => o.value === "__csv__");
    if (!existing) {
      const opt       = document.createElement("option");
      opt.value       = "__csv__";
      opt.textContent = `📂 ${csvData.dataset}`;
      dsSelect.appendChild(opt);
    } else {
      existing.textContent = `📂 ${csvData.dataset}`;
    }
    dsSelect.value = "__csv__";

    rebuildCloud();
  });

  // ── HIGHLIGHT (ID-SUCHE) ────────────────────────────────────────────────────

  /**
   * Hebt einen Datenpunkt visuell hervor (permanentes Blinken).
   * Wird bei der ID-Suche verwendet.
   *
   * @param {Object} s         - Sample-Objekt mit Position
   * @param {string} reduction - Aktuelles Reduktionsverfahren
   */
  function highlightPoint(s, reduction) {
    // Alten Highlight entfernen
    if (highlightedSphere) {
      scene.remove(highlightedSphere);
      highlightedSphere = null;
    }

    // Position bestimmen
    let p;
    if      (reduction === "umap") p = s.position_umap;
    else if (reduction === "tsne") p = s.position_tsne;
    else                           p = s.position_pca ?? s.position;

    const pos   = new THREE.Vector3(p[0], p[1], p[2]);
    const group = new THREE.Group();
    group.position.copy(pos);

    // Kern-Kugel — blinkt zwischen Cyan und Weiß
    const coreMat = new THREE.MeshBasicMaterial({
      color:       0x00ffff,
      transparent: false,
    });
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 32, 32),
      coreMat
    ));

    // Blitz-Ring — kurzer Flash-Effekt
    const ringMat = new THREE.MeshBasicMaterial({
      color:       0xffffff,
      transparent: true,
      opacity:     0.0,
      side:        THREE.BackSide,
    });
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 32),
      ringMat
    ));

    group.userData.pulse     = true;
    group.userData.pulseTime = 0;
    group.userData.coreMat   = coreMat;
    group.userData.ringMat   = ringMat;

    scene.add(group);
    highlightedSphere = group;

    // Kamera sanft zum Punkt bewegen
    controls.target.lerp(pos, 0.5);
    controls.update();
  }

  /**
   * Entfernt den aktuellen Highlight-Punkt aus der Szene.
   */
  function clearHighlight() {
    if (highlightedSphere) {
      scene.remove(highlightedSphere);
      highlightedSphere = null;
    }
  }

  // ── IRIS BEIM START LADEN ───────────────────────────────────────────────────
  await loadDataset("iris");
  redSelect.dataset.prev = "pca";

  // ── EVENT LISTENER ──────────────────────────────────────────────────────────

  // Datensatzwechsel
  dsSelect.addEventListener("change", () => {
    if (dsSelect.value === "__csv__") {
      if (!csvDataCache) return;
      resetColorCache();
      hiddenClasses.clear();
      camera.position.set(0, 0, 10);
      controls.target.set(0, 0, 0);
      controls.update();
      datasetData = csvDataCache;
      fillModelSelect(mSelect, csvDataCache.models);
      buildClassToggles(
        csvDataCache.class_names ?? [],
        hiddenClasses,
        classToggleRow,
        () => rebuildCloud()
      );
      rebuildCloud();
      return;
    }
    loadDataset(dsSelect.value);
  });

  // Modellwechsel
  mSelect.addEventListener("change", () => rebuildCloud());

  // Reduktionswechsel mit animiertem Übergang
  redSelect.addEventListener("change", () => {
    const prev = redSelect.dataset.prev ?? "pca";
    const next = redSelect.value;
    redSelect.dataset.prev = next;

    addAxes(scene, next);

    if (currentCloud && currentCloud.userData.samples?.length) {
      animateTransition(currentCloud, prev, next);
    } else {
      rebuildCloud();
    }
  });

  // Farbmodus, Fehlerfilter, Konfidenz
  colorModeSelect.addEventListener("change", () => rebuildCloud());
  errOnly.addEventListener("change",         () => rebuildCloud());
  confSlider.addEventListener("input",       () => rebuildCloud());

  // Autorotation
  autoRotate.addEventListener("change", () => {
    controls.autoRotate = autoRotate.checked;
  });

  // Reset — Kamera und alle Filter zurücksetzen
  resetBtn.addEventListener("click", () => {
    camera.position.set(0, 0, 10);
    controls.target.set(0, 0, 0);
    controls.update();
    errOnly.checked  = false;
    confSlider.value = "0";
    confSlider.dispatchEvent(new Event("input"));
    hiddenClasses.clear();
    buildClassToggles(
      datasetData?.class_names ?? [],
      hiddenClasses,
      classToggleRow,
      () => rebuildCloud()
    );
    rebuildCloud();
  });

  // ── FEATURE BUTTONS ─────────────────────────────────────────────────────────

  // Button-Leiste unten in der Mitte
  const featureBar = document.createElement("div");
  featureBar.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    z-index: 999;
  `;
  document.body.appendChild(featureBar);

  function makeFeatureBtn(label, color, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      background: rgba(15,17,23,0.92);
      color: ${color};
      border: 1.5px solid ${color};
      border-radius: 20px;
      padding: 8px 16px;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      backdrop-filter: blur(8px);
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = color;
      btn.style.color = "#0f1117";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(15,17,23,0.92)";
      btn.style.color = color;
    });
    btn.addEventListener("click", onClick);
    featureBar.appendChild(btn);
    return btn;
  }

  // 🔴 FEATURE 1 — Grenzbereich-Alarm
  const borderBtn = makeFeatureBtn("⚠️ Grenzbereich-Alarm", "#ff8800", () => {
    if (!currentCloud || !visibleSamples.length) return;

    borderActive = !borderActive;
    borderBtn.textContent = borderActive
      ? "⚠️ Alarm ausschalten"
      : "⚠️ Grenzbereich-Alarm";

    if (!borderActive) {
      const ex = scene.getObjectByName("borderAlarms");
      if (ex) scene.remove(ex);
      borderGroup = null;
      return;
    }

    // Max 300 Punkte für Performance
    const subset    = visibleSamples.slice(0, 300);
    const borderIds = findBorderPoints(subset, redSelect.value, 1.5);
    borderGroup     = addBorderAlarms(scene, subset, borderIds, redSelect.value);

    // Kurze Status-Meldung
    const toast = document.createElement("div");
    toast.style.cssText = `
      position:fixed; top:80px; left:50%; transform:translateX(-50%);
      background:rgba(255,136,0,0.15); border:1px solid #ff8800;
      border-radius:10px; padding:10px 20px; color:#ff8800;
      font-family:system-ui; font-size:13px; font-weight:600;
      z-index:9999; pointer-events:none;
    `;
    toast.textContent = `⚠️ ${borderIds.size} Grenzpunkte gefunden — bitte manuell prüfen`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  });

  // 🚦 FEATURE 2 — Modell-Vertrauens-Ampel
  makeFeatureBtn("🚦 Modell-Ampel", "#a5b4fc", () => {
    if (!datasetData || !currentCloud?.userData?.samples?.length) return;

    const samples = currentCloud.userData.samples;
    let green = 0, yellow = 0, red = 0;

    samples.forEach(s => {
      const c = getTrafficLight(datasetData, s.id);
      if (c === "green")  green++;
      if (c === "yellow") yellow++;
      if (c === "red")    red++;
    });

    const total = samples.length;
    const pct   = v => ((v / total) * 100).toFixed(1);

    const panel = document.createElement("div");
    panel.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:rgba(15,17,23,0.97); border:1px solid rgba(165,180,252,0.3);
      border-radius:16px; padding:28px; min-width:320px;
      font-family:system-ui,sans-serif; z-index:9999; color:#e2e8f0;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    panel.innerHTML = `
      <div style="font-size:16px;font-weight:700;margin-bottom:20px;color:#a5b4fc;">
        🚦 Modell-Konsens Übersicht
      </div>
      <div style="margin:10px 0;display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">🟢</span>
        <div style="flex:1;">
          <div style="font-size:13px;color:#34d399;">Alle einig + hohe Konfidenz</div>
          <div style="font-size:12px;color:#64748b;">${green} Punkte (${pct(green)}%)</div>
          <div style="background:#1e2130;border-radius:4px;height:6px;margin-top:4px;">
            <div style="background:#34d399;width:${pct(green)}%;height:100%;border-radius:4px;"></div>
          </div>
        </div>
      </div>
      <div style="margin:10px 0;display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">🟡</span>
        <div style="flex:1;">
          <div style="font-size:13px;color:#fbbf24;">Uneinig oder mittlere Konfidenz</div>
          <div style="font-size:12px;color:#64748b;">${yellow} Punkte (${pct(yellow)}%)</div>
          <div style="background:#1e2130;border-radius:4px;height:6px;margin-top:4px;">
            <div style="background:#fbbf24;width:${pct(yellow)}%;height:100%;border-radius:4px;"></div>
          </div>
        </div>
      </div>
      <div style="margin:10px 0;display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">🔴</span>
        <div style="flex:1;">
          <div style="font-size:13px;color:#f87171;">Widerspruch oder niedrige Konfidenz</div>
          <div style="font-size:12px;color:#64748b;">${red} Punkte (${pct(red)}%)</div>
          <div style="background:#1e2130;border-radius:4px;height:6px;margin-top:4px;">
            <div style="background:#f87171;width:${pct(red)}%;height:100%;border-radius:4px;"></div>
          </div>
        </div>
      </div>
      <div style="font-size:11px;color:#475569;margin-top:16px;padding-top:12px;
                  border-top:1px solid rgba(255,255,255,0.1);">
        💡 Klicke auf einen Datenpunkt um dessen Ampel-Details zu sehen
      </div>
      <button onclick="this.parentNode.remove()" style="
        margin-top:16px;background:#1e2130;color:#94a3b8;
        border:1px solid rgba(255,255,255,0.1);border-radius:8px;
        padding:10px 16px;cursor:pointer;width:100%;font-size:13px;
      ">Schließen</button>
    `;
    document.body.appendChild(panel);
  });

  // 🔍 FEATURE 3 — Ähnlichste Punkte (Patientenrisiko-Navigator)
  makeFeatureBtn("🔍 Ähnlichste Punkte", "#34d399", () => {
    if (!lastClickedSample) {
      const toast = document.createElement("div");
      toast.style.cssText = `
        position:fixed; top:80px; left:50%; transform:translateX(-50%);
        background:rgba(52,211,153,0.15); border:1px solid #34d399;
        border-radius:10px; padding:10px 20px; color:#34d399;
        font-family:system-ui; font-size:13px; z-index:9999;
        pointer-events:none;
      `;
      toast.textContent = "💡 Bitte zuerst einen Datenpunkt anklicken!";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      return;
    }

    // Alte Linien entfernen
    const ex = scene.getObjectByName("similarityLines");
    if (ex) scene.remove(ex);

    const similar = findSimilarPoints(
      lastClickedSample,
      currentCloud.userData.samples,
      redSelect.value,
      5
    );

    similarityGroup = drawSimilarityLines(
      scene,
      lastClickedSample,
      similar,
      redSelect.value
    );

    // Ähnlichkeits-Info zur Info-Box hinzufügen
    const infoBox = document.getElementById("info-box");
    if (infoBox) {
      // Alte Ähnlichkeits-Info entfernen
      const oldSim = infoBox.querySelector(".similarity-info");
      if (oldSim) oldSim.remove();

      const simDiv = document.createElement("div");
      simDiv.className = "similarity-info";
      simDiv.innerHTML = buildSimilarityHTML(similar);
      infoBox.appendChild(simDiv);
    }
  });

  // Screenshot
  screenshotBtn.addEventListener("click", () => {
    renderer.render(scene, camera);
    const link    = document.createElement("a");
    link.download = `klassifikation_${dsSelect.value}_${redSelect.value}.png`;
    link.href     = renderer.domElement.toDataURL("image/png");
    link.click();
  });

  // Modellvergleich öffnen
  compareBtn.addEventListener("click", () => {
    if (!datasetData) {
      alert("Bitte zuerst einen Datensatz laden.");
      return;
    }
    createCompareView(
      datasetData,
      redSelect.value,
      colorModeSelect.value,
      parseInt(confSlider.value) / 100,
      hiddenClasses
    );
  });

  // ID-Suche
  searchBtn.addEventListener("click", () => {
    const id     = parseInt(searchInput.value);
    const samples = currentCloud?.userData?.samples ?? [];
    const sample  = samples.find((s) => s.id === id);

    if (!sample) {
      clearHighlight();
      resetInfoBox();
      return;
    }

    highlightPoint(sample, redSelect.value);
    showPointDetails(
      sample,
      datasetData.dataset,
      mSelect.value,
      redSelect.value
    );
  });

  // Enter-Taste in Suchfeld
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchBtn.click();
  });

  // ── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────────

  /**
   * Keyboard Shortcuts:
   * R     → Reset (Kamera + Filter)
   * Space → Autorotation ein/aus
   * ↑/↓   → Zoom
   */
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;

    if (e.key === "r" || e.key === "R") resetBtn.click();

    if (e.key === " ") {
      e.preventDefault();
      autoRotate.checked  = !autoRotate.checked;
      controls.autoRotate = autoRotate.checked;
    }

    if (e.key === "ArrowUp")   camera.position.z -= 0.5;
    if (e.key === "ArrowDown") camera.position.z += 0.5;
  });

  // ── HOVER-TOOLTIP ───────────────────────────────────────────────────────────

  /**
   * Zeigt beim Hover über einem Punkt einen Tooltip mit Kurzinformation.
   * Nutzt THREE.Raycaster um den nächsten Punkt zu finden.
   */
  renderer.domElement.addEventListener("mousemove", (event) => {
    if (!currentCloud || !currentCloud.userData.samples?.length) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(currentCloud);

    if (hits.length > 0) {
      const s = currentCloud.userData.samples[hits[0].index];
      showTooltip(s, event.clientX, event.clientY);
      renderer.domElement.style.cursor = "pointer";
    } else {
      hideTooltip();
      renderer.domElement.style.cursor = "default";
    }
  });

  renderer.domElement.addEventListener("mouseleave", () => hideTooltip());

  // ── KLICK-INTERAKTION ───────────────────────────────────────────────────────

  /**
   * Zeigt bei Klick auf einen Punkt dessen vollständige Details.
   */
  renderer.domElement.addEventListener("click", (event) => {
    if (!currentCloud || !currentCloud.userData.samples?.length) return;
    clearHighlight();

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(currentCloud);

    if (hits.length === 0) {
      resetInfoBox();
      return;
    }

    const sample = currentCloud.userData.samples[hits[0].index];
    lastClickedSample = sample;

    showPointDetails(
      sample,
      datasetData.dataset,
      mSelect.value,
      redSelect.value
    );

    // Ampel-Details zur Info-Box hinzufügen
    if (datasetData) {
      const infoBox = document.getElementById("info-box");
      if (infoBox) {
        const oldTraffic = infoBox.querySelector(".traffic-info");
        if (oldTraffic) oldTraffic.remove();
        const trafficDiv = document.createElement("div");
        trafficDiv.className = "traffic-info";
        trafficDiv.innerHTML = buildTrafficLightHTML(datasetData, sample);
        infoBox.appendChild(trafficDiv);
      }
    }

    // Alte Ähnlichkeitslinien entfernen bei neuem Klick
    const ex = scene.getObjectByName("similarityLines");
    if (ex) scene.remove(ex);
    similarityGroup = null;
  });

  // ── ANIMATIONSLOOP ──────────────────────────────────────────────────────────

  /**
   * Rendert die Szene kontinuierlich mit 60 FPS.
   * Verwaltet auch den Blink-Effekt des Highlight-Punktes.
   */
  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Grenzbereich-Alarm Ringe animieren
    if (borderGroup) animateBorderAlarms(borderGroup);

    // Permanentes Blinken des hervorgehobenen Punktes
    if (highlightedSphere?.userData.pulse) {
      const t    = highlightedSphere.userData.pulseTime += 0.06;
      const data = highlightedSphere.userData;

      // Farbe wechselt zwischen Cyan und Weiß
      const blink = (Math.sin(t * 8) + 1) / 2;
      data.coreMat.color.setRGB(blink, 1, 1);

      // Flash-Ring
      data.ringMat.opacity = Math.max(0, Math.sin(t * 8)) * 0.6;
    }

    renderer.render(scene, camera);
  }

  animate();

  // ── RESPONSIVE ──────────────────────────────────────────────────────────────

  /**
   * Passt Kamera und Renderer bei Fenstergrößenänderung an.
   */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Anwendung starten
main().catch((e) => {
  console.error(e);
  alert("Fehler: " + e.message);
});