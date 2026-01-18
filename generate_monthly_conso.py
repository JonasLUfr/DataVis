import json
import glob
import os
import numpy as np

# CONFIGURATION
INPUT_DIR = "data/dailydata_clean"
OUTPUT_FILE = "data/monthly_profiles.json"

def parse_minutes(time_str):
    """Convertit 'HH:mm' en minutes depuis minuit."""
    try:
        h, m = map(int, time_str.split(':'))
        return h * 60 + m
    except:
        return None

def minutes_to_timestr(minutes):
    """Convertit minutes en 'HH:mm'."""
    h = int(minutes // 60)
    m = int(minutes % 60)
    return f"{h:02d}:{m:02d}"

def main():
    # 1. Lister tous les fichiers
    files = glob.glob(os.path.join(INPUT_DIR, "day_*.json"))
    print(f"Traitement de {len(files)} fichiers...")

    # Structure : { "2025-01": { 0: {'loads': [], 'prods': []}, 15: ... } }
    month_data = {}

    for file_path in files:
        filename = os.path.basename(file_path)
        # day_2025-01-01.json -> 2025-01
        try:
            day_str = filename.replace("day_", "").replace(".json", "")
            month_key = day_str[:7]
        except:
            continue

        if month_key not in month_data:
            month_data[month_key] = {}

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # Nettoyage basique comme en JS (NaN -> null)
                content = content.replace('NaN', 'null')
                data = json.loads(content)

                for entry in data:
                    mins = parse_minutes(entry.get('time'))
                    if mins is None: continue

                    if mins not in month_data[month_key]:
                        month_data[month_key][mins] = {'loads': [], 'prods': []}
                    
                    l = entry.get('load')
                    p = entry.get('production')

                    if l is not None: month_data[month_key][mins]['loads'].append(l)
                    if p is not None: month_data[month_key][mins]['prods'].append(p)

        except Exception as e:
            print(f"Erreur sur {filename}: {e}")

    # 2. Agrégation et calcul des moyennes
    final_output = []

    for month in sorted(month_data.keys()):
        minute_map = month_data[month]
        profile = []

        for mins in sorted(minute_map.keys()):
            loads = minute_map[mins]['loads']
            prods = minute_map[mins]['prods']
            
            avg_load = sum(loads) / len(loads) if loads else 0
            avg_prod = sum(prods) / len(prods) if prods else 0
            
            profile.append({
                "minutes": mins,
                "load": avg_load,
                "production": avg_prod
            })

        # Calculs annexes (Pic, Moyennes globales)
        if not profile: continue

        peak_point = max(profile, key=lambda x: x['load'])
        avg_load_global = sum(p['load'] for p in profile) / len(profile)
        avg_prod_global = sum(p['production'] for p in profile) / len(profile)

        final_output.append({
            "month": month,
            "profile": profile,
            "peakLoad": peak_point['load'],
            "peakTime": minutes_to_timestr(peak_point['minutes']),
            "avgLoad": avg_load_global,
            "avgProd": avg_prod_global
        })

    # 3. Sauvegarde
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_output, f)
    
    print(f"Succès ! Fichier généré : {OUTPUT_FILE} ({len(final_output)} mois)")

if __name__ == "__main__":
    main()