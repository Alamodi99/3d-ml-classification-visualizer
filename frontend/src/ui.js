import { DATASETS, MODEL_LABELS, BACKEND_URL } from "./config.js";

// ── LADEINDIKATOR ─────────────────────────────────────────────────────────────

/**
 * Zeigt den Ladeindikator an.
 * Wird beim Laden eines Datensatzes aufgerufen.
 */
export function showLoading() {
  document.getElementById("loading-overlay")?.classList.add("active");
}

/**
 * Versteckt den Ladeindikator.
 * Wird nach dem Laden eines Datensatzes aufgerufen.
 */
export function hideLoading() {
  document.getElementById("loading-overlay")?.classList.remove("active");
}

// ── PANEL AUFBAUEN ────────────────────────────────────────────────────────────

/**
 * Erstellt alle Bedienelemente im Steuerungspanel (oben links).
 * Befüllt das #panel Element aus index.html mit:
 * - Datensatz-Dropdown
 * - Modell-Dropdown
 * - Reduktionsverfahren-Dropdown (PCA / UMAP / t-SNE)
 * - Farbmodus-Dropdown
 * - Konfidenz-Schwellwert-Slider
 * - Klassen-Toggle Bereich
 * - Fehlerfilter-Checkbox
 * - Autorotation-Checkbox
 * - Reset-Button
 * - Screenshot-Button
 * - Vergleichs-Button
 * - Suchfeld (Punkt-ID)
 * - Metriken-Anzeige
 * - Punktanzahl-Anzeige
 * - CSV-Upload-Button
 *
 * @returns {Object} Referenzen auf alle UI-Elemente
 */
export function buildPanel() {
  const panel = document.getElementById("panel");
  panel.innerHTML = "";

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────

  /**
   * Erstellt ein beschriftetes Select-Dropdown.
   * @param {string} labelText - Beschriftung über dem Dropdown
   * @param {string} id        - HTML-ID des Select-Elements
   * @param {Array}  options   - Array von {value, text}
   * @returns {{wrapper: HTMLElement, sel: HTMLSelectElement}}
   */
  function makeSelect(labelText, id, options) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const lbl = document.createElement("span");
    lbl.className   = "field-label";
    lbl.textContent = labelText;

    const sel = document.createElement("select");
    sel.id = id;

    for (const { value, text } of options) {
      const opt       = document.createElement("option");
      opt.value       = value;
      opt.textContent = text;
      sel.appendChild(opt);
    }

    wrapper.appendChild(lbl);
    wrapper.appendChild(sel);
    return { wrapper, sel };
  }

  /**
   * Erstellt eine beschriftete Checkbox.
   * @param {string} labelText - Text neben der Checkbox
   * @param {string} topLabel  - Kleine Beschriftung über der Checkbox
   * @param {string} id        - HTML-ID der Checkbox
   * @returns {{wrapper: HTMLElement, cb: HTMLInputElement}}
   */
  function makeCheckbox(labelText, topLabel, id) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const top = document.createElement("span");
    top.className   = "field-label";
    top.textContent = topLabel;

    const label = document.createElement("label");
    label.className = "checkbox-label";

    const cb  = document.createElement("input");
    cb.type   = "checkbox";
    cb.id     = id;

    label.appendChild(cb);
    label.appendChild(document.createTextNode(labelText));
    wrapper.appendChild(top);
    wrapper.appendChild(label);
    return { wrapper, cb };
  }

  /**
   * Erstellt einen beschrifteten Button.
   * @param {string} labelText  - Beschriftung über dem Button
   * @param {string} btnText    - Text auf dem Button
   * @param {string} btnClass   - CSS-Klasse für die Farbe
   * @param {string} id         - HTML-ID des Buttons
   * @returns {{wrapper: HTMLElement, btn: HTMLButtonElement}}
   */
  function makeButton(labelText, btnText, btnClass, id) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const top = document.createElement("span");
    top.className   = "field-label";
    top.textContent = labelText;

    const btn = document.createElement("button");
    btn.className   = `btn ${btnClass}`;
    btn.textContent = btnText;
    btn.id          = id;

    wrapper.appendChild(top);
    wrapper.appendChild(btn);
    return { wrapper, btn };
  }

  // ── Datensatz-Dropdown ─────────────────────────────────────────────────────
  const { wrapper: dsWrapper, sel: dsSelect } = makeSelect(
    "Datensatz", "ds-select",
    DATASETS.map((d) => ({ value: d.key, text: d.label }))
  );

  // ── Modell-Dropdown ────────────────────────────────────────────────────────
  const { wrapper: mWrapper, sel: mSelect } = makeSelect(
    "Modell", "model-select", []
  );

  // ── Reduktionsverfahren-Dropdown ───────────────────────────────────────────
  const { wrapper: redWrapper, sel: redSelect } = makeSelect(
    "Reduktion", "reduction-select",
    [
      { value: "pca",  text: "PCA"   },
      { value: "umap", text: "UMAP"  },
      { value: "tsne", text: "t-SNE" },
    ]
  );

  // ── Farbmodus-Dropdown ─────────────────────────────────────────────────────
  const { wrapper: cmWrapper, sel: colorModeSelect } = makeSelect(
    "Farbmodus", "colormode-select",
    [
      { value: "predicted", text: "Vorhergesagte Klasse" },
      { value: "true",      text: "Wahre Klasse"         },
      { value: "errors",    text: "Fehleranalyse"        },
    ]
  );

  // ── Konfidenz-Slider ───────────────────────────────────────────────────────
  const confWrapper = document.createElement("div");
  confWrapper.className = "field";

  const confLabel = document.createElement("span");
  confLabel.className   = "field-label";
  confLabel.textContent = "Min. Konfidenz";

  const confRow = document.createElement("div");
  confRow.style.cssText = "display:flex; align-items:center; gap:6px;";

  const confSlider = document.createElement("input");
  confSlider.type      = "range";
  confSlider.id        = "conf-slider";
  confSlider.min       = "0";
  confSlider.max       = "100";
  confSlider.value     = "0";
  confSlider.className = "slider";

  const confValue = document.createElement("span");
  confValue.className   = "slider-value";
  confValue.textContent = "0%";
  confValue.id          = "conf-value";

  confSlider.addEventListener("input", () => {
    confValue.textContent = `${confSlider.value}%`;
  });

  confRow.appendChild(confSlider);
  confRow.appendChild(confValue);
  confWrapper.appendChild(confLabel);
  confWrapper.appendChild(confRow);

  // ── Klassen-Toggle ─────────────────────────────────────────────────────────
  const classWrapper = document.createElement("div");
  classWrapper.className = "field";

  const classLabel = document.createElement("span");
  classLabel.className   = "field-label";
  classLabel.textContent = "Klassen";

  const classToggleRow = document.createElement("div");
  classToggleRow.id        = "class-toggle-row";
  classToggleRow.className = "class-toggle-row";

  classWrapper.appendChild(classLabel);
  classWrapper.appendChild(classToggleRow);

  // ── Fehlerfilter-Checkbox ──────────────────────────────────────────────────
  const { wrapper: errWrapper, cb: errOnly } =
    makeCheckbox("Nur Fehler", "Filter", "err-only");

  // ── Autorotation-Checkbox ──────────────────────────────────────────────────
  const { wrapper: rotWrapper, cb: autoRotate } =
    makeCheckbox("Rotation", "Auto", "auto-rotate");

  // ── Reset-Button ───────────────────────────────────────────────────────────
  const { wrapper: resetWrapper, btn: resetBtn } =
    makeButton("Ansicht", "↺ Reset", "btn-primary", "reset-btn");

  // ── Screenshot-Button ──────────────────────────────────────────────────────
  const { wrapper: screenshotWrapper, btn: screenshotBtn } =
    makeButton("Export", "📷 Screenshot", "btn-success", "screenshot-btn");

  // ── Vergleichs-Button ──────────────────────────────────────────────────────
  const { wrapper: compareWrapper, btn: compareBtn } =
    makeButton("Vergleich", "⚖ Modelle vergleichen", "btn-purple", "compare-btn");

  // ── Suchfeld (Punkt-ID) ────────────────────────────────────────────────────
  const searchWrapper = document.createElement("div");
  searchWrapper.className = "field";

  const searchLabel = document.createElement("span");
  searchLabel.className   = "field-label";
  searchLabel.textContent = "Punkt-ID suchen";

  const searchRow = document.createElement("div");
  searchRow.style.cssText = "display:flex; gap:4px;";

  const searchInput = document.createElement("input");
  searchInput.type        = "number";
  searchInput.id          = "search-input";
  searchInput.placeholder = "ID…";
  searchInput.min         = "0";
  searchInput.className   = "search-input";

  const searchBtn = document.createElement("button");
  searchBtn.textContent = "→";
  searchBtn.id          = "search-btn";
  searchBtn.className   = "search-btn";

  searchRow.appendChild(searchInput);
  searchRow.appendChild(searchBtn);
  searchWrapper.appendChild(searchLabel);
  searchWrapper.appendChild(searchRow);

  // ── Metriken-Anzeige ───────────────────────────────────────────────────────
  const metrics = document.createElement("div");
  metrics.id          = "metrics";
  metrics.className   = "metrics";
  metrics.textContent = "Metriken: –";

  // ── Punktanzahl-Anzeige ────────────────────────────────────────────────────
  const pointCount = document.createElement("div");
  pointCount.id          = "point-count";
  pointCount.className   = "point-count";
  pointCount.textContent = "0 Punkte";

  // ── CSV-Upload-Button ──────────────────────────────────────────────────────
  const csvWrapper = document.createElement("div");
  csvWrapper.className = "field";

  const csvLabel = document.createElement("span");
  csvLabel.className   = "field-label";
  csvLabel.textContent = "Eigener Datensatz";

  const csvBtn = document.createElement("button");
  csvBtn.textContent = "📂 CSV laden";
  csvBtn.id          = "csv-open-btn";
  csvBtn.className   = "btn btn-warning";

  csvWrapper.appendChild(csvLabel);
  csvWrapper.appendChild(csvBtn);

  // ── Alle Elemente ins Panel einfügen ───────────────────────────────────────
  panel.appendChild(dsWrapper);
  panel.appendChild(mWrapper);
  panel.appendChild(redWrapper);
  panel.appendChild(cmWrapper);
  panel.appendChild(confWrapper);
  panel.appendChild(classWrapper);
  panel.appendChild(errWrapper);
  panel.appendChild(rotWrapper);
  panel.appendChild(resetWrapper);
  panel.appendChild(screenshotWrapper);
  panel.appendChild(compareWrapper);
  panel.appendChild(searchWrapper);
  panel.appendChild(metrics);
  panel.appendChild(pointCount);
  panel.appendChild(csvWrapper);

  return {
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
  };
}

// ── MODELL-DROPDOWN BEFÜLLEN ──────────────────────────────────────────────────

/**
 * Befüllt das Modell-Dropdown dynamisch mit den Modellen aus der JSON-Datei.
 * Wird nach jedem Datensatzwechsel aufgerufen.
 *
 * @param {HTMLSelectElement} mSelect - Das Modell-Dropdown Element
 * @param {Array}             models  - Modell-Objekte aus der JSON-Datei
 */
export function fillModelSelect(mSelect, models) {
  mSelect.innerHTML = "";
  for (const m of models) {
    const opt       = document.createElement("option");
    opt.value       = m.model_name;
    opt.textContent = MODEL_LABELS[m.model_name] ?? m.model_name;
    mSelect.appendChild(opt);
  }
}

// ── METRIKEN AKTUALISIEREN ────────────────────────────────────────────────────

/**
 * Aktualisiert die Metriken-Anzeige im Panel.
 * Zeigt Accuracy, Precision, Recall und F1-Score des aktiven Modells.
 *
 * @param {Object} metricsData - Metriken-Objekt aus der JSON-Datei
 */
export function updateMetrics(metricsData) {
  const el = document.getElementById("metrics");
  if (!el) return;

  if (!metricsData) {
    el.textContent = "Metriken: –";
    return;
  }

  el.innerHTML = `
    <span class="metrics-label">Metriken (Testdaten)</span><br/>
    Accuracy: <b style="color:#e2e8f0;">${(metricsData.accuracy*100).toFixed(1)}%</b>
    &nbsp;|&nbsp;
    Precision: <b style="color:#e2e8f0;">${metricsData.precision.toFixed(3)}</b>
    &nbsp;|&nbsp;
    Recall: <b style="color:#e2e8f0;">${metricsData.recall.toFixed(3)}</b>
    &nbsp;|&nbsp;
    F1: <b style="color:#e2e8f0;">${metricsData.f1.toFixed(3)}</b>
  `;
}

// ── PUNKTANZAHL AKTUALISIEREN ─────────────────────────────────────────────────

/**
 * Aktualisiert die Punktanzahl-Anzeige im Panel.
 *
 * @param {number} visible - Anzahl sichtbarer Punkte
 * @param {number} total   - Gesamtanzahl Punkte
 */
export function updatePointCount(visible, total) {
  const el = document.getElementById("point-count");
  if (el) el.textContent = `${visible} / ${total} Punkte`;
}

// ── INFO-BOX ──────────────────────────────────────────────────────────────────

/**
 * Zeigt die vollständigen Details eines Datenpunkts in der Info-Box.
 * Wird bei Klick auf einen Punkt und bei der ID-Suche aufgerufen.
 *
 * @param {Object} s           - Sample-Objekt aus der JSON-Datei
 * @param {string} dataset     - Name des aktuellen Datensatzes
 * @param {string} modelName   - Name des aktiven Modells
 * @param {string} reduction   - Aktives Reduktionsverfahren
 */
export function showPointDetails(s, dataset, modelName, reduction) {
  const infoBox     = document.getElementById("info-box");
  if (!infoBox) return;

  const statusClass = s.is_correct ? "info-correct" : "info-incorrect";
  const statusText  = s.is_correct
    ? "✓ Korrekt klassifiziert"
    : "✗ Fehlklassifiziert";

  // Feature-Werte anzeigen (max. 6)
  let featuresHTML = "";
  if (s.features) {
    const entries = Object.entries(s.features).slice(0, 6);
    featuresHTML = `
      <div style="margin-top:8px;padding-top:8px;
        border-top:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:11px;color:#64748b;font-weight:600;">Features</span><br/>
        ${entries.map(([k, v]) =>
          `<span class="info-label">${k}:</span> <b>${Number(v).toFixed(3)}</b><br/>`
        ).join("")}
      </div>
    `;
  }

  infoBox.innerHTML = `
    <div class="info-box-title">Punkt-Details</div>
    <span class="info-label">Datensatz:</span> <b>${dataset}</b><br/>
    <span class="info-label">Modell:</span> <b>${MODEL_LABELS[modelName] ?? modelName}</b><br/>
    <span class="info-label">Reduktion:</span> <b>${reduction.toUpperCase()}</b><br/>
    <span class="info-label">ID:</span> <b>${s.id}</b><br/>
    <span class="info-label">Wahre Klasse:</span> <b>${s.true_label}</b><br/>
    <span class="info-label">Vorhersage:</span> <b>${s.predicted_label}</b><br/>
    <span class="info-label">Konfidenz:</span> <b>${(s.confidence*100).toFixed(1)}%</b><br/>
    <span class="${statusClass}">${statusText}</span>
    ${featuresHTML}
  `;
}

/**
 * Setzt die Info-Box auf den Standardtext zurück.
 * Wird beim Klick auf einen leeren Bereich aufgerufen.
 */
export function resetInfoBox() {
  const infoBox = document.getElementById("info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div class="info-box-title">Punkt-Details</div>
      <span class="info-label">Klicke auf einen Punkt.</span>
    `;
  }
}

// ── TOOLTIP ───────────────────────────────────────────────────────────────────

/**
 * Zeigt den Hover-Tooltip mit Kurzinformation zum Datenpunkt.
 *
 * @param {Object} s  - Sample-Objekt
 * @param {number} cx - Maus X-Position
 * @param {number} cy - Maus Y-Position
 */
export function showTooltip(s, cx, cy) {
  const tt = document.getElementById("tooltip");
  if (!tt) return;

  const statusColor = s.is_correct ? "#34d399" : "#f87171";
  const statusText  = s.is_correct ? "✓ Korrekt" : "✗ Falsch";

  tt.style.display = "block";
  tt.style.left    = (cx + 14) + "px";
  tt.style.top     = (cy - 10) + "px";
  tt.innerHTML = `
    <b style="color:#a5b4fc;">Punkt #${s.id}</b><br/>
    Wahr: <b>${s.true_label}</b><br/>
    Pred: <b>${s.predicted_label}</b><br/>
    Konfidenz: <b>${(s.confidence*100).toFixed(1)}%</b><br/>
    <span style="color:${statusColor};">${statusText}</span>
  `;
}

/**
 * Versteckt den Hover-Tooltip.
 */
export function hideTooltip() {
  const tt = document.getElementById("tooltip");
  if (tt) tt.style.display = "none";
}

// ── CSV-UPLOAD DIALOG ─────────────────────────────────────────────────────────

/**
 * Initialisiert den CSV-Upload-Dialog.
 * Verbindet die Buttons im Modal mit der Upload-Logik.
 * Der Dialog ist bereits in index.html definiert.
 *
 * @param {Function} onDataLoaded - Callback wenn CSV erfolgreich verarbeitet wurde
 */
export function initCSVUpload(onDataLoaded) {
  const modal     = document.getElementById("csv-modal");
  const openBtn   = document.getElementById("csv-open-btn");
  const cancelBtn = document.getElementById("csv-cancel-btn");
  const loadBtn   = document.getElementById("csv-load-btn");
  const fileInput = document.getElementById("csv-file-input");
  const colInfo   = document.getElementById("csv-columns-info");
  const colSel    = document.getElementById("csv-target-column");
  const fileInfo  = document.getElementById("csv-file-info");
  const status    = document.getElementById("csv-status");

  // Modal öffnen
  openBtn.addEventListener("click", () => {
    modal.classList.add("active");
  });

  // Modal schließen
  cancelBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });

  // Datei ausgewählt → Spalten laden
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    status.textContent = "Lese Spalten…";
    colInfo.style.display = "none";

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res  = await fetch(`${BACKEND_URL}/api/csv-columns`, {
        method: "POST",
        body:   formData,
      });
      const data = await res.json();

      if (data.error) {
        status.innerHTML = `<span style="color:#f87171;">❌ ${data.error}</span>`;
        return;
      }

      // Spalten-Dropdown befüllen
      colSel.innerHTML = "";
      for (const col of data.columns) {
        const opt       = document.createElement("option");
        opt.value       = col;
        opt.textContent = col;
        colSel.appendChild(opt);
      }

      fileInfo.textContent      = `${data.n_rows} Zeilen · ${data.n_cols} Spalten`;
      colInfo.style.display     = "block";
      status.textContent        = "";
      loadBtn.disabled          = false;
      loadBtn.style.opacity     = "1";

    } catch {
      status.innerHTML = `
        <span style="color:#f87171;">❌ Backend nicht erreichbar.<br/>
        Starte: <code>cd backend && python app.py</code></span>
      `;
    }
  });

  // Laden & Visualisieren
  loadBtn.addEventListener("click", async () => {
    const file   = fileInput.files[0];
    const target = colSel.value;
    if (!file) return;

    status.innerHTML  = `<span style="color:#a5b4fc;">⏳ Berechne PCA, UMAP und t-SNE…<br/>Das kann 1–2 Minuten dauern.</span>`;
    loadBtn.disabled  = true;

    try {
      const formData = new FormData();
      formData.append("file",          file);
      formData.append("target_column", target);

      const res  = await fetch(`${BACKEND_URL}/api/upload-csv`, {
        method: "POST",
        body:   formData,
      });
      const data = await res.json();

      if (data.error) {
        status.innerHTML = `<span style="color:#f87171;">❌ ${data.error}</span>`;
        loadBtn.disabled = false;
        return;
      }

      modal.classList.remove("active");
      onDataLoaded(data);

    } catch (err) {
      status.innerHTML = `<span style="color:#f87171;">❌ Fehler: ${err.message}</span>`;
      loadBtn.disabled = false;
    }
  });
}