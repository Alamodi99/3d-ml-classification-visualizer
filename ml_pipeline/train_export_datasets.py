import json
import numpy as np

from sklearn.datasets import load_iris, load_wine, load_breast_cancer
from sklearn.decomposition import PCA
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC


RANDOM_STATE = 42


def build_models():
    return {
        "logistic_regression": Pipeline([
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(max_iter=3000, random_state=RANDOM_STATE))
        ]),
        "random_forest": RandomForestClassifier(n_estimators=300, random_state=RANDOM_STATE),
        "svm_rbf": Pipeline([
            ("scaler", StandardScaler()),
            ("model", SVC(kernel="rbf", probability=True, random_state=RANDOM_STATE))
        ])
    }


def pca_3d_positions(X: np.ndarray) -> np.ndarray:
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("pca", PCA(n_components=3, random_state=RANDOM_STATE))
    ])
    return pipe.fit_transform(X)


def export_dataset(name: str, X: np.ndarray, y: np.ndarray, feature_names, class_names, out_path: str):
    # PCA -> 3D
    positions_3d = pca_3d_positions(X)

    # Split (für stabile Modelle; wir exportieren trotzdem alle Samples)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=RANDOM_STATE, stratify=y
    )

    models = build_models()

    export_data = {
        "dataset": name,
        "n_samples": int(X.shape[0]),
        "n_features": int(X.shape[1]),
        "feature_names": list(feature_names),
        "class_names": list(class_names),
        "embedding": "pca_3d",
        "models": []
    }

    for model_name, model in models.items():
        model.fit(X_train, y_train)

        preds = model.predict(X)
        probas = model.predict_proba(X)
        conf = np.max(probas, axis=1)

        samples = []
        for i in range(len(X)):
            samples.append({
                "id": int(i),
                "true_label": str(class_names[int(y[i])]),
                "predicted_label": str(class_names[int(preds[i])]),
                "confidence": float(conf[i]),
                "is_correct": bool(int(preds[i]) == int(y[i])),
                "position": [
                    float(positions_3d[i, 0]),
                    float(positions_3d[i, 1]),
                    float(positions_3d[i, 2]),
                ],
                "features": {str(feature_names[j]): float(X[i, j]) for j in range(X.shape[1])}
            })

        export_data["models"].append({
            "model_name": model_name,
            "samples": samples
        })

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)

    print(f"✅ Export: {out_path}")


def main():
    # Iris
    iris = load_iris()
    export_dataset(
        name="iris",
        X=iris.data,
        y=iris.target,
        feature_names=iris.feature_names,
        class_names=iris.target_names,
        out_path="exports/iris_models_3d.json"
    )

    # Wine
    wine = load_wine()
    # wine.target_names ist je nach sklearn z.B. ['class_0', ...] oder echte Klassenbezeichner
    export_dataset(
        name="wine",
        X=wine.data,
        y=wine.target,
        feature_names=wine.feature_names,
        class_names=wine.target_names,
        out_path="exports/wine_models_3d.json"
    )

    # Breast Cancer
    cancer = load_breast_cancer()
    export_dataset(
        name="breast_cancer",
        X=cancer.data,
        y=cancer.target,
        feature_names=cancer.feature_names,
        class_names=cancer.target_names,
        out_path="exports/breast_cancer_models_3d.json"
    )


if __name__ == "__main__":
    main()
