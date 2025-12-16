// Module de visualisation : Courbe de charge et production

const ConsoViz = {
    svg: null,
    chartG: null,
    scales: { x: null, y: null },
    axes: { xGroup: null, yGroup: null },
    lines: { load: null, prod: null, forecast: null },
    elements: { hoverRect: null, tooltip: null },
    Y_MAX: 82000, 

    // INITIALISATION
    init: function(containerId) {
        const svg = d3.select(containerId);
        if(svg.empty()) return;

        const svgNode = svg.node();
        const svgWidth = svgNode.getBoundingClientRect().width;
        const svgHeight = +svg.attr("height");

        const margin = { top: 30, right: 20, bottom: 40, left: 60 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;

        this.chartG = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        this.scales.x = d3.scaleLinear().range([0, width]);
        this.scales.y = d3.scaleLinear().range([height, 0]);

        this.axes.xGroup = this.chartG.append("g").attr("transform", `translate(0,${height})`);
        this.axes.yGroup = this.chartG.append("g");

        this.chartG.append("text").attr("x", width / 2).attr("y", height + 32).attr("text-anchor", "middle").attr("fill", "#4b5563").attr("font-size", 11).text("Heure");
        this.chartG.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -44).attr("text-anchor", "middle").attr("fill", "#4b5563").attr("font-size", 11).text("MW");

        this.lines.load = d3.line().x(d => this.scales.x(d.minutes)).y(d => this.scales.y(d.load));
        this.lines.prod = d3.line().x(d => this.scales.x(d.minutes)).y(d => this.scales.y(d.production));
        this.lines.forecast = d3.line().x(d => this.scales.x(d.minutes)).y(d => this.scales.y(d.forecast_d1));

        this.elements.tooltip = d3.select("body").append("div")
            .style("position", "absolute").style("pointer-events", "none").style("background", "rgba(15,23,42,0.9)").style("color", "#f9fafb").style("padding", "6px 8px").style("font-size", "11px").style("border-radius", "6px").style("opacity", 0).style("z-index", 1000);

        this.elements.hoverRect = this.chartG.append("rect").attr("class", "hover-rect").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height).attr("fill", "transparent");
        this.chartG.append("g").attr("class", "y-grid").attr("stroke-opacity", 0.08);
    },

    // maj du mode jour
    updateDay: function(dayStr, data) {
        if (!this.chartG) this.init("#dayChart");

        d3.select("#titleDay").text(dayStr);
        document.getElementById("subtitleText").textContent = "Pas de temps : 15 minutes – données France entière (vue journalière).";
        
        d3.selectAll(".legend-forecast").style("display", "inline-flex");
        if(document.getElementById("metricForecastRow")) document.getElementById("metricForecastRow").style.display = "flex";

        this.scales.x.domain(d3.extent(data, d => d.minutes));
        this.scales.y.domain([0, this.Y_MAX]);

        const width = this.scales.x.range()[1];
        this.axes.xGroup.call(d3.axisBottom(this.scales.x).ticks(8).tickFormat(v => this.minutesToTimeStr(v)));
        this.axes.yGroup.call(d3.axisLeft(this.scales.y).ticks(6).tickFormat(d => d3.format(",")(d)));
        this.chartG.select(".y-grid").call(d3.axisLeft(this.scales.y).tickSize(-width).tickFormat(""));

        this.chartG.selectAll(".line-load").data([data]).join("path").attr("class", "line-load").attr("fill", "none").attr("stroke", "#2563eb").attr("stroke-width", 2).attr("d", this.lines.load);
        this.chartG.selectAll(".line-prod").data([data]).join("path").attr("class", "line-prod").attr("fill", "none").attr("stroke", "#fb923c").attr("stroke-width", 2).attr("d", this.lines.prod);
        this.chartG.selectAll(".line-forecast").data([data.filter(d => d.forecast_d1 !== null)]).join("path").attr("class", "line-forecast").attr("fill", "none").attr("stroke", "#6b7280").attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").attr("d", this.lines.forecast);

        // maj du texte d'analyse
        this.updateAnalysisText(dayStr, data, "day");

        // Tooltip
        const bisect = d3.bisector(d => d.minutes).left;
        const self = this;
        this.elements.hoverRect.on("mousemove", function (event) {
            const [mx] = d3.pointer(event, this);
            const minutes = self.scales.x.invert(mx);
            const idx = bisect(data, minutes);
            const d = data[Math.min(Math.max(idx, 0), data.length - 1)];
            
            // Tooltip avec prévision J-1
            self.elements.tooltip.style("opacity", 1)
                .html(`
                    <strong>${d.time}</strong><br/>
                    Consommation : ${d3.format(",")(Math.round(d.load))} MW<br/>
                    Production : ${d3.format(",")(Math.round(d.production))} MW
                    ${d.forecast_d1 !== null ? `<br/><span style="color:#aaa">Prévision J-1 : ${d3.format(",")(Math.round(d.forecast_d1))} MW</span>` : ""}
                `)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 28) + "px");
        }).on("mouseleave", () => self.elements.tooltip.style("opacity", 0));
    },

    // maj du mode mois
    updateMonth: function(monthStr, data) {
        if (!this.chartG) this.init("#dayChart");

        d3.select("#titleDay").text(monthStr);
        document.getElementById("subtitleText").textContent = "Profil moyen d’une journée type pour ce mois.";
        d3.selectAll(".legend-forecast").style("display", "none");
        if(document.getElementById("metricForecastRow")) document.getElementById("metricForecastRow").style.display = "none";

        this.scales.x.domain(d3.extent(data, d => d.minutes));
        this.scales.y.domain([0, this.Y_MAX]);

        const width = this.scales.x.range()[1];
        this.axes.xGroup.call(d3.axisBottom(this.scales.x).ticks(8).tickFormat(v => this.minutesToTimeStr(v)));
        this.axes.yGroup.call(d3.axisLeft(this.scales.y).ticks(6).tickFormat(d => d3.format(",")(d)));
        this.chartG.select(".y-grid").call(d3.axisLeft(this.scales.y).tickSize(-width).tickFormat(""));

        this.chartG.selectAll(".line-load").data([data]).join("path").attr("class", "line-load").attr("d", this.lines.load);
        this.chartG.selectAll(".line-prod").data([data]).join("path").attr("class", "line-prod").attr("d", this.lines.prod);
        this.chartG.selectAll(".line-forecast").data([]).join("path").attr("class", "line-forecast").attr("d", null);

        this.updateAnalysisText(monthStr, data, "month");

        const bisect = d3.bisector(d => d.minutes).left;
        const self = this;
        this.elements.hoverRect.on("mousemove", function (event) {
            const [mx] = d3.pointer(event, this);
            const minutes = self.scales.x.invert(mx);
            const idx = bisect(data, minutes);
            const d = data[Math.min(Math.max(idx, 0), data.length - 1)];
            
            self.elements.tooltip.style("opacity", 1)
                .html(`<strong>${self.minutesToTimeStr(d.minutes)}</strong><br/>Moy Conso: ${d3.format(",")(Math.round(d.load))} MW<br/>Moy Prod: ${d3.format(",")(Math.round(d.production))} MW`)
                .style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 28) + "px");
        }).on("mouseleave", () => self.elements.tooltip.style("opacity", 0));
    },

    // texte d'analyse
    updateAnalysisText: function(title, data, mode) {
        if (!data || data.length === 0) return;
        
        const peak = data.reduce((a, b) => (b.load > a.load ? b : a), data[0]);
        const deficitPoints = data.filter(d => d.production < d.load);
        const maxDeficit = deficitPoints.length ? deficitPoints.reduce((max, d) => Math.max(max, d.load - d.production), 0) : 0;

        // calculs
        const withForecast = data.filter(d => d.forecast_d1 !== null && !isNaN(d.forecast_d1));
        const meanForecastError = withForecast.length ? d3.mean(withForecast, d => Math.abs(d.load - d.forecast_d1)) : null;

        // maj des métriques
        let peakTimeStr = mode === "day" ? peak.time : this.minutesToTimeStr(peak.minutes);
        d3.select("#metricPeak").text(`${peakTimeStr} – ${d3.format(",")(Math.round(peak.load))} MW`);
        d3.select("#metricDeficit").text(maxDeficit > 0 ? `${d3.format(",")(Math.round(maxDeficit))} MW (déficit)` : "Aucun déficit (Prod > Conso)");
        d3.select("#metricForecastError").text(meanForecastError !== null ? `${d3.format(".0f")(meanForecastError)} MW` : "N/A");

        // génération du texte d'analyse
        const analysisDiv = document.getElementById("analysisText");
        if(analysisDiv) {
            let text = "";
            if (maxDeficit > 0) {
                text += `Sur la période du <strong>${title}</strong>, le pic de consommation atteint <strong>${d3.format(",")(peak.load)} MW</strong> vers <strong>${peakTimeStr}</strong>. `;
                text += `La production est insuffisante à certains moments, nécessitant des imports ou du thermique. `;
            } else {
                text += `Pour la journée du <strong>${title}</strong>, la production reste globalement au-dessus de la consommation. `;
                text += `La France se trouve alors plutôt en situation d'exportatrice nette sur le réseau interconnecté européen. `;
            }

            if (mode === "day" && meanForecastError !== null) {
                text += `L'écart moyen entre la prévision J-1 et la consommation réelle est d'environ <strong>${d3.format(".0f")(meanForecastError)} MW</strong> sur la journée.`;
            }
            analysisDiv.innerHTML = text;
        }

        // maj bullet list
        const bulletList = d3.select("#bulletList");
        if (!bulletList.empty()) {
            if (mode === "day") {
                bulletList.html(`
                    <li>La zone où la courbe bleue dépasse l'orange correspond aux moments où la France doit augmenter ses imports ou activer du gaz / fioul.</li>
                    <li>Comparez les jours d’hiver et d’été pour observer l’impact du chauffage électrique sur le pic de 19&nbsp;h.</li>
                `);
            } else {
                bulletList.html(`
                    <li>Cette vue mensuelle montre la forme typique d'une journée pour chaque mois (profil moyen calculé sur l'ensemble des jours du mois).</li>
                    <li>Grâce à l’axe Y fixé à 80&nbsp;000 MW, vous pouvez comparer visuellement les niveaux de charge entre hiver et été.</li>
                `);
            }
        }
    },

    minutesToTimeStr: function(mins) {
        const h = String(Math.floor(mins / 60)).padStart(2, "0");
        const m = String(Math.round(mins % 60)).padStart(2, "0");
        return `${h}:${m}`;
    }
};