# Interaktive 3D-Visualisierung von Klassifikationsergebnissen


## Projektstruktur

| Ordner | Beschreibung |
|--------|-------------|
| `ml_pipeline/` | Python ML-Pipeline: Training + PCA + UMAP + t-SNE Export |
| `backend/` | Flask REST API für CSV-Upload eigener Datensätze |
| `data/` | Exportierte JSON-Datensätze (4 Datensätze × 4 Modelle) |
| `frontend/` | Interaktive Three.js 3D-Webanwendung |

## Datensätze

| Datensatz | Samples | Features | Klassen |
|-----------|---------|----------|---------|
| Iris | 150 | 4 | 3 |
| Wine | 178 | 13 | 3 |
| Breast Cancer | 569 | 30 | 2 |
| Digits | 1797 | 64 | 10 |

## Klassifikationsmodelle

- Logistic Regression
- Random Forest
- SVM (RBF Kernel)
- K-Nearest Neighbors (k=5)

## Dimensionsreduktion

- PCA (Principal Component Analysis)
- UMAP (Uniform Manifold Approximation)
- t-SNE (t-distributed Stochastic Neighbor Embedding)

## Setup und Ausführung

### 1. ML-Pipeline ausführen
```bash
cd ml_pipeline
pip install -r requirements.txt
python train_export_datasets.py
cp ../data/*.json ../frontend/public/
```

### 2. Backend starten (für CSV-Upload)
```bash
cd backend
pip install -r requirements.txt
python app.py
# Läuft auf http://localhost:5001
```

### 3. Frontend starten
```bash
cd frontend
npm install
npm run dev
# Läuft auf http://localhost:5173
```

## Tech-Stack

| Komponente | Technologie |
|------------|-------------|
| ML & Datenverarbeitung | Python, scikit-learn, UMAP, t-SNE |
| Backend API | Flask, Flask-CORS, pandas |
| 3D-Visualisierung | Three.js (r128), WebGL |
| Build-Tool | Vite |
| Steuerung | Vanilla JavaScript |
