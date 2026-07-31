import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MODEL_LABELS } from "./config.js";
import { buildPointCloud, addAxes, addGrid, getColor } from "./visualization.js";

// ── SPLIT-SCREEN MODELLVERGLEICH ──────────────────────────────────────────────

/**
 * Erstellt einen vollständigen Split-Screen Modellvergleich.
 * Zwei synchronisierte 3D-Visualisierungen werden nebeneinander angezeigt.
 *
 * Features:
 * - Unabhängige Modell-Auswahl pro Seite
 * - Synchronisierte Kamera (optional)
 * - Farbmodus und Reduktionsverfahren für beide Seiten gemeinsam
 * - Vollständige Metriken pro Seite (Acc, Prec, Rec, F1)
 * - Hover-Tooltip und Klick-Details pro Seite
 * - Screenshot beider Seiten als kombiniertes Bild
 * - Schließen-Button mit sauberem Aufräumen
 *
 * @param {Object} datasetData   - Geladene JSON-Daten des aktuellen Datensatzes
 * @param {string} reduction     - Aktives Reduktionsverfahren
 * @param {string} colorMode     - Aktiver Farbmodus
 * @param {number} confThreshold - Konfidenz-Schwellwert (0–1)
 * @param {Set}    hiddenClasses - Aktuell ausgeblendete Klassen
 */
export function createCompareView(
  datasetData,
  reduction,
  colorMode,
  confThreshold,
  hiddenClasses
) {

  // ── OVERLAY ────────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "compare-overlay";

  // ── TOP BAR ────────────────────────────────────────────────────────────────
  const topBar = document.createElement("div");
  topBar.className = "compare-topbar";

  // Titel
  const title = document.createElement("div");
  title.className   = "compare-title";
  title.textContent = "⚖ Modellvergleich";

  // Datensatz-Info
  const dsInfo = document.createElement("div");
  dsInfo.className   = "compare-ds-info";
  dsInfo.textContent = `Datensatz: ${datasetData.dataset} · ${datasetData.n_samples} Samples · Reduktion: ${reduction.toUpperCase()}`;

  // Gemeinsame Steuerungsleiste
  const controlsBar = document.createElement("div");
  controlsBar.className = "compare-controls";

  /**
   * Erstellt ein beschriftetes Select-Dropdown für die Steuerungsleiste.
   * @param {string} labelText   - Beschriftung über dem Dropdown
   * @param {Array}  options     - Array von {value, text}
   * @param {string} defaultVal  - Vorausgewählter Wert
   */
  function makeSyncSelect(labelText, options, defaultVal) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const lbl = document.createElement("span");
    lbl.className   = "field-label";
    lbl.textContent = labelText;

    const sel = document.createElement("select");
    sel.style.cssText = `
      padding:4px 8px; border-radius:6px;
      background:rgba(255,255,255,0.07);
      border:1px solid rgba(255,255,255,0.12);
      color:#e2e8f0; font-size:12px; cursor:pointer; outline:none;
    `;

    for (const { value, text } of options) {
      const opt = document.createElement("option");
      opt.value       = value;
      opt.textContent = text;
      if (value === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    }

    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    return { wrap, sel };
  }

  // Reduktionsverfahren (synchron für beide Seiten)
  const { wrap: syncRedWrap, sel: syncRedSel } = makeSyncSelect(
    "Reduktion",
    [
      { value: "pca",  text: "PCA"   },
      { value: "umap", text: "UMAP"  },
      { value: "tsne", text: "t-SNE" },
    ],
    reduction
  );

  // Farbmodus (synchron für beide Seiten)
  const { wrap: syncCmWrap, sel: syncCmSel } = makeSyncSelect(
    "Farbmodus",
    [
      { value: "predicted", text: "Vorhergesagte Klasse" },
      { value: "true",      text: "Wahre Klasse"         },
      { value: "errors",    text: "Fehleranalyse"        },
    ],
    colorMode
  );

  // Kamera-Synchronisation Checkbox
  const syncWrap = document.createElement("div");
  syncWrap.className = "field";

  const syncFieldLabel = document.createElement("span");
  syncFieldLabel.className   = "field-label";
  syncFieldLabel.textContent = "Kamera";

  const syncLabel = document.createElement("label");
  syncLabel.className = "checkbox-label";
  syncLabel.style.fontSize = "12px";

  const syncCb    = document.createElement("input");
  syncCb.type     = "checkbox";
  syncCb.checked  = true;

  syncLabel.appendChild(syncCb);
  syncLabel.appendChild(document.createTextNode("Synchron"));
  syncWrap.appendChild(syncFieldLabel);
  syncWrap.appendChild(syncLabel);

  // Screenshot-Button
  const screenshotBtn = document.createElement("button");
  screenshotBtn.textContent = "📷 Screenshot";
  screenshotBtn.className   = "btn btn-success";
  screenshotBtn.style.fontSize = "12px";

  // Schließen-Button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ Schließen";
  closeBtn.className   = "btn btn-danger";
  closeBtn.style.fontSize = "12px";

  controlsBar.appendChild(syncRedWrap);
  controlsBar.appendChild(syncCmWrap);
  controlsBar.appendChild(syncWrap);
  controlsBar.appendChild(screenshotBtn);
  controlsBar.appendChild(closeBtn);

  topBar.appendChild(title);
  topBar.appendChild(dsInfo);
  topBar.appendChild(controlsBar);

  // ── SPLIT CONTAINER ────────────────────────────────────────────────────────
  const splitContainer = document.createElement("div");
  splitContainer.className = "compare-container";

  // ── SEITE ERSTELLEN ────────────────────────────────────────────────────────

  /**
   * Erstellt eine Seite des Split-Screen Vergleichs.
   * Jede Seite hat: Header (Modell-Auswahl, Metriken), Canvas, Info-Box, Legende.
   *
   * @param {string} sideLabel    - Bezeichnung der Seite ("Modell A" | "Modell B")
   * @param {string} defaultModel - Vorausgewähltes Modell
   */
  function createSide(sideLabel, defaultModel) {
    const side = document.createElement("div");
    side.className = "compare-side";

    // Header
    const header = document.createElement("div");
    header.className = "compare-side-header";

    const label = document.createElement("div");
    label.className   = "compare-side-label";
    label.textContent = sideLabel;

    // Modell-Auswahl
    const mWrap = document.createElement("div");
    mWrap.className = "field";

    const mLbl = document.createElement("span");
    mLbl.className   = "field-label";
    mLbl.textContent = "Modell";

    const mSel = document.createElement("select");
    mSel.style.cssText = `
      padding:4px 8px; border-radius:6px;
      background:rgba(255,255,255,0.07);
      border:1px solid rgba(255,255,255,0.12);
      color:#e2e8f0; font-size:12px; cursor:pointer; outline:none;
    `;

    for (const m of datasetData.models) {
      const opt       = document.createElement("option");
      opt.value       = m.model_name;
      opt.textContent = MODEL_LABELS[m.model_name] ?? m.model_name;
      if (m.model_name === defaultModel) opt.selected = true;
      mSel.appendChild(opt);
    }

    mWrap.appendChild(mLbl);
    mWrap.appendChild(mSel);

    // Fehlerfilter
    const errWrap = document.createElement("div");
    errWrap.className = "field";

    const errLbl = document.createElement("span");
    errLbl.className   = "field-label";
    errLbl.textContent = "Filter";

    const errLabel = document.createElement("label");
    errLabel.className  = "checkbox-label";
    errLabel.style.fontSize = "12px";

    const errCb   = document.createElement("input");
    errCb.type    = "checkbox";

    errLabel.appendChild(errCb);
    errLabel.appendChild(document.createTextNode("Nur Fehler"));
    errWrap.appendChild(errLbl);
    errWrap.appendChild(errLabel);

    // Metriken
    const metricsDiv = document.createElement("div");
    metricsDiv.className   = "compare-metrics";
    metricsDiv.textContent = "Metriken: –";

    // Punktanzahl
    const countDiv = document.createElement("div");
    countDiv.className   = "compare-count";
    countDiv.textContent = "– Punkte";

    header.appendChild(label);
    header.appendChild(mWrap);
    header.appendChild(errWrap);
    header.appendChild(metricsDiv);
    header.appendChild(countDiv);

    // Canvas Container
    const canvasContainer = document.createElement("div");
    canvasContainer.className = "compare-canvas-container";

    // Info-Box
    const infoDiv = document.createElement("div");
    infoDiv.className = "compare-info-box";
    infoDiv.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:#64748b;
        text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">
        Punkt-Details
      </div>
      <span style="color:#64748b;">Klicke auf einen Punkt.</span>
    `;
    canvasContainer.appendChild(infoDiv);

    // Legende
    const legendDiv = document.createElement("div");
    legendDiv.className = "compare-legend";
    legendDiv.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:#64748b;
        text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">
        Legende
      </div>
    `;
    canvasContainer.appendChild(legendDiv);

    side.appendChild(header);
    side.appendChild(canvasContainer);

    return { side, canvasContainer, mSel, errCb, metricsDiv, countDiv, infoDiv, legendDiv };
  }

  // Zwei Seiten — verschiedene Default-Modelle
  const leftSide  = createSide("Modell A", datasetData.models[0]?.model_name);
  const rightSide = createSide("Modell B", datasetData.models[1]?.model_name ?? datasetData.models[0]?.model_name);

  // Trennlinie
  const divider = document.createElement("div");
  divider.className = "compare-divider";

  splitContainer.appendChild(leftSide.side);
  splitContainer.appendChild(divider);
  splitContainer.appendChild(rightSide.side);

  overlay.appendChild(topBar);
  overlay.appendChild(splitContainer);
  document.body.appendChild(overlay);

  // ── THREE.JS SETUP PRO SEITE ───────────────────────────────────────────────

  /**
   * Initialisiert Three.js Szene, Kamera, Renderer und Controls für eine Seite.
   * @param {HTMLElement} container - Canvas-Container Element
   * @returns {Object} Three.js Objekte
   */
  function setupThreeJS(container) {
    const W = () => container.clientWidth;
    const H = () => container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1117);

    const camera = new THREE.PerspectiveCamera(70, W() / H(), 0.01, 2000);
    camera.position.set(0, 0, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W(), H());
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.05;
    controls.autoRotate      = false;
    controls.autoRotateSpeed = 1.5;

    // Licht + Gitter + Achsen
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    addGrid(scene);
    addAxes(scene, reduction);

    // Raycaster für Maus-Interaktion
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.15;
    const mouse = new THREE.Vector2();

    window.addEventListener("resize", () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    });

    return { scene, camera, renderer, controls, raycaster, mouse };
  }

  const leftThree  = setupThreeJS(leftSide.canvasContainer);
  const rightThree = setupThreeJS(rightSide.canvasContainer);

  // ── PUNKTWOLKEN ────────────────────────────────────────────────────────────

  let leftCloud    = null;
  let rightCloud   = null;
  let leftSamples  = [];
  let rightSamples = [];

  /**
   * Baut die Punktwolke einer Seite neu auf.
   * Aktualisiert Metriken, Punktanzahl und Legende.
   *
   * @param {string}      side      - "left" | "right"
   * @param {Object}      three     - Three.js Objekte der Seite
   * @param {HTMLElement} mSel      - Modell-Dropdown
   * @param {HTMLElement} errCb     - Fehlerfilter-Checkbox
   * @param {HTMLElement} metricsDiv - Metriken-Anzeige
   * @param {HTMLElement} countDiv   - Punktanzahl-Anzeige
   */
  function buildSide(side, three, mSel, errCb, metricsDiv, countDiv) {
    const modelObj = datasetData.models.find(m => m.model_name === mSel.value);
    if (!modelObj) return;

    // Metriken anzeigen
    const m = modelObj.metrics;
    metricsDiv.innerHTML = `
      <span style="font-size:10px;font-weight:600;color:#64748b;
        text-transform:uppercase;letter-spacing:0.05em;">
        Metriken (Testdaten)
      </span><br/>
      Acc: <b style="color:#e2e8f0;">${(m.accuracy*100).toFixed(1)}%</b>
      &nbsp;|&nbsp;
      Prec: <b style="color:#e2e8f0;">${m.precision.toFixed(3)}</b>
      &nbsp;|&nbsp;
      Rec: <b style="color:#e2e8f0;">${m.recall.toFixed(3)}</b>
      &nbsp;|&nbsp;
      F1: <b style="color:#e2e8f0;">${m.f1.toFixed(3)}</b>
    `;

    // Fehlerfilter anwenden
    const samples = errCb.checked
      ? modelObj.samples.filter(s => !s.is_correct)
      : modelObj.samples;

    // Konfidenz-Filter
    const filtered = samples.filter(s => {
      if (s.confidence < confThreshold)         return false;
      if (hiddenClasses.has(s.predicted_label)) return false;
      if (hiddenClasses.has(s.true_label))      return false;
      return true;
    });

    countDiv.textContent = `${filtered.length} / ${modelObj.samples.length} Punkte`;

    // Alte Wolke entfernen und Speicher freigeben
    if (side === "left" && leftCloud) {
      three.scene.remove(leftCloud);
      leftCloud.geometry.dispose();
      leftCloud.material.dispose();
      leftCloud = null;
    }
    if (side === "right" && rightCloud) {
      three.scene.remove(rightCloud);
      rightCloud.geometry.dispose();
      rightCloud.material.dispose();
      rightCloud = null;
    }

    // Neue Punktwolke aufbauen
    const cloud = buildPointCloud(filtered, syncCmSel.value, syncRedSel.value, 0, new Set());
    three.scene.add(cloud);

    if (side === "left")  { leftCloud = cloud;  leftSamples  = filtered; }
    else                  { rightCloud = cloud; rightSamples = filtered; }
  }

  /**
   * Baut beide Seiten neu auf und aktualisiert Achsen und Legenden.
   */
  function rebuildBoth() {
    buildSide("left",  leftThree,  leftSide.mSel,  leftSide.errCb,  leftSide.metricsDiv,  leftSide.countDiv);
    buildSide("right", rightThree, rightSide.mSel, rightSide.errCb, rightSide.metricsDiv, rightSide.countDiv);
    updateCompareLegend(leftSide.legendDiv,  syncCmSel.value);
    updateCompareLegend(rightSide.legendDiv, syncCmSel.value);
    addAxes(leftThree.scene,  syncRedSel.value);
    addAxes(rightThree.scene, syncRedSel.value);
  }

  // ── LEGENDE PRO SEITE ──────────────────────────────────────────────────────

  /**
   * Aktualisiert die Legende einer Seite.
   * @param {HTMLElement} legendDiv - Legende-Container
   * @param {string}      colorMode - Aktiver Farbmodus
   */
  function updateCompareLegend(legendDiv, colorMode) {
    legendDiv.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:#64748b;
        text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">
        Legende
      </div>
    `;

    const labels = new Set();
    for (const s of datasetData.models[0]?.samples ?? []) {
      if      (colorMode === "true")      labels.add(s.true_label);
      else if (colorMode === "predicted") labels.add(s.predicted_label);
      else if (colorMode === "errors")    labels.add(s.is_correct ? "correct" : "incorrect");
    }

    for (const label of Array.from(labels).sort()) {
      const color = colorMode === "errors" ? getColor(label, label) : getColor(label);
      const hex   = `rgb(${Math.floor(color.r*255)},${Math.floor(color.g*255)},${Math.floor(color.b*255)})`;
      const row   = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";
      row.innerHTML = `
        <div style="width:10px;height:10px;border-radius:50%;background:${hex};flex-shrink:0;"></div>
        <span style="color:#cbd5e1;font-size:11px;">${label}</span>
      `;
      legendDiv.appendChild(row);
    }
  }

  // ── HOVER-TOOLTIP UND KLICK PRO SEITE ─────────────────────────────────────

  /**
   * Richtet Hover-Tooltip und Klick-Interaktion für eine Seite ein.
   * @param {Object}      three    - Three.js Objekte der Seite
   * @param {HTMLElement} infoDiv  - Info-Box der Seite
   * @param {Function}    getCloud - Gibt die aktuelle Punktwolke zurück
   * @param {Function}    getSamples - Gibt die aktuellen Samples zurück
   */
  function setupInteraction(three, infoDiv, getCloud, getSamples) {
    // Tooltip für diese Seite
    const tt = document.createElement("div");
    tt.className = "compare-tooltip";
    document.body.appendChild(tt);

    three.renderer.domElement.addEventListener("mousemove", (e) => {
      const samples = getSamples();
      const cloud   = getCloud();
      if (!samples.length || !cloud) return;

      const rect = three.renderer.domElement.getBoundingClientRect();
      three.mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      three.mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

      three.raycaster.setFromCamera(three.mouse, three.camera);
      const hits = three.raycaster.intersectObject(cloud);

      if (hits.length > 0) {
        const s = samples[hits[0].index];
        tt.style.display = "block";
        tt.style.left    = (e.clientX + 12) + "px";
        tt.style.top     = (e.clientY - 8)  + "px";
        tt.innerHTML = `
          <b style="color:#a5b4fc;">#${s.id}</b><br/>
          Wahr: <b>${s.true_label}</b><br/>
          Pred: <b>${s.predicted_label}</b><br/>
          Konfidenz: <b>${(s.confidence*100).toFixed(1)}%</b><br/>
          <span style="color:${s.is_correct ? '#34d399' : '#f87171'}">
            ${s.is_correct ? '✓ Korrekt' : '✗ Falsch'}
          </span>
        `;
        three.renderer.domElement.style.cursor = "pointer";
      } else {
        tt.style.display = "none";
        three.renderer.domElement.style.cursor = "default";
      }
    });

    three.renderer.domElement.addEventListener("mouseleave", () => {
      tt.style.display = "none";
    });

    three.renderer.domElement.addEventListener("click", (e) => {
      const samples = getSamples();
      const cloud   = getCloud();
      if (!samples.length || !cloud) return;

      const rect = three.renderer.domElement.getBoundingClientRect();
      three.mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      three.mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

      three.raycaster.setFromCamera(three.mouse, three.camera);
      const hits = three.raycaster.intersectObject(cloud);

      if (hits.length === 0) {
        infoDiv.innerHTML = `
          <div style="font-size:10px;font-weight:600;color:#64748b;
            text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">
            Punkt-Details
          </div>
          <span style="color:#64748b;">Kein Punkt ausgewählt.</span>
        `;
        return;
      }

      const s           = samples[hits[0].index];
      const statusColor = s.is_correct ? "#34d399" : "#f87171";
      let featuresHTML  = "";

      if (s.features) {
        const entries = Object.entries(s.features).slice(0, 5);
        featuresHTML = `
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.07);">
            <span style="font-size:10px;color:#64748b;font-weight:600;">Features</span><br/>
            ${entries.map(([k,v]) =>
              `<span style="color:#64748b;">${k}:</span> <b>${Number(v).toFixed(3)}</b><br/>`
            ).join("")}
          </div>
        `;
      }

      infoDiv.innerHTML = `
        <div style="font-size:10px;font-weight:600;color:#64748b;
          text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">
          Punkt-Details
        </div>
        <span style="color:#64748b;">ID:</span> <b>${s.id}</b><br/>
        <span style="color:#64748b;">Wahr:</span> <b>${s.true_label}</b><br/>
        <span style="color:#64748b;">Pred:</span> <b>${s.predicted_label}</b><br/>
        <span style="color:#64748b;">Konfidenz:</span> <b>${(s.confidence*100).toFixed(1)}%</b><br/>
        <span style="color:${statusColor};font-weight:600;">
          ${s.is_correct ? "✓ Korrekt" : "✗ Fehlklassifiziert"}
        </span>
        ${featuresHTML}
      `;
    });

    return tt;
  }

  const leftTT  = setupInteraction(leftThree,  leftSide.infoDiv,  () => leftCloud,  () => leftSamples);
  const rightTT = setupInteraction(rightThree, rightSide.infoDiv, () => rightCloud, () => rightSamples);

  // ── KAMERA SYNCHRONISATION ─────────────────────────────────────────────────

  /**
   * Synchronisiert die Kamera beider Seiten.
   * Wenn der Nutzer auf einer Seite dreht oder zoomt,
   * bewegt sich die andere Seite identisch mit.
   */
  let isSyncing = false;

  function syncCameras(sourceCamera, targetCamera, targetControls, sourceControls) {
    if (!syncCb.checked || isSyncing) return;
    isSyncing = true;
    targetCamera.position.copy(sourceCamera.position);
    targetCamera.quaternion.copy(sourceCamera.quaternion);
    targetControls.target.copy(sourceControls.target);
    targetControls.update();
    isSyncing = false;
  }

  leftThree.controls.addEventListener("change", () => {
    syncCameras(leftThree.camera, rightThree.camera, rightThree.controls, leftThree.controls);
  });

  rightThree.controls.addEventListener("change", () => {
    syncCameras(rightThree.camera, leftThree.camera, leftThree.controls, rightThree.controls);
  });

  // ── EVENT LISTENER ─────────────────────────────────────────────────────────

  leftSide.mSel.addEventListener("change", () => {
    buildSide("left", leftThree, leftSide.mSel, leftSide.errCb, leftSide.metricsDiv, leftSide.countDiv);
    updateCompareLegend(leftSide.legendDiv, syncCmSel.value);
  });

  rightSide.mSel.addEventListener("change", () => {
    buildSide("right", rightThree, rightSide.mSel, rightSide.errCb, rightSide.metricsDiv, rightSide.countDiv);
    updateCompareLegend(rightSide.legendDiv, syncCmSel.value);
  });

  leftSide.errCb.addEventListener("change",  () => {
    buildSide("left", leftThree, leftSide.mSel, leftSide.errCb, leftSide.metricsDiv, leftSide.countDiv);
  });

  rightSide.errCb.addEventListener("change", () => {
    buildSide("right", rightThree, rightSide.mSel, rightSide.errCb, rightSide.metricsDiv, rightSide.countDiv);
  });

  syncRedSel.addEventListener("change", () => {
    addAxes(leftThree.scene,  syncRedSel.value);
    addAxes(rightThree.scene, syncRedSel.value);
    rebuildBoth();
  });

  syncCmSel.addEventListener("change", () => rebuildBoth());

  // Screenshot beider Seiten als kombiniertes Bild
  screenshotBtn.addEventListener("click", () => {
    leftThree.renderer.render(leftThree.scene,   leftThree.camera);
    rightThree.renderer.render(rightThree.scene, rightThree.camera);

    const lCanvas = leftThree.renderer.domElement;
    const rCanvas = rightThree.renderer.domElement;

    const combined = document.createElement("canvas");
    combined.width  = lCanvas.width + rCanvas.width;
    combined.height = Math.max(lCanvas.height, rCanvas.height);

    const ctx = combined.getContext("2d");
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, combined.width, combined.height);
    ctx.drawImage(lCanvas, 0, 0);
    ctx.drawImage(rCanvas, lCanvas.width, 0);

    const link    = document.createElement("a");
    link.download = `vergleich_${datasetData.dataset}_${syncRedSel.value}.png`;
    link.href     = combined.toDataURL("image/png");
    link.click();
  });

  // ── SCHLIESSEN ─────────────────────────────────────────────────────────────

  /**
   * Räumt alle Three.js Ressourcen auf und entfernt das Overlay.
   * Verhindert Memory-Leaks durch sauberes Dispose.
   */
  function cleanup() {
    running = false;
    if (leftCloud)  { leftCloud.geometry.dispose();  leftCloud.material.dispose();  }
    if (rightCloud) { rightCloud.geometry.dispose(); rightCloud.material.dispose(); }
    leftThree.renderer.dispose();
    rightThree.renderer.dispose();
    leftTT.remove();
    rightTT.remove();
    document.body.removeChild(overlay);
  }

  closeBtn.addEventListener("click", cleanup);

  // ── ANIMATIONSLOOP ─────────────────────────────────────────────────────────

  /**
   * Rendert beide Seiten kontinuierlich.
   * Stoppt automatisch wenn das Overlay geschlossen wird.
   */
  let running = true;

  function animateCompare() {
    if (!running || !document.body.contains(overlay)) {
      running = false;
      return;
    }
    requestAnimationFrame(animateCompare);
    leftThree.controls.update();
    rightThree.controls.update();
    leftThree.renderer.render(leftThree.scene,   leftThree.camera);
    rightThree.renderer.render(rightThree.scene, rightThree.camera);
  }

  // Initial aufbauen und starten
  rebuildBoth();
  animateCompare();
}