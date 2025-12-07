"""
Ce script prépare des fichiers JSON quotidiens propres à partir d’un fichier Excel
contenant des données énergétiques (consommation, production, prévisions, etc.). 
Il réalise plusieurs étapes :
1. Chargement et préparation des données
2. Analyse exploratoire des données (EDA)
3. Détection de jours anormaux :
     - jours contenant des valeurs manquantes (NaN) dans les colonnes critiques
     - jours présentant une volatilité anormale entre production et consommation (écart "gap")
4. Visualisation des jours anormaux
5. Génération de fichiers JSON propres pour les jours valides seulement

Les fichiers JSON nettoyés sont destinés à être utilisés dans des visualisations D3.js.
"""

import pandas as pd
import numpy as np
from pathlib import Path
import json
import matplotlib.pyplot as plt

# ================================
# 0. Définition des chemins
# ================================
DATA_DIR = Path("data")
EXCEL_PATH = DATA_DIR / "Book1.xlsx"

# ================================
# 1. Lecture du fichier Excel & préparation des données
# ================================
df = pd.read_excel(EXCEL_PATH)

# Conversion unifiée de la colonne temporelle
df["datetime"] = pd.to_datetime(df["Date - Heure"])

# Colonnes nécessaires pour l'analyse et la visualisation
cols = [
    "datetime",
    "Consommation (MW)",
    "Prévision J-1 (MW)",
    "Prévision J (MW)",
    "Fioul (MW)",
    "Charbon (MW)",
    "Gaz (MW)",
    "Nucléaire (MW)",
    "Eolien (MW)",
    "Solaire (MW)",
    "Hydraulique (MW)",
    "Bioénergies (MW)",
    # ajouts pour module flux
    "Ech. comm. Angleterre (MW)",
    "Ech. comm. Espagne (MW)",
    "Ech. comm. Italie (MW)",
    "Ech. comm. Suisse (MW)",
    "Ech. comm. Allemagne-Belgique (MW)",
    "Taux de CO2 (g/kWh)"
]
small = df[cols].copy()

# ================================
# 2. Calcul de la production totale
# ================================
small["Production_totale (MW)"] = (
    small["Fioul (MW)"]
    + small["Charbon (MW)"]
    + small["Gaz (MW)"]
    + small["Nucléaire (MW)"]
    + small["Eolien (MW)"]
    + small["Solaire (MW)"]
    + small["Hydraulique (MW)"]
    + small["Bioénergies (MW)"]
)

# Ajout de la date et du gap (production - consommation)
small["date"] = small["datetime"].dt.date
small["gap"] = small["Production_totale (MW)"] - small["Consommation (MW)"]

# ================================
# 3. EDA : Analyse des valeurs manquantes (NaN)
# ================================

# Proportion de NaN par jour (utilisée pour les graphiques)
nan_stats = small.groupby("date").apply(lambda g: g.isna().mean())

# Colonnes critiques : si NaN dans ces colonnes, le jour est considéré anormal
critical_cols = ["Consommation (MW)", "Production_totale (MW)"]

# Détection des jours contenant des NaN critiques
nan_any_by_day = small.groupby("date")[critical_cols].apply(
    lambda g: g.isna().any().any()
)

nan_abnormal_days = nan_any_by_day[nan_any_by_day].index.tolist()

# ================================
# 4. EDA : Détection des jours à volatilité anormale (gap)
# ================================
gap_std_by_day = small.groupby("date")["gap"].std()

# Règle de détection : seuil = moyenne + 3 écarts-types (méthode 3σ)
gap_threshold = gap_std_by_day.mean() + 3 * gap_std_by_day.std()

gap_abnormal_days = gap_std_by_day[gap_std_by_day > gap_threshold].index.tolist()

# ================================
# 5. Fusion des jours anormaux & écriture du journal
# ================================
abnormal_days = sorted(set(nan_abnormal_days) | set(gap_abnormal_days))

logs_dir = Path("logs")
logs_dir.mkdir(exist_ok=True)

with (logs_dir / "abnormal_days.txt").open("w", encoding="utf-8") as f:
    f.write("# Liste des jours anormaux (NaN critiques + volatilité du gap)\n")
    f.write("# Jours anormaux (NaN): {}\n".format(len(nan_abnormal_days)))
    f.write("# Jours anormaux (gap): {}\n".format(len(gap_abnormal_days)))
    f.write("# Total (jours uniques): {}\n\n".format(len(abnormal_days)))
    for d in abnormal_days:
        f.write(str(d) + "\n")

print(f"{len(abnormal_days)} jours anormaux détectés. Voir logs/abnormal_days.txt")

# ================================
# 6. Visualisation : uniquement les jours anormaux
# ================================
charts_dir = Path("charts")
charts_dir.mkdir(exist_ok=True)

# --- 6.1 Proportion de NaN (jours anormaux uniquement) ---
if nan_abnormal_days:
    abnormal_nan_stats = nan_stats.loc[nan_abnormal_days]

    plt.figure(figsize=(10, 5))
    plt.bar(
        abnormal_nan_stats.index.astype(str),
        abnormal_nan_stats.mean(axis=1)
    )
    plt.xticks(rotation=45, ha="right")
    plt.ylabel("Proportion de NaN")
    plt.title("Jours anormaux - Valeurs manquantes")
    plt.tight_layout()
    plt.savefig(charts_dir / "nan_ratio_abnormal_only.png")
    plt.close()

    print("Graphique créé : charts/nan_ratio_abnormal_only.png")

# --- 6.2 Volatilité du gap (jours anormaux uniquement) ---
if gap_abnormal_days:
    abnormal_gap_std = gap_std_by_day.loc[gap_abnormal_days]

    plt.figure(figsize=(10, 5))
    plt.plot(
        abnormal_gap_std.index.astype(str),
        abnormal_gap_std.values,
        marker="o",
        linestyle="--",
        label="Jours anormaux"
    )
    plt.xticks(rotation=45, ha="right")
    plt.ylabel("Écart-type du gap")
    plt.title("Jours anormaux - Volatilité du gap (Production - Consommation)")
    plt.legend()
    plt.tight_layout()
    plt.savefig(charts_dir / "gap_volatility_abnormal_only.png")
    plt.close()

    print("Graphique créé : charts/gap_volatility_abnormal_only.png")

# ================================
# 7. Génération des fichiers JSON propres
# ================================
out_dir = DATA_DIR / "dailydata_clean"
out_dir.mkdir(parents=True, exist_ok=True)

all_days = sorted(small["date"].unique())
clean_days = [d for d in all_days if d not in abnormal_days]

print(f"{len(all_days)} jours détectés, dont {len(clean_days)} jours valides.")

for date in clean_days:
    group = small[small["date"] == date].copy()

    # Double sécurité : suppression des lignes restantes contenant des NaN critiques
    group = group.dropna(subset=["Consommation (MW)", "Production_totale (MW)"])

    if group.empty:
        print(f"[Avertissement] Aucun enregistrement valable pour {date}, ignoré.")
        continue

    out = group[[
        "datetime",
        "Consommation (MW)",
        "Production_totale (MW)",
        "Prévision J-1 (MW)",
        "Prévision J (MW)",
        # ajouts pour module flux
        "Ech. comm. Angleterre (MW)",
        "Ech. comm. Espagne (MW)",
        "Ech. comm. Italie (MW)",
        "Ech. comm. Suisse (MW)",
        "Ech. comm. Allemagne-Belgique (MW)",
        "Taux de CO2 (g/kWh)"
    ]].copy()

    # Format HH:MM pour D3.js
    out["time"] = out["datetime"].dt.strftime("%H:%M")

    # Renommage des colonnes pour le front-end
    out = out.rename(columns={
        "Consommation (MW)": "load",
        "Production_totale (MW)": "production",
        "Prévision J-1 (MW)": "forecast_d1",
        "Prévision J (MW)": "forecast_d",
        # ajouts pour module flux
        "Ech. comm. Angleterre (MW)": "exch_uk",
        "Ech. comm. Espagne (MW)": "exch_es",
        "Ech. comm. Italie (MW)": "exch_it",
        "Ech. comm. Suisse (MW)": "exch_ch",
        "Ech. comm. Allemagne-Belgique (MW)": "exch_de_be",
        "Taux de CO2 (g/kWh)": "co2_rate"
    })

    # Liste des champs à conserver dans le JSON
    fields = [
        "time", "load", "production", "forecast_d1", "forecast_d",
        "exch_uk", "exch_es", "exch_it", "exch_ch", "exch_de_be", "co2_rate"
    ]
    
    records = out[fields].to_dict(orient="records")

    fname = out_dir / f"day_{date}.json"
    with fname.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

print("Fichiers JSON propres générés dans data/dailydata_clean/")