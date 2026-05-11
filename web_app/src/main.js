import * as THREE from "three";

const DATASETS = [
  { key: "iris", label: "Iris", file: "/iris_models_3d.json" },
  { key: "wine", label: "Wine", file: "/wine_models_3d.json" },
  { key: "breast_cancer", label: "Breast Cancer", file: "/breast_cancer_models_3d.json" },
];

const MODEL_LABELS = {
  logistic_regression: "Logistic Regression",
  random_forest: "Random Forest",
  svm_rbf: "SVM (RBF)",
};

function createUI() {
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.top = "12px";
  panel.style.left = "12px";
  panel.style.padding = "10px 12px";
  panel.style.background = "rgba(0,0,0,0.55)";
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

  const errLabel = document.createElement("label");
  errLabel.style.display = "flex";
  errLabel.style.gap = "6px";
  errLabel.style.alignItems = "center";
  errLabel.style.cursor = "pointer";

  const errOnly = document.createElement("input");
  errOnly.type = "checkbox";
  errOnly.id = "errorsOnly";

  const errText = document.createElement("span");
  errText.textContent = "Errors only";

  errLabel.appendChild(errOnly);
  errLabel.appendChild(errText);

  panel.appendChild(dsLabel);
  panel.appendChild(dsSelect);
  panel.appendChild(mLabel);
  panel.appendChild(mSelect);
  panel.appendChild(errLabel);

  const metricsBox = document.createElement("div");
  metricsBox.id = "metricsBox";
  metricsBox.style.marginTop = "8px";
  metricsBox.style.paddingTop = "8px";
  metricsBox.style.borderTop = "1px solid rgba(255,255,255,0.2)";
  metricsBox.innerHTML = `<div style="opacity:0.85">Metrics (test set):</div><div id="metricsValues">-</div>`;

  // Panel ist flex -> wir packen metrics darunter in einen wrapper
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "6px";

  // erste Zeile (controls)
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.alignItems = "center";

  // statt alles direkt ins panel: in row
  // => Wir müssen vorher die bisherigen appendChilds anpassen


  document.body.appendChild(panel);
  const metrics = document.createElement("div");
  metrics.id = "metricsValues";
  metrics.style.marginLeft = "10px";
  metrics.style.padding = "6px 8px";
  metrics.style.borderRadius = "8px";
  metrics.style.background = "rgba(255,255,255,0.08)";
  metrics.style.fontSize = "13px";
  metrics.style.lineHeight = "1.2";
  metrics.textContent = "Metrics: -";
  panel.appendChild(metrics);


  return { dsSelect, mSelect, errOnly, metrics };

}

  // Tooltip/Info-Box für Details zu einem ausgewählten Datenpunkt.
  // Diese Box wird später beim Klick auf einen Punkt aktualisiert.
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

  // Raycaster wird verwendet, um mit der Maus Punkte in der 3D-Szene auszuwählen.
    const raycaster = new THREE.Raycaster();

  // Bei Punktwolken muss der Threshold etwas größer sein,
  // damit kleine Punkte leichter anklickbar sind.
    raycaster.params.Points.threshold = 0.15;
  
  // Speichert die aktuelle Mausposition in normalisierten Bildschirmkoordinaten.
    const mouse = new THREE.Vector2();
  
  // Hier speichern wir die aktuell angezeigten Samples,
  // damit beim Klick der richtige Datensatz ausgelesen werden kann.
    let visibleSamples = [];

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`JSON nicht gefunden: ${path}`);
  return await res.json();
}

function hashColorFromLabel(label) {
  // stabile Farbe pro Label (funktioniert für beliebige Klassenanzahl)
  let h = 0;
  const s = String(label);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const r = 0.2 + ((h & 255) / 255) * 0.7;
  const g = 0.2 + (((h >> 8) & 255) / 255) * 0.7;
  const b = 0.2 + (((h >> 16) & 255) / 255) * 0.7;
  return new THREE.Color(r, g, b);
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

    const label = colorMode === "true" ? samples[i].true_label : samples[i].predicted_label;
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
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f12);

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    2000
  );
  camera.position.set(0, 0, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.style.margin = "0";
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  // UI
  const { dsSelect, mSelect, errOnly, metrics } = createUI();

  // State
  let datasetData = null;
  let currentCloud = null;

  function fillModelSelect(models) {
    mSelect.innerHTML = "";
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.model_name;
      opt.textContent = MODEL_LABELS[m.model_name] ?? m.model_name;
      mSelect.appendChild(opt);
    }
  }

  function rebuildCloud() {
    if (!datasetData) return;

    const selectedModelName = mSelect.value;
    const modelObj = datasetData.models.find(m => m.model_name === selectedModelName);
    if (!modelObj) return;

    if (modelObj.metrics && metrics) {
      const m = modelObj.metrics;
      metrics.textContent =
        `Metrics (test): Acc ${m.accuracy.toFixed(3)} | Prec ${m.precision.toFixed(3)} | Rec ${m.recall.toFixed(3)} | F1 ${m.f1.toFixed(3)}`;
    } else if (metrics) {
      metrics.textContent = "Metrics: -";
    }

    const samples = errOnly.checked
      ? modelObj.samples.filter(s => !s.is_correct)
      : modelObj.samples;

    // Sichtbare Samples speichern.
    // Wichtig für die Klick-Interaktion: Der Index im PointCloud entspricht diesem Array.
    visibleSamples = samples;

    if (currentCloud) {
      scene.remove(currentCloud);
      currentCloud.geometry.dispose();
      currentCloud.material.dispose();
      currentCloud = null;
    }

    currentCloud = buildPointCloud(samples, "predicted");
    scene.add(currentCloud);
  }

  async function loadDataset(key) {
    const ds = DATASETS.find(d => d.key === key);
    datasetData = await fetchJSON(ds.file);
    fillModelSelect(datasetData.models);
    rebuildCloud();
  }

  // Initial load
  await loadDataset("iris");

  // Events
  dsSelect.addEventListener("change", async () => {
    await loadDataset(dsSelect.value);
  });

  mSelect.addEventListener("change", () => rebuildCloud());
  errOnly.addEventListener("change", () => rebuildCloud());

    // Klick-Interaktion: Beim Klick auf einen Punkt werden Details angezeigt.
    renderer.domElement.addEventListener("click", (event) => {
      if (!currentCloud || visibleSamples.length === 0) return;
  
      // Mausposition in normalisierte Gerätekoordinaten umrechnen.
      // Three.js erwartet Werte zwischen -1 und +1.
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
      // Raycaster von Kamera durch Mausposition setzen.
      raycaster.setFromCamera(mouse, camera);
  
      // Prüfen, ob ein Punkt der aktuellen Punktwolke getroffen wurde.
      const intersections = raycaster.intersectObject(currentCloud);
  
      if (intersections.length === 0) {
        infoBox.innerHTML = "<strong>Point Details</strong><br/>No point selected.";
        return;
      }
  
      // Der erste Treffer ist der nächstgelegene Punkt.
      const index = intersections[0].index;
      const sample = visibleSamples[index];
  
      // Details des ausgewählten Datenpunkts anzeigen.
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

  // Animation
  function animate() {
    requestAnimationFrame(animate);
    if (currentCloud) currentCloud.rotation.y += 0.002;
    renderer.render(scene, camera);
  }
  animate();

  // Resize
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
