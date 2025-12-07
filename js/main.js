// Script principal : Gestion des 2 sections indépendantes

// ============================================================
// A. Configuration temporelle & Données Globales
//    - liste de tous les jours disponibles en 2025
// ============================================================
const startDate = new Date("2025-01-01");
const endDate = new Date("2025-11-27"); // les fichiers de données s'arrêtent à cette date sans le NAN

const availableDays = [];
for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  availableDays.push(`${y}-${m}-${day}`);
}

// Cache global pour les profils mensuels (calculés une seule fois pour tout le monde)
let monthlyProfiles = null;     

// ============================================================
// B. Gestion des États (Indépendants)
// ============================================================

// État Section 1 : Conso/Prod
const ConsoState = {
    mode: "day",
    dayIndex: 0,
    monthIndex: 0
};

// État Section 2 : Flux (Nouveau !)
const FluxState = {
    mode: "day",
    dayIndex: 0,
    monthIndex: 0
};

// ============================================================
// C. Helpers & Data Loading
// ============================================================

// ------------------ petites fonctions utilitaires ------------------
function parseMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeStr(mins) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(Math.round(mins % 60)).padStart(2, "0");
    return `${h}:${m}`;
}


/**
 * Fonction robuste pour lire un JSON.
 * - Lit la réponse en texte
 * - Essaie un JSON.parse direct
 * - Si ça échoue : remplace "NaN" par null et les apostrophes par des guillemets
 *   puis tente un second parse.
 * - Si tout échoue : renvoie null et ignore ce jour.
 */


async function safeReadJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.warn("Échec de fetch", url, e);
    return null;
  }
  if (!res.ok) {
    console.warn("Statut HTTP non OK", url, res.status);
    return null;
  }

  let text;
  try {
    text = await res.text();
  } catch (e) {
    console.warn("Échec de lecture du texte", url, e);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e1) {
    try {
      const cleaned = text
        .replace(/NaN/gi, "null")
        .replace(/'/g, '"');
      return JSON.parse(cleaned);
    } catch (e2) {
      console.warn("JSON invalide malgré nettoyage, ignoré :", url, e2);
      return null;
    }
  }
}



// Calcul des profils mensuels (Fonction partagée)
// (agrégation des journées en profils moyens)
async function ensureMonthlyProfiles() {
  if (monthlyProfiles) return monthlyProfiles;

  const perMonth = new Map();
  const total = availableDays.length;
  let processed = 0;

 
  
  for (const dayStr of availableDays) {
    processed++;

    // on notifie l'utilisateur via le texte dans analyse (Section 1 par défaut -> TODO pour tout les chart )
    document.getElementById("analysisText").innerHTML =
      `Calcul du profil moyen pour chaque mois…<br><small>Fichier ${processed} / ${total} : ${dayStr}</small>`;

    const url = `data/dailydata_clean/day_${dayStr}.json`;
    const raw = await safeReadJson(url);
    if (!raw || !raw.length) continue;

    const monthKey = dayStr.slice(0, 7);
    if (!perMonth.has(monthKey)) perMonth.set(monthKey, new Map());
    const minuteMap = perMonth.get(monthKey);

    for (const row of raw) {
      const minutes = parseMinutes(row.time);
      if (!minuteMap.has(minutes)) {
        minuteMap.set(minutes, { minutes, loads: [], prods: [], uk: [], es: [], it: [], ch: [], de: [], co2: [] });
      }
      const bucket = minuteMap.get(minutes);
      bucket.loads.push(+row.load);
      bucket.prods.push(+row.production);
      // accumulateurs pour le chart flux
      if(row.exch_uk != null) bucket.uk.push(+row.exch_uk);
      if(row.exch_es != null) bucket.es.push(+row.exch_es);
      if(row.exch_it != null) bucket.it.push(+row.exch_it);
      if(row.exch_ch != null) bucket.ch.push(+row.exch_ch);
      if(row.exch_de_be != null) bucket.de.push(+row.exch_de_be);
      if(row.co2_rate != null) bucket.co2.push(+row.co2_rate);
    }
  }

  if (!perMonth.size) {
    document.getElementById("analysisText").innerHTML =
      "Impossible de calculer un profil mensuel (aucune journée exploitable).";
    monthlyProfiles = [];
    return monthlyProfiles;
  }

  monthlyProfiles = Array.from(perMonth.entries())
    .map(([month, minuteMap]) => {
      const profile = Array.from(minuteMap.values())
        .sort((a, b) => a.minutes - b.minutes)
        .map((b) => ({
          minutes: b.minutes,
          time: minutesToTimeStr(b.minutes), // ajout time string pour compatibilité avec flux
          load: d3.mean(b.loads),
          production: d3.mean(b.prods),
          // moyennes pour chart flux
          exch_uk: d3.mean(b.uk),
          exch_es: d3.mean(b.es),
          exch_it: d3.mean(b.it),
          exch_ch: d3.mean(b.ch),
          exch_de_be: d3.mean(b.de),
          co2_rate: d3.mean(b.co2)
        }));

        const peakPoint = profile.reduce(
        (a, b) => (b.load > a.load ? b : a),
        profile[0]
      );

      const avgLoad = d3.mean(profile, (p) => p.load);
      const avgProd = d3.mean(profile, (p) => p.production);

      return {
        month,
        profile,
        peakLoad: peakPoint.load,
        peakTime: minutesToTimeStr(peakPoint.minutes),
        avgLoad,
        avgProd
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
    
  return monthlyProfiles;
}

// ============================================================
// D. Logique des MAJ (View Controllers)
// ============================================================

// 1. CONTROLLEUR CONSO
async function updateConsoView() {
    if (ConsoState.mode === "day") {
        const dayStr = availableDays[ConsoState.dayIndex];
        
        // UI update
        document.getElementById("sliderLabel").textContent = `Jour : ${dayStr}`;
        document.getElementById("modeDay").classList.add("active");
        document.getElementById("modeMonth").classList.remove("active");
        document.getElementById("modeTitlePrefix").textContent = "Courbe de charge & production –";

        // data Fetch
        const url = `data/dailydata_clean/day_${dayStr}.json`;
        const raw = await safeReadJson(url);
        
        if (!raw || !raw.length) return;

        // Processing pour ConsoViz
        const perTime = new Map();
        raw.forEach(d => {
            const minutes = parseMinutes(d.time);
            if (!perTime.has(minutes)) perTime.set(minutes, { minutes, time: d.time, loads: [], prods: [], forecasts: [] });
            const bucket = perTime.get(minutes);
            if (d.load != null) bucket.loads.push(+d.load);
            if (d.production != null) bucket.prods.push(+d.production);
            if (d.forecast_d1 != null) bucket.forecasts.push(+d.forecast_d1);
        });
        
        const data = Array.from(perTime.values())
            .sort((a, b) => a.minutes - b.minutes)
            .map(b => ({
                time: b.time, minutes: b.minutes,
                load: d3.mean(b.loads), production: d3.mean(b.prods), forecast_d1: d3.mean(b.forecasts)
            }))
            .filter(d => d.load !== null);

        if (typeof ConsoViz !== 'undefined') ConsoViz.updateDay(dayStr, data);

    } else {
        // mode mois
        document.getElementById("modeMonth").classList.add("active");
        document.getElementById("modeDay").classList.remove("active");
        document.getElementById("modeTitlePrefix").textContent = "Profil moyen mensuel –";
        
        await ensureMonthlyProfiles();
        if (!monthlyProfiles) return;

        const m = monthlyProfiles[ConsoState.monthIndex];
        document.getElementById("sliderLabel").textContent = `Mois : ${m.month}`;
        
        if (typeof ConsoViz !== 'undefined') ConsoViz.updateMonth(m.month, m.profile);
    }
}

// 2. CONTROLLEUR FLUX
async function updateFluxView() {
    // label UI
    const label = document.getElementById("sliderLabelFlux");
    const prefix = document.getElementById("fluxTitlePrefix");
    const dateTitle = document.getElementById("fluxTitleDate");

    if (FluxState.mode === "day") {
        const dayStr = availableDays[FluxState.dayIndex];
        
        // UI update
        label.textContent = `Jour : ${dayStr}`;
        prefix.textContent = "Interconnexions (Jour) –";
        dateTitle.textContent = dayStr;
        document.getElementById("modeDayFlux").classList.add("active");
        document.getElementById("modeMonthFlux").classList.remove("active");

        // Data fetch
        const url = `data/dailydata_clean/day_${dayStr}.json`;
        const raw = await safeReadJson(url);
        
        if (!raw || !raw.length) return;

        // init Flux
        if (typeof FluxViz !== 'undefined') {
            if (!FluxViz.svg) FluxViz.init("#flux-chart");
            
            // 1. calcul d'une moyenne journalière
            const dailyAvg = {
                exch_uk: d3.mean(raw, d => d.exch_uk),
                exch_es: d3.mean(raw, d => d.exch_es),
                exch_it: d3.mean(raw, d => d.exch_it),
                exch_ch: d3.mean(raw, d => d.exch_ch),
                exch_de_be: d3.mean(raw, d => d.exch_de_be),
                co2_rate: d3.mean(raw, d => d.co2_rate)
            };

            // 2. maj visuelle
            FluxViz.update(dailyAvg); 

            // 3. maj texte
            FluxViz.updateAnalysis(dailyAvg, "day");
        }

    } else {
        // mode mois Flux
        label.textContent = `Mois : ${monthlyProfiles[FluxState.monthIndex].month}`;
        prefix.textContent = "Interconnexions (Moy. Mensuelle) –";
        dateTitle.textContent = monthlyProfiles[FluxState.monthIndex].month;
        document.getElementById("modeMonthFlux").classList.add("active");
        document.getElementById("modeDayFlux").classList.remove("active");

        await ensureMonthlyProfiles();
        const m = monthlyProfiles[FluxState.monthIndex];
        
        // moy mois entier
        const avgMonth = {
            exch_uk: d3.mean(m.profile, d => d.exch_uk),
            exch_es: d3.mean(m.profile, d => d.exch_es),
            exch_it: d3.mean(m.profile, d => d.exch_it),
            exch_ch: d3.mean(m.profile, d => d.exch_ch),
            exch_de_be: d3.mean(m.profile, d => d.exch_de_be),
            co2_rate: d3.mean(m.profile, d => d.co2_rate)
        };
        
        if (typeof FluxViz !== 'undefined') {
            FluxViz.update(avgMonth); // Visuel
            FluxViz.updateAnalysis(avgMonth, "month"); // Texte (NOUVEAU)
        }
    }
}

// ============================================================
// E. Event Listeners (UI Controls)
// ============================================================

// 1) CONTROLES CONSO
const sConso = document.getElementById("timeSlider");
const btnDayConso = document.getElementById("modeDay");
const btnMonthConso = document.getElementById("modeMonth");

btnDayConso.addEventListener("click", () => { 
    ConsoState.mode = "day"; 
    sConso.max = availableDays.length - 1; 
    sConso.value = ConsoState.dayIndex;
    updateConsoView(); 
});

btnMonthConso.addEventListener("click", async () => { 
    ConsoState.mode = "month"; 
    await ensureMonthlyProfiles();
    sConso.max = monthlyProfiles.length - 1; 
    sConso.value = ConsoState.monthIndex;
    updateConsoView(); 
});

sConso.addEventListener("input", () => {
    if (ConsoState.mode === "day") {
        ConsoState.dayIndex = +sConso.value;
    } else {
        ConsoState.monthIndex = +sConso.value;
    }
    updateConsoView();
});

// 2) CONTROLES FLUX
const sFlux = document.getElementById("timeSliderFlux");
const btnDayFlux = document.getElementById("modeDayFlux");
const btnMonthFlux = document.getElementById("modeMonthFlux");

btnDayFlux.addEventListener("click", () => { 
    FluxState.mode = "day"; 
    sFlux.max = availableDays.length - 1; 
    sFlux.value = FluxState.dayIndex;
    updateFluxView(); 
});

btnMonthFlux.addEventListener("click", async () => { 
    FluxState.mode = "month"; 
    await ensureMonthlyProfiles();
    sFlux.max = monthlyProfiles.length - 1; 
    sFlux.value = FluxState.monthIndex;
    updateFluxView(); 
});

sFlux.addEventListener("input", () => {
    if (FluxState.mode === "day") {
        FluxState.dayIndex = +sFlux.value;
    } else {
        FluxState.monthIndex = +sFlux.value;
    }
    updateFluxView();
});

// ============================================================
// F. Initialisation
// ============================================================
(async () => {
  // init sliders 
  sConso.max = availableDays.length - 1;
  sFlux.max = availableDays.length - 1;

  // init modules
  if (typeof ConsoViz !== 'undefined') ConsoViz.init("#dayChart");
  if (typeof FluxViz !== 'undefined') FluxViz.init("#flux-chart");
  
  // premier rendu
  await updateConsoView();
  await updateFluxView();
})();