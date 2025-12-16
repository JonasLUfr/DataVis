// ============================================================
// A. Configuration temporelle
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

// Valeur maximale fixe pour l'axe Y en mode mensuel
const MONTH_Y_MAX = 82000;

// ============================================================
// B. État global de l'application
// ============================================================
let currentDayIndex = 0;
let currentMode = "day";        // "day" ou "month"
let monthlyProfiles = null;     // profils moyens par mois (calculés à partir des jours)
let currentMonthIndex = 0;

// ============================================================
// C. Initialisation du graphique D3 (échelle, axes, groupes)
// ============================================================
const svg = d3.select("#dayChart");
const svgNode = svg.node();
const svgWidth = svgNode.getBoundingClientRect().width;
const svgHeight = +svg.attr("height");

const margin = { top: 30, right: 20, bottom: 40, left: 60 };
const width = svgWidth - margin.left - margin.right;
const height = svgHeight - margin.top - margin.bottom;

const chartG = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const xScale = d3.scaleLinear().range([0, width]);
const yScale = d3.scaleLinear().range([height, 0]);

const xAxisGroup = chartG
    .append("g")
    .attr("transform", `translate(0,${height})`);
const yAxisGroup = chartG.append("g");

const xAxisLabel = chartG
    .append("text")
    .attr("x", width / 2)
    .attr("y", height + 32)
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563")
    .attr("font-size", 11)
    .text("Heure");

const yAxisLabel = chartG
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -44)
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563")
    .attr("font-size", 11)
    .text("MW");

// Générateurs de lignes (jour et mois utilisent le même format)
const lineLoad = d3
    .line()
    .x((d) => xScale(d.minutes))
    .y((d) => yScale(d.load));

const lineProd = d3
    .line()
    .x((d) => xScale(d.minutes))
    .y((d) => yScale(d.production));

const lineForecast = d3
    .line()
    .x((d) => xScale(d.minutes))
    .y((d) => yScale(d.forecast_d1));

// Tooltip générique
const tooltip = d3
    .select("body")
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(15,23,42,0.9)")
    .style("color", "#f9fafb")
    .style("padding", "6px 8px")
    .style("font-size", "11px")
    .style("border-radius", "6px")
    .style("opacity", 0);

// Rectangle invisible pour capter les mouvements de souris
const hoverRect = chartG
    .append("rect")
    .attr("class", "hover-rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent");

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

// ============================================================
// D. Mode JOUR : chargement d'une journée et rendu du graphique
// ============================================================
async function loadDay(dayStr) {
    const url = `data/dailydata_clean/day_${dayStr}.json`;
    const raw = await safeReadJson(url);
    if (!raw || !raw.length) {
    document.getElementById("analysisText").innerHTML =
        `⚠️ Données introuvables ou invalides pour le jour <strong>${dayStr}</strong>.`;
    return;
    }

    // 1) Regrouper toutes les lignes par heure (minutes)
    const perTime = new Map();

    raw.forEach((d) => {
    const minutes = parseMinutes(d.time);
    if (!perTime.has(minutes)) {
        perTime.set(minutes, {
        minutes,
        time: d.time,
        loads: [],
        prods: [],
        forecasts: []
        });
    }
    const bucket = perTime.get(minutes);
    // On n’ajoute que les champs qui nous intéressent
    if (d.load !== undefined && d.load !== null) {
        bucket.loads.push(+d.load);
    }
    if (d.production !== undefined && d.production !== null) {
        bucket.prods.push(+d.production);
    }
    if (d.forecast_d1 !== undefined && d.forecast_d1 !== null) {
        bucket.forecasts.push(+d.forecast_d1);
    }
    });

    // 2) Pour chaque heure, calculer une seule valeur moyenne
    const data = Array.from(perTime.values())
    .sort((a, b) => a.minutes - b.minutes)
    .map((b) => ({
        time: b.time, // ou minutesToTimeStr(b.minutes)
        minutes: b.minutes,
        load: b.loads.length ? d3.mean(b.loads) : null,
        production: b.prods.length ? d3.mean(b.prods) : null,
        forecast_d1: b.forecasts.length ? d3.mean(b.forecasts) : null
    }))
    // on enlève les éventuels points sans données
    .filter((d) => d.load !== null && d.production !== null);

    updateDayChart(dayStr, data);
    updateDayAnalysis(dayStr, data);
}

function updateDayChart(dayStr, data) {
    d3.select("#titleDay").text(dayStr);
    document.getElementById("subtitleText").textContent =
    "Pas de temps : 15 minutes – données France entière (vue journalière).";

    // Légende et métrique prévision visibles en mode jour
    d3.selectAll(".legend-forecast").style("display", "inline-flex");
    document.getElementById("metricForecastRow").style.display = "flex";

    xScale.domain(d3.extent(data, (d) => d.minutes));
    const maxY = d3.max(data, (d) =>
    Math.max(d.load, d.production, d.forecast_d1 || 0)
    );
    // Y-axis fixé pour une meilleure comparaison visuelle
    yScale.domain([0, MONTH_Y_MAX]);

    const xAxis = d3
    .axisBottom(xScale)
    .ticks(8)
    .tickFormat((v) => minutesToTimeStr(v));

    const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d) => d3.format(",")(d));

    xAxisGroup.call(xAxis);
    yAxisGroup.call(yAxis);

    xAxisLabel.text("Heure");
    yAxisLabel.text("MW");

    const yGrid = d3
    .axisLeft(yScale)
    .tickSize(-width)
    .tickFormat("");

    chartG
    .selectAll(".y-grid")
    .data([null])
    .join((enter) =>
        enter
        .append("g")
        .attr("class", "y-grid")
        .attr("stroke-opacity", 0.08)
    )
    .call(yGrid);

    chartG
    .selectAll(".line-load")
    .data([data])
    .join("path")
    .attr("class", "line-load")
    .attr("fill", "none")
    .attr("stroke", "#2563eb")
    .attr("stroke-width", 2)
    .attr("d", lineLoad);

    chartG
    .selectAll(".line-prod")
    .data([data])
    .join("path")
    .attr("class", "line-prod")
    .attr("fill", "none")
    .attr("stroke", "#fb923c")
    .attr("stroke-width", 2)
    .attr("d", lineProd);

    chartG
    .selectAll(".line-forecast")
    .data([data.filter((d) => d.forecast_d1 !== null)])
    .join("path")
    .attr("class", "line-forecast")
    .attr("fill", "none")
    .attr("stroke", "#6b7280")
    .attr("stroke-width", 1.2)
    .attr("stroke-dasharray", "4 4")
    .attr("d", lineForecast);

    const bisect = d3.bisector((d) => d.minutes).left;

    hoverRect
    .on("mousemove", function (event) {
        const [mx] = d3.pointer(event, this);
        const minutes = xScale.invert(mx);
        const idx = bisect(data, minutes);
        const d = data[Math.min(Math.max(idx, 0), data.length - 1)];
        tooltip
        .style("opacity", 1)
        .html(
            `<strong>${d.time}</strong><br/>
            Consommation : ${d3.format(",")(d.load)} MW<br/>
            Production : ${d3.format(",")(d.production)} MW${
                d.forecast_d1 !== null
                ? `<br/>Prévision J-1 : ${d3.format(",")(d.forecast_d1)} MW`
                : ""
            }`
        )
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));
}

function updateDayAnalysis(dayStr, data) {
    if (!data || data.length === 0) return;

    const peak = data.reduce((a, b) => (b.load > a.load ? b : a));
    const deficitPoints = data.filter((d) => d.production < d.load);
    const maxDeficit = deficitPoints.length
    ? deficitPoints.reduce(
        (max, d) => Math.max(max, d.load - d.production),
        0
        )
    : 0;

    const withForecast = data.filter(
    (d) => d.forecast_d1 !== null && !isNaN(d.forecast_d1)
    );
    const meanForecastError = withForecast.length
    ? d3.mean(withForecast, (d) => Math.abs(d.load - d.forecast_d1))
    : null;

    d3.select("#metricPeak").text(
    `${peak.time} – ${d3.format(",")(peak.load)} MW`
    );
    d3.select("#metricDeficit").text(
    maxDeficit > 0
        ? `${d3.format(",")(maxDeficit)} MW (déficit maximal)`
        : "Aucun déficit : production ≥ consommation"
    );
    d3.select("#metricForecastError").text(
    meanForecastError !== null
        ? `${d3.format(".0f")(meanForecastError)} MW en moyenne`
        : "Prévision J-1 non disponible"
    );

    let text = "";
    if (maxDeficit > 0) {
    text += `Sur la journée du <strong>${dayStr}</strong>, le pic de consommation atteint `;
    text += `<strong>${d3.format(",")(peak.load)} MW</strong> vers <strong>${peak.time}</strong>. `;
    text += `À ce moment-là, la production totale reste en dessous de la demande, ce qui nécessite soit des imports européens, soit l'activation de moyens thermiques (gaz / fioul). `;
    } else {
    text += `Pour la journée du <strong>${dayStr}</strong>, la production reste globalement au-dessus de la consommation. `;
    text += `La France se trouve alors plutôt en situation d'exportatrice nette sur le réseau interconnecté européen. `;
    }

    if (meanForecastError !== null) {
    text += `L'écart moyen entre la prévision J-1 et la consommation réelle est d'environ <strong>${d3.format(
        ".0f"
    )(meanForecastError)} MW</strong> sur la journée.`;
    }

    d3.select("#analysisText").html(text);

    d3.select("#bulletList").html(`
    <li>
        Les passages où la courbe bleue dépasse l’orange signalent des périodes
        où la demande est supérieure à la production disponible.
    </li>
    <li>
        Comparez différentes saisons pour observer l’effet du chauffage
        électrique ou de la climatisation sur le profil de charge.
    </li>
    `);
}

// ============================================================
// E. Mode MOIS : profil moyen journalier par mois
//    (agrégation des journées en profils moyens)
// ============================================================
async function buildMonthlyProfiles() {
    if (monthlyProfiles) return monthlyProfiles;

    const perMonth = new Map();
    const total = availableDays.length;
    let processed = 0;

    for (const dayStr of availableDays) {
    processed++;
    document.getElementById("analysisText").innerHTML =
        `Calcul du profil moyen pour chaque mois…<br><small>Fichier ${processed} / ${total} : ${dayStr}</small>`;

    const url = `data/dailydata_clean/day_${dayStr}.json`;
    const raw = await safeReadJson(url);
    if (!raw || !raw.length) continue;

    const monthKey = dayStr.slice(0, 7);
    if (!perMonth.has(monthKey)) {
        perMonth.set(monthKey, new Map());
    }
    const minuteMap = perMonth.get(monthKey);

    for (const row of raw) {
        const minutes = parseMinutes(row.time);
        if (!minuteMap.has(minutes)) {
        minuteMap.set(minutes, { minutes, loads: [], prods: [] });
        }
        const bucket = minuteMap.get(minutes);
        bucket.loads.push(+row.load);
        bucket.prods.push(+row.production);
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
            load: d3.mean(b.loads),
            production: d3.mean(b.prods)
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

function updateMonthChart() {
    if (!monthlyProfiles || !monthlyProfiles.length) return;
    const idx = Math.min(
    Math.max(currentMonthIndex, 0),
    monthlyProfiles.length - 1
    );
    const m = monthlyProfiles[idx];
    const data = m.profile;

    d3.select("#titleDay").text(m.month);
    document.getElementById("subtitleText").textContent =
    "Profil moyen d’une journée type pour ce mois (pas de 15 minutes).";

    // En mode mensuel : pas de prévision J-1, on masque la légende et la carte liée
    d3.selectAll(".legend-forecast").style("display", "none");
    document.getElementById("metricForecastRow").style.display = "none";

    xScale.domain(d3.extent(data, (d) => d.minutes));
    // Axe Y fixe à 80 000 MW pour comparer visuellement les mois
    yScale.domain([0, MONTH_Y_MAX]);

    const xAxis = d3
    .axisBottom(xScale)
    .ticks(8)
    .tickFormat((v) => minutesToTimeStr(v));

    const yAxis = d3
    .axisLeft(yScale)
    .ticks(6)
    .tickFormat((d) => d3.format(",")(d));

    xAxisGroup.call(xAxis);
    yAxisGroup.call(yAxis);

    xAxisLabel.text("Heure");
    yAxisLabel.text("MW (moyenne)");

    const yGrid = d3
    .axisLeft(yScale)
    .tickSize(-width)
    .tickFormat("");

    chartG
    .selectAll(".y-grid")
    .data([null])
    .join((enter) =>
        enter
        .append("g")
        .attr("class", "y-grid")
        .attr("stroke-opacity", 0.08)
    )
    .call(yGrid);

    chartG
    .selectAll(".line-load")
    .data([data])
    .join("path")
    .attr("class", "line-load")
    .attr("fill", "none")
    .attr("stroke", "#2563eb")
    .attr("stroke-width", 2)
    .attr("d", lineLoad);

    chartG
    .selectAll(".line-prod")
    .data([data])
    .join("path")
    .attr("class", "line-prod")
    .attr("fill", "none")
    .attr("stroke", "#fb923c")
    .attr("stroke-width", 2)
    .attr("d", lineProd);

    // aucune courbe de prévision en mode mensuel
    chartG
    .selectAll(".line-forecast")
    .data([])
    .join("path")
    .attr("class", "line-forecast")
    .attr("d", null);

    const bisect = d3.bisector((d) => d.minutes).left;

    hoverRect
    .on("mousemove", function (event) {
        const [mx] = d3.pointer(event, this);
        const minutes = xScale.invert(mx);
        const idx = bisect(data, minutes);
        const d = data[Math.min(Math.max(idx, 0), data.length - 1)];
        tooltip
        .style("opacity", 1)
        .html(
            `<strong>${minutesToTimeStr(d.minutes)}</strong><br/>
            Consommation moyenne : ${d3.format(",")(
                Math.round(d.load)
            )} MW<br/>
            Production moyenne : ${d3.format(",")(
                Math.round(d.production)
            )} MW`
        )
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));
}

function updateMonthAnalysis() {
    if (!monthlyProfiles || !monthlyProfiles.length) return;
    const idx = Math.min(
    Math.max(currentMonthIndex, 0),
    monthlyProfiles.length - 1
    );
    const m = monthlyProfiles[idx];

    const deficit = m.avgProd < m.avgLoad ? m.avgLoad - m.avgProd : 0;

    d3.select("#metricPeak").text(
    `${m.month} – pic moyen ≈ ${d3.format(",")(Math.round(
        m.peakLoad
    ))} MW (${m.peakTime})`
    );
    d3.select("#metricDeficit").text(
    deficit > 0
        ? `${d3.format(",")(Math.round(deficit))} MW (production &lt; consommation)`
        : "Production moyenne ≥ consommation moyenne"
    );

    // Le troisième indicateur est masqué en mode mensuel, on ne l'alimente pas

    let text = "";
    text += `Pour le mois de <strong>${m.month}</strong>, la courbe représente une journée type moyenne : `;
    text += `la consommation moyenne se situe autour de <strong>${d3.format(
    ","
    )(Math.round(m.avgLoad))} MW</strong> et la production autour de <strong>${d3.format(
    ","
    )(Math.round(m.avgProd))} MW</strong>. `;
    if (deficit > 0) {
    text += `En moyenne, la production reste légèrement en dessous de la demande, ce qui traduit une dépendance plus forte aux imports européens ou aux moyens thermiques (gaz / fioul). `;
    } else {
    text += `La production reste suffisante pour couvrir la consommation sur la plupart des journées du mois. `;
    }
    text += `Le pic moyen de consommation atteint environ <strong>${d3.format(
    ","
    )(Math.round(m.peakLoad))} MW</strong> vers <strong>${
    m.peakTime
    }</strong>.`;

    d3.select("#analysisText").html(text);

    d3.select("#bulletList").html(`
    <li>
        Cette vue mensuelle montre la forme typique d'une journée pour chaque mois
        (profil moyen calculé sur l'ensemble des jours du mois).
    </li>
    <li>
        Grâce à l’axe Y fixé à 80&nbsp;000 MW, vous pouvez comparer visuellement
        les niveaux de charge entre hiver et été.
    </li>
    `);
}

// ============================================================
// F. Gestion du mode (Jour / Mois) et du slider
// ============================================================
const slider = document.getElementById("timeSlider");
const sliderLabel = document.getElementById("sliderLabel");
const modeDayBtn = document.getElementById("modeDay");
const modeMonthBtn = document.getElementById("modeMonth");

modeDayBtn.addEventListener("click", () => setMode("day"));
modeMonthBtn.addEventListener("click", () => setMode("month"));

// Événement sur le slider temporel
slider.addEventListener("input", () => {
    if (currentMode === "day") {
    currentDayIndex = Math.min(
        Math.max(+slider.value, 0),
        availableDays.length - 1
    );
    const dayStr = availableDays[currentDayIndex];
    sliderLabel.textContent = `Jour : ${dayStr}`;
    loadDay(dayStr);
    } else if (currentMode === "month") {
    if (!monthlyProfiles || !monthlyProfiles.length) return;
    currentMonthIndex = Math.min(
        Math.max(+slider.value, 0),
        monthlyProfiles.length - 1
    );
    const m = monthlyProfiles[currentMonthIndex];
    sliderLabel.textContent = `Mois : ${m.month}`;
    updateMonthChart();
    updateMonthAnalysis();
    }
});

// Bascule entre les deux modes
async function setMode(mode) {
    currentMode = mode;

    if (mode === "day") {
    modeDayBtn.classList.add("active");
    modeMonthBtn.classList.remove("active");
    document.getElementById("modeTitlePrefix").textContent =
        "Courbe de charge & production –";

    slider.max = availableDays.length - 1;
    slider.value = currentDayIndex;
    const dayStr = availableDays[currentDayIndex];
    sliderLabel.textContent = `Jour : ${dayStr}`;

    await loadDay(dayStr);
    } else if (mode === "month") {
    modeMonthBtn.classList.add("active");
    modeDayBtn.classList.remove("active");
    document.getElementById("modeTitlePrefix").textContent =
        "Profil moyen mensuel –";

    document.getElementById("analysisText").innerHTML =
        "Calcul du profil moyen pour chaque mois…";

    await buildMonthlyProfiles();
    if (!monthlyProfiles || !monthlyProfiles.length) {
        document.getElementById("analysisText").innerHTML =
        "Aucune donnée mensuelle exploitable.";
        return;
    }

    if (currentMonthIndex >= monthlyProfiles.length) {
        currentMonthIndex = 0;
    }
    slider.max = monthlyProfiles.length - 1;
    slider.value = currentMonthIndex;
    const m = monthlyProfiles[currentMonthIndex];
    sliderLabel.textContent = `Mois : ${m.month}`;

    updateMonthChart();
    updateMonthAnalysis();
    }
}

// ============================================================
// G. Initialisation
// ============================================================
(async () => {
    slider.max = availableDays.length - 1;
    slider.value = currentDayIndex;
    sliderLabel.textContent = `Jour : ${availableDays[currentDayIndex]}`;
    await setMode("day");
})();