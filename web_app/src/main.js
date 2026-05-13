import * as THREE from "three";

// OrbitControls ermöglichen Maussteuerung für die 3D-Kamera.
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Verfügbare Datensätze.
 * Jede JSON-Datei wurde vorher durch die Python-ML-Pipeline erzeugt.
 */
const DATASETS = [
  { key: "iris", label: "Iris", file: "/iris_models_3d.json" },
  { key: "wine", label: "Wine", file: "/wine_models_3d.json" },
  { key: "breast_cancer", label: "Breast Cancer", file: "/breast_cancer_models_3d.json" },
];

/**
 * Lesbare Namen für die Klassifikationsmodelle.
 */
const MODEL_LABELS = {
  logistic_regression: "Logistic Regression",
  random_forest: "Random Forest",
  svm_rbf: "SVM (RBF)",
  knn: "kNN",
};

// Globale Referenz auf die Legenden-Box.
// Wird in createUI() erstellt und in updateLegend() aktualisiert.
let legendBox = null;

/**
 * Erstellt das Bedienpanel oben links.
 */
function createUI() {
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.top = "12px";
  panel.style.left = "12px";
  panel.style.padding = "10px 12px";
  panel.style.background = "rgba(0,0,0,0.65)";
  panel.style.color = "white";
  panel.style.fontFamily = "system-ui, Arial, sans-serif";
  panel.style.fontSize = "14px";
  panel.style.borderRadius = "10px";
  panel.style.backdropFilter = "blur(6px)";
  panel.style.zIndex = "9999";
  panel.style.display = "flex";
  panel.style.gap = "10px";
  panel.style.alignItems = "center";

  const dsLabel = document.createElement("span");
  dsLabel.textContent = "Dataset:";

  const dsSelect = document.createElement("select");
  dsSelect.id = "datasetSelect";
  dsSelect.style.padding = "6px";
  dsSelect.style.borderRadius = "8px";

  for (const d of DATASETS) {
    const opt = document.createElement("option");
    opt.value = d.key;
    opt.textContent = d.label;
    dsSelect.appendChild(opt);
  }

  const mLabel = document.createElement("span");
  mLabel.textContent = "Model:";

  const mSelect = document.createElement("select");
  mSelect.id = "modelSelect";
  mSelect.style.padding = "6px";
  mSelect.style.borderRadius = "8px";

  // Dropdown zur Auswahl des Farbmodus.
  // Der Benutzer kann wählen, welche Informationen farblich dargestellt werden.
  const colorModeLabel = document.createElement("span");
  colorModeLabel.textContent = "Color:";

  const colorModeSelect = document.createElement("select");
  colorModeSelect.id = "colorModeSelect";
  colorModeSelect.style.padding = "6px";
  colorModeSelect.style.borderRadius = "8px";

  // Verfügbare Farbmodi.
  const colorModes = [
    { value: "predicted", label: "Predicted" },
    { value: "true", label: "True Labels" },
    { value: "errors", label: "Errors" }
  ];

  for (const mode of colorModes) {
    const opt = document.createElement("option");
    opt.value = mode.value;
    opt.textContent = mode.label;
    colorModeSelect.appendChild(opt);
  }

  const errOnly = document.createElement("input");
  errOnly.type = "checkbox";
  errOnly.id = "errorsOnly";

  const errLabel = document.createElement("label");
  errLabel.style.display = "flex";
  errLabel.style.gap = "6px";
  errLabel.style.alignItems = "center";
  errLabel.style.cursor = "pointer";
  errLabel.appendChild(errOnly);
  errLabel.appendChild(document.createTextNode("Errors only"));

  const metrics = document.createElement("div");
  metrics.id = "metricsValues";
  metrics.style.marginLeft = "10px";
  metrics.style.padding = "6px 8px";
  metrics.style.borderRadius = "8px";
  metrics.style.background = "rgba(255,255,255,0.08)";
  metrics.style.fontSize = "13px";
  metrics.style.lineHeight = "1.2";
  metrics.textContent = "Metrics: -";

  panel.appendChild(dsLabel);
  panel.appendChild(dsSelect);
  panel.appendChild(mLabel);
  panel.appendChild(mSelect);
  panel.appendChild(colorModeLabel);
  panel.appendChild(colorModeSelect);
  panel.appendChild(errLabel);
  panel.appendChild(metrics);

  document.body.appendChild(panel);

  // Dynamische Legende für Klassenfarben.
  // Die Legende zeigt, welche Farbe welcher Klasse entspricht.
  const legendBox = document.createElement("div");

  legendBox.style.position = "fixed";
  legendBox.style.right = "12px";
  legendBox.style.bottom = "12px";
  legendBox.style.minWidth = "180px";
  legendBox.style.padding = "12px";
  legendBox.style.background = "rgba(0, 0, 0, 0.65)";
  legendBox.style.color = "white";
  legendBox.style.fontFamily = "system-ui, Arial, sans-serif";
  legendBox.style.fontSize = "14px";
  legendBox.style.borderRadius = "10px";
  legendBox.style.backdropFilter = "blur(6px)";
  legendBox.style.zIndex = "9999";

  legendBox.innerHTML = "<strong>Legend</strong>";

  document.body.appendChild(legendBox);

  return { dsSelect, mSelect, errOnly, metrics, colorModeSelect };
}

/**
 * Erstellt die Info-Box für Details zu einem angeklickten Datenpunkt.
 */
function createInfoBox() {
  const infoBox = document.createElement("div");
  infoBox.style.position = "fixed";
  infoBox.style.right = "12px";
  infoBox.style.top = "12px";
  infoBox.style.width = "280px";
  infoBox.style.padding = "12px";
  infoBox.style.background = "rgba(0, 0, 0, 0.65)";
  infoBox.style.color = "white";
  infoBox.style.fontFamily = "system-ui, Arial, sans-serif";
  infoBox.style.fontSize = "14px";
  infoBox.style.borderRadius = "10px";
  infoBox.style.backdropFilter = "blur(6px)";
  infoBox.style.zIndex = "9999";
  infoBox.innerHTML = "<strong>Point Details</strong><br/>Click on a point.";
  document.body.appendChild(infoBox);
  return infoBox;
}

/**
 * Lädt eine JSON-Datei aus dem public-Verzeichnis der Web-App.
 */
async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`JSON nicht gefunden: ${path}`);
  return await res.json();
}

/**
 * Erzeugt eine stabile Farbe für beliebige Klassenbezeichnungen.
 * Dadurch funktioniert die Visualisierung auch für Datensätze mit unterschiedlicher Klassenanzahl.
 */
function hashColorFromLabel(label) {
  let h = 0;
  const s = String(label);

  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }

  const r = 0.2 + ((h & 255) / 255) * 0.7;
  const g = 0.2 + (((h >> 8) & 255) / 255) * 0.7;
  const b = 0.2 + (((h >> 16) & 255) / 255) * 0.7;

  return new THREE.Color(r, g, b);
}

/**
 * Baut aus den Sample-Daten eine Three.js-Punktwolke.
 */
function updateLegend(samples, colorMode) {
  // Vorhandene Einträge löschen.
  if (!legendBox) return;
  // Vorhandene Einträge löschen.
  legendBox.innerHTML = "<strong>Legend</strong><br/><br/>";

  const labels = new Set();

  // Abhängig vom Farbmodus unterschiedliche Labels sammeln.
  for (const s of samples) {
    if (colorMode === "true") {
      labels.add(s.true_label);
    }

    else if (colorMode === "predicted") {
      labels.add(s.predicted_label);
    }

    else if (colorMode === "errors") {
      labels.add(s.is_correct ? "correct" : "incorrect");
    }
  }

  // Für jedes Label einen Farbeintrag erzeugen.
  for (const label of labels) {
    const row = document.createElement("div");

    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginBottom = "6px";

    const colorBox = document.createElement("div");
    colorBox.style.width = "14px";
    colorBox.style.height = "14px";
    colorBox.style.borderRadius = "3px";

    const color = hashColorFromLabel(label);

    colorBox.style.background =
      `rgb(${Math.floor(color.r * 255)},
           ${Math.floor(color.g * 255)},
           ${Math.floor(color.b * 255)})`;

    const text = document.createElement("span");
    text.textContent = label;

    row.appendChild(colorBox);
    row.appendChild(text);

    legendBox.appendChild(row);
  }
}

function buildPointCloud(samples, colorMode = "predicted") {
  const n = samples.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const p = samples[i].position;

    positions[i * 3 + 0] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];

        let label;

    // Farbmodus: echte Klassen
    if (colorMode === "true") {
      label = samples[i].true_label;
    }

    // Farbmodus: vorhergesagte Klassen
    else if (colorMode === "predicted") {
      label = samples[i].predicted_label;
    }

    // Farbmodus: Fehleranalyse
    else if (colorMode === "errors") {
      label = samples[i].is_correct ? "correct" : "incorrect";
    }

    else {
      label = samples[i].predicted_label;
    }

    const c = hashColorFromLabel(label);

    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
  });

  return new THREE.Points(geometry, material);
}

async function main() {
  // Szene erstellen.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f12);

  // Kamera erstellen.
  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    2000
  );
  camera.position.set(0, 0, 10);

  // Renderer erstellen.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.style.margin = "0";
  document.body.appendChild(renderer.domElement);

  // OrbitControls für interaktive Navigation.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.autoRotate = false;

  // Grundbeleuchtung.
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  // UI und Info-Box erstellen.
  const { dsSelect, mSelect, errOnly, metrics, colorModeSelect } = createUI();
  const infoBox = createInfoBox();

  // Raycaster für Klick-Interaktion auf Punkte.
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.15;

  // Mausposition für Raycasting.
  const mouse = new THREE.Vector2();

  // Zustand der Anwendung.
  let datasetData = null;
  let currentCloud = null;
  let visibleSamples = [];

  /**
   * Füllt das Modell-Dropdown dynamisch anhand der Modelle in der JSON-Datei.
   */
  function fillModelSelect(models) {
    mSelect.innerHTML = "";

    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.model_name;
      opt.textContent = MODEL_LABELS[m.model_name] ?? m.model_name;
      mSelect.appendChild(opt);
    }
  }

  /**
   * Baut die aktuelle Punktwolke neu auf, wenn Dataset, Modell oder Filter geändert wird.
   */
  function rebuildCloud() {
    if (!datasetData) return;

    const selectedModelName = mSelect.value;
    const modelObj = datasetData.models.find(
      (m) => m.model_name === selectedModelName
    );

    if (!modelObj) return;

    // Testmetriken aus der JSON-Datei anzeigen.
    if (modelObj.metrics && metrics) {
      const m = modelObj.metrics;
      metrics.textContent =
        `Metrics (test): Acc ${m.accuracy.toFixed(3)} | ` +
        `Prec ${m.precision.toFixed(3)} | ` +
        `Rec ${m.recall.toFixed(3)} | ` +
        `F1 ${m.f1.toFixed(3)}`;
    } else if (metrics) {
      metrics.textContent = "Metrics: -";
    }

    // Optional nur Fehlklassifikationen anzeigen.
    const samples = errOnly.checked
      ? modelObj.samples.filter((s) => !s.is_correct)
      : modelObj.samples;

    visibleSamples = samples;

    // Alte Punktwolke entfernen.
    if (currentCloud) {
      scene.remove(currentCloud);
      currentCloud.geometry.dispose();
      currentCloud.material.dispose();
      currentCloud = null;
    }

    // Neue Punktwolke hinzufügen.
        currentCloud = buildPointCloud(
      samples,
      colorModeSelect.value
    );
    
    // Legende entsprechend des aktuellen Farbmodus aktualisieren.
    updateLegend(samples, colorModeSelect.value);
    scene.add(currentCloud);
  }

  /**
   * Lädt einen Datensatz und aktualisiert die Visualisierung.
   */
  async function loadDataset(key) {
    const ds = DATASETS.find((d) => d.key === key);
    datasetData = await fetchJSON(ds.file);
    fillModelSelect(datasetData.models);
    rebuildCloud();
  }

  // Initial Iris laden.
  await loadDataset("iris");

  // UI-Events.
  dsSelect.addEventListener("change", async () => {
    await loadDataset(dsSelect.value);
  });

  mSelect.addEventListener("change", () => rebuildCloud());

  // Farbmodus ändern.
  colorModeSelect.addEventListener("change", () => rebuildCloud());

  // Klick-Interaktion für Punktdetails.
  renderer.domElement.addEventListener("click", (event) => {
    if (!currentCloud || visibleSamples.length === 0) return;

    const rect = renderer.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersections = raycaster.intersectObject(currentCloud);

    if (intersections.length === 0) {
      infoBox.innerHTML = "<strong>Point Details</strong><br/>No point selected.";
      return;
    }

    const index = intersections[0].index;
    const sample = visibleSamples[index];

    infoBox.innerHTML = `
      <strong>Point Details</strong><br/><br/>
      <b>Dataset:</b> ${datasetData.dataset}<br/>
      <b>Model:</b> ${mSelect.value}<br/>
      <b>ID:</b> ${sample.id}<br/>
      <b>True label:</b> ${sample.true_label}<br/>
      <b>Predicted label:</b> ${sample.predicted_label}<br/>
      <b>Confidence:</b> ${sample.confidence.toFixed(3)}<br/>
      <b>Status:</b> ${sample.is_correct ? "Correct" : "Incorrect"}
    `;
  });

  // Animationsloop.
  function animate() {
    requestAnimationFrame(animate);

    // OrbitControls müssen bei Damping in jedem Frame aktualisiert werden.
    controls.update();

    renderer.render(scene, camera);
  }

  animate();

  // Fenstergrößenänderungen behandeln.
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

main().catch((e) => {
  console.error(e);
  alert(e.message);
});