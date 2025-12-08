import pandas as pd
from pathlib import Path
import json
from sklearn.cluster import KMeans

# =========================
# 1. path
# =========================
DATA_DIR = Path("data")
EXCEL_PATH = DATA_DIR / "Book1.xlsx"
OUT_DIR = DATA_DIR / "consumption_profiles"
OUT_DIR.mkdir(exist_ok=True, parents=True)

# =========================
# 2. intégrer les données
# =========================
df = pd.read_excel(EXCEL_PATH)
df["datetime"] = pd.to_datetime(df["Date - Heure"])
df["date"] = df["datetime"].dt.date
df["hour"] = df["datetime"].dt.hour + df["datetime"].dt.minute / 60
df["weekday"] = df["datetime"].dt.weekday  # 0=Mon

def season(m):
    if m in [12,1,2]: return "Winter"
    if m in [3,4,5]: return "Spring"
    if m in [6,7,8]: return "Summer"
    return "Autumn"

df["season"] = df["datetime"].dt.month.apply(season)

# =========================
# 3. season average
# =========================
season_profile = df.groupby(["season","hour"])["Consommation (MW)"].mean().reset_index()
season_json = {}

for s in season_profile["season"].unique():
    tmp = season_profile[season_profile["season"] == s]
    season_json[s] = [
        {"hour": float(h), "load": float(v)}
        for h, v in zip(tmp["hour"], tmp["Consommation (MW)"])
    ]

with open(OUT_DIR / "season_profile.json", "w", encoding="utf-8") as f:
    json.dump(season_json, f, indent=2)

# =========================
# 4. work day vs week end
# =========================
df["day_type"] = df["weekday"].apply(lambda x: "Weekend" if x >= 5 else "Weekday")
weekday_profile = df.groupby(["day_type","hour"])["Consommation (MW)"].mean().reset_index()

weekday_json = {}
for t in weekday_profile["day_type"].unique():
    tmp = weekday_profile[weekday_profile["day_type"] == t]
    weekday_json[t] = [
        {"hour": float(h), "load": float(v)}
        for h, v in zip(tmp["hour"], tmp["Consommation (MW)"])
    ]

with open(OUT_DIR / "weekday_profile.json", "w", encoding="utf-8") as f:
    json.dump(weekday_json, f, indent=2)

# =========================
# 5. clustering daily
# =========================
pivot = df.pivot_table(index="date", columns="hour", values="Consommation (MW)")
pivot = pivot.dropna()

kmeans = KMeans(n_clusters=4, random_state=0)
clusters = kmeans.fit_predict(pivot)

cluster_df = pd.DataFrame({
    "date": pivot.index.astype(str),
    "cluster": clusters
})

cluster_df.to_json(OUT_DIR / "daily_clusters.json", orient="records", indent=2)

print("✅ Consumption profiles generated in data/consumption_profiles/")
