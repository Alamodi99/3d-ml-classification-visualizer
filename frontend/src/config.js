// ── KONFIGURATION ─────────────────────────────────────────────────────────────

/**
 * Verfügbare Datensätze.
 * Jede JSON-Datei enthält PCA-, UMAP- und t-SNE-Positionen sowie
 * Klassifikationsergebnisse von 4 verschiedenen Modellen.
 * Neue Datensätze können hier einfach ergänzt werden.
 */
export const DATASETS = [
  { key: "iris",          label: "Iris",          file: "/iris_models_3d.json"          },
  { key: "wine",          label: "Wine",          file: "/wine_models_3d.json"          },
  { key: "breast_cancer", label: "Breast Cancer", file: "/breast_cancer_models_3d.json" },
  { key: "digits",        label: "Digits (0–9)",  file: "/digits_models_3d.json"        },
];

/**
 * Lesbare Bezeichnungen für die Klassifikationsmodelle.
 * Wird für das Modell-Dropdown verwendet.
 */
export const MODEL_LABELS = {
  logistic_regression: "Logistic Regression",
  random_forest:       "Random Forest",
  svm_rbf:             "SVM (RBF)",
  knn:                 "kNN",
};

/**
 * Farbpalette für bis zu 12 Klassen.
 * Funktioniert generisch für jeden Datensatz —
 * unabhängig von Klassenbezeichnungen oder Anzahl.
 */
export const PALETTE = [
  0x6366f1, 0x34d399, 0xfbbf24, 0xf87171,
  0xa78bfa, 0x38bdf8, 0xfb923c, 0xe879f9,
  0x4ade80, 0xf43f5e, 0x06b6d4, 0xeab308,
];

/**
 * Flask Backend URL für CSV-Upload eigener Datensätze.
 */
//export const BACKEND_URL = "http://localhost:5001";

export const BACKEND_URL = "https://threed-ml-classification-visualizer.onrender.com";