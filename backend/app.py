from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import numpy as np
import pandas as pd
import tempfile
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ml_pipeline'))
from train_export_datasets import export_dataset
from sklearn.preprocessing import LabelEncoder

app   = Flask(__name__)
CORS(app)

MAX_SAMPLES = 5000

@app.route('/api/csv-columns', methods=['POST'])
def get_csv_columns():
    if 'file' not in request.files:
        return jsonify({"error": "Keine Datei"}), 400
    file = request.files['file']
    try:
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as tmp:
            file.save(tmp.name)
            df = pd.read_csv(tmp.name)
            os.unlink(tmp.name)
        return jsonify({
            "columns": list(df.columns),
            "n_rows":  int(len(df)),
            "n_cols":  int(len(df.columns))
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({"error": "Keine Datei"}), 400

    file          = request.files['file']
    target_column = request.form.get('target_column', '')

    try:
        # CSV temporär speichern
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as tmp:
            file.save(tmp.name)
            df = pd.read_csv(tmp.name)
            os.unlink(tmp.name)

        if target_column not in df.columns:
            return jsonify({"error": f"Spalte '{target_column}' nicht gefunden"}), 400

        y_raw         = df[target_column].values
        X_df          = df.drop(columns=[target_column])
        X_df          = X_df.select_dtypes(include=[np.number])
        feature_names = list(X_df.columns)
        X             = X_df.values

        if X.shape[0] < 10:
            return jsonify({"error": "Zu wenig Datenpunkte (min. 10)"}), 400
        if X.shape[1] < 2:
            return jsonify({"error": "Zu wenig numerische Features (min. 2)"}), 400

        # Große Datensätze begrenzen für Performance
        # MAX_SAMPLES = 5000 definiert
        if X.shape[0] > MAX_SAMPLES:
            print(f"   ⚠️ {X.shape[0]} Samples → reduziert auf {MAX_SAMPLES}")
            idx   = np.random.choice(X.shape[0], MAX_SAMPLES, replace=False)
            X     = X[idx]
            y_raw = y_raw[idx]

        le          = LabelEncoder()
        y           = le.fit_transform(y_raw)
        class_names = list(le.classes_)

        # Max 12 Klassen
        if len(class_names) > 12:
            return jsonify({
                "error": f"Zu viele Klassen ({len(class_names)}). Max. 12. Wähle andere Zielspalte."
            }), 400

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_json:
            tmp_json_path = tmp_json.name

        export_dataset(
            name=file.filename.replace('.csv', ''),
            X=X,
            y=y,
            feature_names=feature_names,
            class_names=class_names,
            out_path=tmp_json_path
        )

        with open(tmp_json_path, 'r') as f:
            result = json.load(f)
        os.unlink(tmp_json_path)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("Backend läuft auf http://localhost:5001")
    app.run(debug=True, port=5001, threaded=True)

#if __name__ == '__main__':
   # port = int(os.environ.get("PORT", 5001))
   # app.run(host="0.0.0.0", port=port, debug=False)