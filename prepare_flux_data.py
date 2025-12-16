"""
Script spécifique pour le module FLUX (Groupe 14).
Objectif : Extraire uniquement les données d'échanges transfrontaliers et de CO2.
Sortie : Fichiers JSON légers dans le dossier 'data/flux_data/'.
"""

import pandas as pd
import json
from pathlib import Path

# ==========================================
# 1. CONFIGURATION
# ==========================================
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
INPUT_FILE = DATA_DIR / "Book1.xlsx"
OUTPUT_DIR = DATA_DIR / "flux_data"  # Nouveau dossier spécifique

# Création du dossier de sortie s'il n'existe pas
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"--- Démarrage de l'extraction des données FLUX ---")
print(f"Source : {INPUT_FILE}")
print(f"Destination : {OUTPUT_DIR}")

# ==========================================
# 2. CHARGEMENT ET NETTOYAGE
# ==========================================
# Lecture du fichier Excel
try:
    df = pd.read_excel(INPUT_FILE)
except FileNotFoundError:
    print("ERREUR : Le fichier Book1.xlsx est introuvable dans le dossier data/")
    exit()

# Conversion de la date
df["datetime"] = pd.to_datetime(df["Date - Heure"])

# Sélection UNIQUEMENT des colonnes nécessaires pour ta partie
# Cela permet d'avoir des fichiers très légers
cols_to_keep = [
    "datetime",
    "Ech. comm. Angleterre (MW)",
    "Ech. comm. Espagne (MW)",
    "Ech. comm. Italie (MW)",
    "Ech. comm. Suisse (MW)",
    "Ech. comm. Allemagne-Belgique (MW)",
    "Taux de CO2 (g/kWh)"
]

# On crée un sous-dataframe propre
flux_df = df[cols_to_keep].copy()

# Renommage pour le frontend (noms courts pour le JS)
flux_df = flux_df.rename(columns={
    "Ech. comm. Angleterre (MW)": "exch_uk",
    "Ech. comm. Espagne (MW)": "exch_es",
    "Ech. comm. Italie (MW)": "exch_it",
    "Ech. comm. Suisse (MW)": "exch_ch",
    "Ech. comm. Allemagne-Belgique (MW)": "exch_de_be",
    "Taux de CO2 (g/kWh)": "co2_rate"
})

# Ajout d'une colonne "time" format HH:MM pour l'affichage D3
flux_df["time"] = flux_df["datetime"].dt.strftime("%H:%M")
flux_df["date_str"] = flux_df["datetime"].dt.strftime("%Y-%m-%d")

# ==========================================
# 3. GÉNÉRATION DES FICHIERS JSON
# ==========================================
# Liste des jours uniques
days = flux_df["date_str"].unique()
count = 0

for day in days:
    # Filtrer les données pour ce jour
    daily_data = flux_df[flux_df["date_str"] == day].copy()
    
    # Vérification : si le jour est vide ou plein de NaN sur les échanges, on peut l'ignorer
    # Ici on garde tout, le JS gérera les nulls
    
    # Sélection des colonnes finales pour le JSON
    json_data = daily_data[[
        "time", 
        "exch_uk", "exch_es", "exch_it", "exch_ch", "exch_de_be", 
        "co2_rate"
    ]].to_dict(orient="records")
    
    # Écriture du fichier : flux_2025-01-01.json
    filename = OUTPUT_DIR / f"flux_{day}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, separators=(',', ':')) # Minifié
        
    count += 1

print(f"--- TERMINÉ ---")
print(f"{count} fichiers JSON générés dans '{OUTPUT_DIR}'")