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

    showPointDetails(
      currentCloud.userData.samples[hits[0].index],
      datasetData.dataset,
      mSelect.value,
      redSelect.value
    );
  });

  // ── ANIMATIONSLOOP ──────────────────────────────────────────────────────────

  /**
   * Rendert die Szene kontinuierlich mit 60 FPS.
   * Verwaltet auch den Blink-Effekt des Highlight-Punktes.
   */
  function animate() {
    requestAnimationFrame(animate);
    controls.update();

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