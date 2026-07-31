"""
export_pipeline.py

Export-Pipeline zur Vorbereitung von Klassifikations- und
Dimensionsreduktions-Ergebnissen (PCA, UMAP, t-SNE) für eine
Web-Visualisierung. Trainiert mehrere Standardklassifikatoren auf
verschiedenen Benchmark-Datensätzen und exportiert Vorhersagen,
Metriken sowie 3D-Positionen als JSON.
"""

import json
import logging
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd

from sklearn.datasets import load_iris, load_wine, load_breast_cancer, load_digits
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.manifold import TSNE
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.svm import SVC
from umap import UMAP

# ── LOGGING-KONFIGURATION ─────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── KONFIGURATION ────────────────────────────────────────────────────────

RANDOM_STATE = 42
EXPORT_DIR = Path("../exports")


# ── KLASSIFIKATOREN ──────────────────────────────────────────────────────

def build_models() -> dict[str, Pipeline]:
    """
    Erstellt ein Dictionary mit allen Klassifikationsmodellen.

    Jedes Modell ist in einer Pipeline mit StandardScaler gekapselt,
    um eine einheitliche Vorverarbeitung sicherzustellen.

    Returns:
        Dictionary mit Modellname -> sklearn Pipeline.
    """
    return {
        "logistic_regression": Pipeline([
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(max_iter=3000, random_state=RANDOM_STATE)),
        ]),
        "random_forest": Pipeline([
            ("scaler", StandardScaler()),
            ("model", RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE)),
        ]),
        "svm_rbf": Pipeline([
            ("scaler", StandardScaler()),
            ("model", SVC(kernel="rbf", probability=True, random_state=RANDOM_STATE)),
        ]),
        "knn": Pipeline([
            ("scaler", StandardScaler()),
            ("model", KNeighborsClassifier(n_neighbors=5)),
        ]),
    }


# ── DIMENSIONSREDUKTION ──────────────────────────────────────────────────

def reduce_pca(X: np.ndarray) -> np.ndarray:
    """
    Reduziert die Dimensionen auf 3 mittels PCA (Principal Component Analysis).

    PCA ist linear, deterministisch und sehr schnell.
    Maximiert die erklärte Varianz der Daten.

    Args:
        X: Feature-Matrix der Form (n_samples, n_features).

    Returns:
        3D-Koordinaten der Form (n_samples, 3).
    """
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("pca", PCA(n_components=3, random_state=RANDOM_STATE)),
    ])
    return pipeline.fit_transform(X)


def reduce_umap(X: np.ndarray) -> np.ndarray:
    """
    Reduziert die Dimensionen auf 3 mittels UMAP.

    UMAP (Uniform Manifold Approximation and Projection) ist nicht-linear
    und bewahrt lokale Nachbarschaftsstrukturen. Erzeugt häufig klarere
    Cluster als PCA.

    Args:
        X: Feature-Matrix der Form (n_samples, n_features).

    Returns:
        3D-Koordinaten der Form (n_samples, 3).
    """
    X_scaled = StandardScaler().fit_transform(X)

    reducer = UMAP(
        n_components=3,
        n_neighbors=15,
        min_dist=0.1,
        random_state=RANDOM_STATE,
    )
    return reducer.fit_transform(X_scaled)


def reduce_tsne(X: np.ndarray) -> np.ndarray:
    """
    Reduziert die Dimensionen auf 3 mittels t-SNE.

    t-SNE (t-distributed Stochastic Neighbor Embedding) ist nicht-linear
    und eignet sich besonders gut, um lokale Cluster-Strukturen in
    hochdimensionalen Daten sichtbar zu machen. Bei hochdimensionalen
    Daten (> 50 Features) wird zunächst eine PCA auf 50 Dimensionen
    angewendet (Standard-Trick zur Verbesserung von Laufzeit und Stabilität).

    Args:
        X: Feature-Matrix der Form (n_samples, n_features).

    Returns:
        3D-Koordinaten der Form (n_samples, 3).
    """
    X_scaled = StandardScaler().fit_transform(X)

    if X_scaled.shape[1] > 50:
        X_scaled = PCA(n_components=50, random_state=RANDOM_STATE).fit_transform(X_scaled)

    reducer = TSNE(
        n_components=3,
        perplexity=30,
        max_iter=1000,
        random_state=RANDOM_STATE,
        verbose=0,
    )
    return reducer.fit_transform(X_scaled)


# ── EXPORT-PIPELINE ──────────────────────────────────────────────────────

def export_dataset(
    name: str,
    X: np.ndarray,
    y: np.ndarray,
    feature_names: Sequence[str],
    class_names: Sequence[str],
    out_path: str | Path,
) -> None:
    """
    Vollständige Export-Pipeline für einen Datensatz.

    Ablauf:
        1. Dimensionsreduktion auf 3D mittels PCA, UMAP und t-SNE.
        2. Training aller Klassifikatoren aus ``build_models``.
        3. Berechnung von Metriken auf einem Testdatensplit.
        4. Export der Ergebnisse als JSON für die Web-Visualisierung.

    Args:
        name: Bezeichner des Datensatzes (z. B. "iris").
        X: Feature-Matrix.
        y: Ziel-Labels (numerisch kodiert).
        feature_names: Namen der Features.
        class_names: Namen der Klassen.
        out_path: Zielpfad der JSON-Ausgabedatei.
    """
    logger.info("Verarbeite Datensatz: %s", name.upper())
    logger.info(
        "Samples: %d | Features: %d | Klassen: %d",
        X.shape[0], X.shape[1], len(set(y)),
    )

    logger.info("Berechne PCA...")
    positions_pca = reduce_pca(X)

    logger.info("Berechne UMAP...")
    positions_umap = reduce_umap(X)

    logger.info("Berechne t-SNE...")
    positions_tsne = reduce_tsne(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.25,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    models = build_models()

    export_data = {
        "dataset": name,
        "n_samples": int(X.shape[0]),
        "n_features": int(X.shape[1]),
        "n_classes": int(len(set(y))),
        "feature_names": list(feature_names),
        "class_names": [str(c) for c in class_names],
        "reductions": ["pca", "umap", "tsne"],
        "models": [],
    }

    for model_name, model in models.items():
        logger.info("Trainiere Modell: %s", model_name)
        model.fit(X_train, y_train)

        y_pred_test = model.predict(X_test)
        metrics = {
            "accuracy": float(accuracy_score(y_test, y_pred_test)),
            "precision": float(precision_score(y_test, y_pred_test, average="weighted", zero_division=0)),
            "recall": float(recall_score(y_test, y_pred_test, average="weighted", zero_division=0)),
            "f1": float(f1_score(y_test, y_pred_test, average="weighted", zero_division=0)),
        }

        preds = model.predict(X)
        probas = model.predict_proba(X)
        confidence = np.max(probas, axis=1)

        samples = []
        for i in range(len(X)):
            samples.append({
                "id": int(i),
                "true_label": str(class_names[int(y[i])]),
                "predicted_label": str(class_names[int(preds[i])]),
                "confidence": float(confidence[i]),
                "is_correct": bool(int(preds[i]) == int(y[i])),
                # PCA-Position: linear, maximiert erklärte Varianz
                "position_pca": [float(v) for v in positions_pca[i]],
                # UMAP-Position: nicht-linear, bewahrt Nachbarschaftsstruktur
                "position_umap": [float(v) for v in positions_umap[i]],
                # t-SNE-Position: nicht-linear, optimiert lokale Cluster
                "position_tsne": [float(v) for v in positions_tsne[i]],
                # Rückwärtskompatibilität: Standardposition entspricht PCA
                "position": [float(v) for v in positions_pca[i]],
                # Feature-Werte für die Detailanzeige (max. 10 Features)
                "features": {
                    str(feature_names[j]): float(X[i, j])
                    for j in range(min(X.shape[1], 10))
                },
            })

        export_data["models"].append({
            "model_name": model_name,
            "metrics": metrics,
            "samples": samples,
        })

        logger.info("Accuracy (%s): %.1f%%", model_name, metrics["accuracy"] * 100)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)

    logger.info("Exportiert nach: %s", out_path)


def export_from_csv(csv_path: str | Path, target_column: str, out_path: str | Path) -> None:
    """
    Exportiert einen beliebigen CSV-Datensatz für die Web-Visualisierung.

    Ermöglicht es, eigene (nicht vordefinierte) Datensätze zu visualisieren.

    Args:
        csv_path: Pfad zur CSV-Datei.
        target_column: Name der Zielspalte (Klassen-Label).
        out_path: Zielpfad der JSON-Ausgabedatei.
    """
    csv_path = Path(csv_path)
    df = pd.read_csv(csv_path)

    y_raw = df[target_column].values
    X_df = df.drop(columns=[target_column])
    feature_names = list(X_df.columns)

    # Nur numerische Spalten verwenden
    X_df = X_df.select_dtypes(include=[np.number])
    X = X_df.values

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)
    class_names = list(label_encoder.classes_)

    export_dataset(
        name=csv_path.stem,
        X=X,
        y=y,
        feature_names=feature_names,
        class_names=class_names,
        out_path=out_path,
    )


# ── MAIN ──────────────────────────────────────────────────────────────────

def main() -> None:
    """Exportiert alle vier Standard-Datensätze mit PCA-, UMAP- und t-SNE-Reduktion."""
    logger.info("Starte ML-Export-Pipeline (PCA + UMAP + t-SNE)")

    # Iris: klassischer Benchmark-Datensatz (150 Samples, 4 Features, 3 Klassen)
    iris = load_iris()
    export_dataset(
        name="iris",
        X=iris.data,
        y=iris.target,
        feature_names=iris.feature_names,
        class_names=iris.target_names,
        out_path=EXPORT_DIR / "iris_models_3d.json",
    )

    # Wine: chemische Analyse von Weinen (178 Samples, 13 Features, 3 Klassen)
    wine = load_wine()
    export_dataset(
        name="wine",
        X=wine.data,
        y=wine.target,
        feature_names=wine.feature_names,
        class_names=wine.target_names,
        out_path=EXPORT_DIR / "wine_models_3d.json",
    )

    # Breast Cancer: Tumorklassifikation (569 Samples, 30 Features, 2 Klassen)
    cancer = load_breast_cancer()
    export_dataset(
        name="breast_cancer",
        X=cancer.data,
        y=cancer.target,
        feature_names=cancer.feature_names,
        class_names=cancer.target_names,
        out_path=EXPORT_DIR / "breast_cancer_models_3d.json",
    )

    # Digits: handgeschriebene Ziffern (1797 Samples, 64 Features, 10 Klassen)
    digits = load_digits()
    export_dataset(
        name="digits",
        X=digits.data,
        y=digits.target,
        feature_names=[f"pixel_{i}" for i in range(digits.data.shape[1])],
        class_names=[str(i) for i in range(10)],
        out_path=EXPORT_DIR / "digits_models_3d.json",
    )

    logger.info("Alle Datensätze erfolgreich exportiert.")
    logger.info("PCA-, UMAP- und t-SNE-Positionen sind in den JSON-Dateien enthalten.")


if __name__ == "__main__":
    main()