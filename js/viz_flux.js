/**
 * Visualisation Flux
 */

const FluxApp = {
    // Configuration
    config: {
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-11-27"),
        geoUrl: "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
        
        storyDates: {
            "event1": "2025-01-14", // Grand Froid 
            "event2": "2025-06-28", // Été creux
            "event3": "2025-09-30"  // Record export
        },

        // Coordonnées GPS
        coords: {
            "FR": [2.5, 48.5],
            "UK": [-1.5, 52.0],
            "BE/DE": [6.5, 50.5],
            "CH": [8.2, 46.8],
            "IT": [10.5, 44.5],
            "ES": [-2.5, 42.0] 
        },

        // Mapping Data -> GeoJSON
        isoMap: {
            "UK": ["GBR"], 
            "BE/DE": ["BEL", "DEU"], 
            "CH": ["CHE"], 
            "IT": ["ITA"], 
            "ES": ["ESP"],
            "FR": ["FRA"]
        },
        
        colors: {
            export: "#2ecc71", // Vert
            import: "#e74c3c", // Rouge
            neutral: "#e5e7eb" // Gris
        }
    },

    // ÉTAT State de la page
    state: {
        mode: "day",
        currentIndex: 0,
        daysList: [],
        monthlyCache: null,
        lastRequestId: 0,
        animationTimer: null,
        particles: [],
        particleCounter: 0 // Pour donner un ID unique à chaque bille
    },

    // DOM D3.js
    viz: {
        svg: null, gMap: null, gFlows: null, gLabels: null, gNodes: null,
        svgHist: null,
        projection: null,
        tooltip: null 
    },

    // Initialisation
    init: async function() {
        console.log("FluxApp: Init vFinal...");
        this.generateCalendar();
        this.initSVG();
        await this.loadMap();
        this.bindEvents();
        this.updateView();
    },

    generateCalendar: function() {
        for (let d = new Date(this.config.startDate); d <= this.config.endDate; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            this.state.daysList.push(`${y}-${m}-${day}`);
        }
        const slider = document.getElementById("timeSliderFlux");
        if(slider) {
            slider.max = this.state.daysList.length - 1;
            slider.value = 0;
        }
    },

    initSVG: function() {
        // On suppr l'ancien  tooltip s'il existe pour éviter les doublons
        const oldTt = document.getElementById("tooltip-flux");
        if (oldTt) oldTt.remove();

        // On crée le tooltip
        const tt = document.createElement("div");
        tt.id = "tooltip-flux";
        // Styles de base
        tt.style.position = "absolute";
        tt.style.pointerEvents = "none";
        tt.style.opacity = "0";
        tt.style.zIndex = "9999"; 
        tt.style.backgroundColor = "rgba(15, 23, 42, 0.95)";
        tt.style.color = "white";
        tt.style.padding = "8px 12px";
        tt.style.borderRadius = "6px";
        tt.style.fontSize = "0.85rem";
        
        document.body.appendChild(tt);
        this.viz.tooltip = d3.select(tt);

        // Main MAP
        const container = d3.select("#flux-chart");
        container.selectAll("svg").remove();
        const w = 600, h = 500;
        this.viz.svg = container.append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);

        // Projection
        this.viz.projection = d3.geoMercator().center([3.0, 46.5]).scale(1600).translate([w/2, h/2]);

        // Calques (Ordre important)
        this.viz.gMap = this.viz.svg.append("g").attr("class", "map-layer");   
        this.viz.gFlows = this.viz.svg.append("g").attr("class", "flow-layer"); // Lignes + Particules
        this.viz.gNodes = this.viz.svg.append("g").attr("class", "nodes-layer"); // Points
        this.viz.gLabels = this.viz.svg.append("g").attr("class", "label-layer"); // Texte

        // Mini Histogram analyse tendance
        this.viz.svgHist = d3.select("#history-chart");
    },

    loadMap: async function() {
        try {
            const data = await d3.json(this.config.geoUrl);
            const isoCodes = ["FRA", "GBR", "DEU", "BEL", "CHE", "ITA", "ESP", "LUX", "NLD", "PRT", "AUT", "CZE"];
            
            this.viz.gMap.selectAll("path")
                .data(data.features.filter(d => isoCodes.includes(d.id)))
                .join("path")
                .attr("d", d3.geoPath().projection(this.viz.projection))
                .attr("id", d => d.id) 
                .attr("class", "country-path")
                .attr("fill", "#e5e7eb")
                .attr("stroke", "white");
            
            this.drawCountryLabels();

        } catch (e) { console.error("Erreur Map", e); }
    },

    drawCountryLabels: function() {
        const labels = Object.entries(this.config.coords).map(([key, coords]) => ({key, coords}));
        
        // Dico de trad pour l'affichage
        const displayNames = {
            "UK": "Royaume-Uni",
            "BE/DE": "All./Belg.",
            "CH": "Suisse",
            "IT": "Italie",
            "ES": "Espagne",
            "FR": "France" // On laisse vide pour la France
        };

        this.viz.gLabels.selectAll("text")
            .data(labels)
            .join("text")
            .attr("x", d => this.viz.projection(d.coords)[0])
            .attr("y", d => this.viz.projection(d.coords)[1])
            .attr("text-anchor", "middle")
            .attr("dy", 25) // Décalage sous le point
            .style("font-size", "11px") // Légèrement plus grand
            .style("font-weight", "bold")
            .style("fill", "#334155")
            .style("pointer-events", "none") 
            .style("text-shadow", "0 2px 4px white, 0 0 4px white") // Ombre blanche pour lisibilité sur les lignes
            .text(d => displayNames[d.key] || d.key); 
    },

    // Update view
    // ============================================================
    // UPDATE VIEW
    // ============================================================
    updateView: async function() {
        const reqId = ++this.state.lastRequestId;
        let data = null, label = "";

        // Elements DOM
        const historyContainer = document.getElementById("history-chart-container");
        const startBound = document.getElementById("fluxStartBound");
        const endBound = document.getElementById("fluxEndBound");

        // Reset animation
        if(this.state.animationTimer) {
            this.state.animationTimer.stop();
            this.state.animationTimer = null;
        }
        this.state.particles = [];

        if (this.state.mode === "day") {
            // MODE JOUR
            document.getElementById("fluxTitlePrefix").textContent = "Interconnexions (Jour) :";
            
            // Afficher l'historique
            if(historyContainer) historyContainer.style.display = "block";

            // maj les bornes du slider (Première et dernière date de la liste)
            if(this.state.daysList.length > 0) {
                if(startBound) startBound.textContent = this.state.daysList[0];
                if(endBound) endBound.textContent = this.state.daysList[this.state.daysList.length - 1];
            }

            const dayStr = this.state.daysList[this.state.currentIndex];
            label = dayStr;
            this.updateLabels("Jour", dayStr);
            data = await this.loadDayData(dayStr);
            this.updateHistoryChart(this.state.currentIndex); 

        } else {
            // MODE MOIS
            document.getElementById("fluxTitlePrefix").textContent = "Interconnexions (Moy. Mensuelle) :";
            
            // Cacher l'historique (car non pertinent si par mois)
            if(historyContainer) historyContainer.style.display = "none";

            if (!this.state.monthlyCache) await this.calculateMonthlyData();
            if (reqId !== this.state.lastRequestId) return;
            
            // maj les bornes du slider (Premier et dernier mois)
            if(this.state.monthlyCache && this.state.monthlyCache.length > 0) {
                if(startBound) startBound.textContent = this.state.monthlyCache[0].label;
                if(endBound) endBound.textContent = this.state.monthlyCache[this.state.monthlyCache.length - 1].label;
            }

            const m = this.state.monthlyCache[this.state.currentIndex];
            if(m) {
                label = m.label;
                this.updateLabels("Mois", label);
                data = m.data;
                // On vide le SVG histo par sécurité
                this.viz.svgHist.selectAll("*").remove(); 
            }
        }

        if (!data) return;

        this.renderMap(data);
        this.startParticleAnimation(data);
        this.updateTextAnalysis(data);
    },

    updateLabels: function(mode, date) {
        const titleDate = document.getElementById("fluxTitleDate");
        if(titleDate) titleDate.textContent = date;
        const sliderLbl = document.getElementById("sliderLabelFlux");
        if(sliderLbl) sliderLbl.textContent = `${mode} : ${date}`;
    },

    // Render Map
    renderMap: function(d) {
        const t = d3.transition().duration(500);
        
        // PAYS (Fond)
        this.viz.gMap.selectAll("path").transition(t).attr("fill", "#e5e7eb").attr("fill-opacity", 1);

        // France
        const colorCO2 = d3.scaleLinear().domain([0, 40, 80]).range([this.config.colors.export, "#f1c40f", this.config.colors.import]);
        d3.select("#FRA").transition(t).attr("fill", colorCO2(d.co2_rate || 20)).attr("fill-opacity", 0.8);

        // Voisins
        const neighborsData = [
            { id: "UK", val: d.exch_uk }, { id: "ES", val: d.exch_es },
            { id: "IT", val: d.exch_it }, { id: "CH", val: d.exch_ch },
            { id: "BE/DE", val: d.exch_de_be }
        ];

        neighborsData.forEach(n => {
            const isoList = this.config.isoMap[n.id];
            if(!isoList) return;
            const color = n.val < 0 ? this.config.colors.export : this.config.colors.import;
            isoList.forEach(iso => {
                d3.select("#" + iso).transition(t).attr("fill", color).attr("fill-opacity", 0.15); // Fond très léger
            });
        });

        // DESSIN DES LIGNES (avec le contour blanc)
        const FR_XY = this.viz.projection(this.config.coords.FR);
        const links = this.viz.gFlows.selectAll(".link-group").data(neighborsData, d => d.id);
        
        const enter = links.enter().append("g").attr("class", "link-group");
        
        // Contour blanc dessiné en premier (pour etre en dessous)
        enter.append("line").attr("class", "outline-line")
            .attr("stroke", "white")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-linecap", "round");

        //Ligne Colorée
        enter.append("line").attr("class", "main-line")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-linecap", "round");
        
        // Zone du Hover
        enter.append("line").attr("class", "hover-line")
            .attr("stroke", "transparent").attr("stroke-width", 40)
            .style("cursor", "pointer");

        const merge = links.merge(enter);

        merge.each(function(linkD) {
            const el = d3.select(this);
            const targetXY = FluxApp.viz.projection(FluxApp.config.coords[linkD.id]);
            const col = linkD.val < 0 ? FluxApp.config.colors.export : FluxApp.config.colors.import;
            
            // Calcul épaisseur (min 2px)
            const thickness = Math.max(2, Math.abs(linkD.val) / 400);

            // maj des positions commune
            el.selectAll("line")
                .attr("x1", FR_XY[0]).attr("y1", FR_XY[1])
                .attr("x2", targetXY[0]).attr("y2", targetXY[1]);
            
            // Outline (blanc & plus large que la ligne couleur)
            el.select(".outline-line")
                .attr("stroke-width", thickness + 3); // +3px pour faire le bord

            // Main -> couleur
            el.select(".main-line")
                .attr("stroke", col)
                .attr("stroke-width", thickness);

            // Events
            el.on("mouseenter", (e) => FluxApp.handleHover(linkD, e, true))
              .on("mousemove", (e) => FluxApp.moveTooltip(e))
              .on("mouseleave", () => FluxApp.handleHover(linkD, null, false));
        });
        links.exit().remove();

        // NOEUDS
        const nodes = this.viz.gNodes.selectAll(".country-node").data(neighborsData, d => d.id);
        nodes.enter().append("circle")
            .attr("class", "country-node")
            .attr("r", 10)
            .attr("fill", "white")
            .attr("stroke", "#334155")
            .attr("stroke-width", 2)
            .merge(nodes)
            .attr("cx", d => this.viz.projection(this.config.coords[d.id])[0])
            .attr("cy", d => this.viz.projection(this.config.coords[d.id])[1]);
        nodes.exit().remove();

        // FRANCE
        this.viz.gNodes.selectAll(".fr-node").data([0]).join("circle")
            .attr("class", "fr-node").attr("r", 14)
            .attr("fill", "white").attr("stroke", "#334155").attr("stroke-width", 2)
            .attr("cx", FR_XY[0]).attr("cy", FR_XY[1]);
    },

    // Animation des particules (vitesse calibrée entre 1250-3000)
    startParticleAnimation: function(data) {
        // On stop lancien timer (sécurité)
        if (this.state.animationTimer) {
            this.state.animationTimer.stop();
            this.state.animationTimer = null;
        }

        const links = [
            { id: "UK", val: data.exch_uk }, { id: "BE/DE", val: data.exch_de_be },
            { id: "CH", val: data.exch_ch }, { id: "IT", val: data.exch_it }, { id: "ES", val: data.exch_es }
        ];

        const FR = this.viz.projection(this.config.coords.FR);
        this.state.particles = [];

        // Scale vitesse (calibrée sur 1250-3000)
        const speedScale = d3.scaleLinear()
            .domain([1250, 3000]) 
            .range([0.002, 0.015]) 
            .clamp(true);

        links.forEach(l => {
            const dest = this.viz.projection(this.config.coords[l.id]);
            const power = Math.abs(l.val);
            
            if (power < 50) return; 

            const count = Math.max(2, Math.min(8, Math.ceil(Math.log(power)/1.5))); 
            const isExport = l.val < 0; 

            const pSource = isExport ? FR : dest;
            const pTarget = isExport ? dest : FR;
            const speed = speedScale(power);

            for(let i=0; i<count; i++) {
                // On incr le compteur global pour avoir un ID unique
                this.state.particleCounter++;
                
                this.state.particles.push({
                    id: this.state.particleCounter, // ID UNIQUE
                    source: pSource,
                    target: pTarget,
                    progress: Math.random(), 
                    speed: speed, 
                    color: isExport ? this.config.colors.export : this.config.colors.import
                });
            }
        });

        // Lancement du new timer
        this.state.animationTimer = d3.timer(() => {
            this.updateParticles();
        });
    },

    updateParticles: function() {
        // (d => d.id) pour éviter les conflits d'animation
        const p = this.viz.gFlows.selectAll(".particle")
            .data(this.state.particles, d => d.id); 

        // Création des nouvelles billes
        p.enter().append("circle")
            .attr("class", "particle")
            .attr("r", 4) 
            .attr("pointer-events", "none")
            .attr("fill", d => d.color)
            .attr("opacity", 0) // Apparition en douceur
            .transition().duration(200).attr("opacity", 0.8) // Fade in
            .selection() // On revient à la sélection normale pour la suite
            .merge(p)
            .attr("cx", d => {
                d.progress += d.speed;
                if(d.progress >= 1) d.progress = 0;
                return d.source[0] + (d.target[0] - d.source[0]) * d.progress;
            })
            .attr("cy", d => {
                return d.source[1] + (d.target[1] - d.source[1]) * d.progress;
            });

        // Suppression propre des anciennes billes
        p.exit().remove();
    },

    // Bar Chart Historique
    updateHistoryChart: async function(currentIndex) {
        const indices = [];
        for(let i = Math.max(0, currentIndex - 6); i <= currentIndex; i++) indices.push(i);

        const promises = indices.map(i => this.loadDayData(this.state.daysList[i]));
        const res = await Promise.all(promises);
        
        const dataset = res.map((d, k) => ({
            val: d ? (d.exch_uk+d.exch_es+d.exch_it+d.exch_ch+d.exch_de_be) : 0,
            date: this.state.daysList[indices[k]],
            isCurrent: indices[k] === currentIndex
        }));

        const svg = this.viz.svgHist;
        svg.selectAll("*").remove();
        
        const w = svg.node().getBoundingClientRect().width;
        const h = 80;
        const centerY = h / 2;
        const barW = (w / 7) - 4;

        const maxVal = Math.max(...dataset.map(d => Math.abs(d.val)), 5000);
        const hScale = d3.scaleLinear().domain([0, maxVal]).range([0, (h/2) - 5]);

        // Ligne Zéro
        svg.append("line").attr("x1",0).attr("x2",w).attr("y1",centerY).attr("y2",centerY)
           .attr("stroke","#9ca3af").attr("stroke-width", 1);

        svg.selectAll("rect")
            .data(dataset)
            .join("rect")
            .attr("x", (d, i) => i * (w/dataset.length) + 2)
            .attr("width", barW)
            .attr("rx", 2)
            .attr("fill", d => d.val < 0 ? this.config.colors.export : this.config.colors.import)
            .attr("opacity", d => d.isCurrent ? 1 : 0.4)
            .attr("height", d => hScale(Math.abs(d.val)))
            // Export (<0) : Monte & Import (>0) : Descend
            .attr("y", d => d.val < 0 ? centerY - hScale(Math.abs(d.val)) : centerY)
            
            // Interaction Tooltip
            .on("mouseenter", (e, d) => {
                const fluxStr = Math.abs(Math.round(d.val)) + " MW";
                const type = d.val < 0 ? "Export (Vente) de" : "Import (Achat) de";
                
                this.viz.tooltip.style("opacity", 1)
                    .html(`<strong>${d.date}</strong><br>${type}<br><b>${fluxStr}</b>`);
                
                this.moveTooltip(e);
                d3.select(e.target).attr("opacity", 0.8);
            })
            .on("mousemove", (e) => this.moveTooltip(e))
            .on("mouseleave", (e, d) => {
                this.viz.tooltip.style("opacity", 0);
                d3.select(e.target).attr("opacity", d.isCurrent ? 1 : 0.4);
            });
    },


    // Intéraction générale
    handleHover: function(d, event, active) {
        // Sécurité
        if (!d || !d.id) return;

        if (active) {
            // On active le mode Focus sur le container
            d3.select("#flux-chart").classed("has-focus", true);
            
            // On garde le LIEN (la flèche) visible
            d3.select(event.currentTarget).classed("focused", true);
            
            // On garde la FRANCE visible
            d3.select("#FRA").classed("focused", true);

            // On garde le VOISIN visible et on le met en valeur
            const isoList = this.config.isoMap[d.id];
            if (isoList) {
                isoList.forEach(iso => {
                    d3.select("#" + iso)
                        .classed("focused", true) // Empêche un voile blanc (CSS opacity)
                        .attr("fill-opacity", 0.6)
                        .attr("stroke", "#334155")
                        .attr("stroke-width", 1.5);
                });
            }

            // Tooltip
            const flux = Math.round(d.val);
            const sens = flux < 0 ? "Export de" : "Import de";
            const paysNames = { "UK": "Royaume-Uni", "ES": "Espagne", "IT": "Italie", "CH": "Suisse", "BE/DE": "All./Belg." };
            
            this.viz.tooltip.style("opacity", 1)
                .html(`<strong>${paysNames[d.id] || d.id}</strong><br>${sens}<br><b>${Math.abs(flux)} MW</b>`);
            this.moveTooltip(event);

        } else {
            // Reset
            d3.select("#flux-chart").classed("has-focus", false);
            d3.selectAll(".focused").classed("focused", false); // On retire le focus de tout le monde
            this.viz.tooltip.style("opacity", 0);

            // Reset style spécifique du Voisin (retour à la normale)
            const isoList = this.config.isoMap[d.id];
            if (isoList) {
                isoList.forEach(iso => {
                    d3.select("#" + iso)
                        .attr("fill-opacity", 0.3) // Retour à l'opacité légère par défaut
                        .attr("stroke", "white")
                        .attr("stroke-width", 1);
                });
            }
        }
    },

    moveTooltip: function(event) {
        if (!this.viz.tooltip) return;
        // Position absolue par rapport à la page
        const x = event.pageX + 15;
        const y = event.pageY - 15;
        this.viz.tooltip.style("left", x + "px").style("top", y + "px");
    },

    updateTextAnalysis: function(d) {
        const net = (d.exch_uk||0) + (d.exch_es||0) + (d.exch_it||0) + (d.exch_ch||0) + (d.exch_de_be||0);
        const isExp = net < 0;
        
        d3.select("#fluxMetricBalance")
            .text(`${Math.abs(Math.round(net))} MW`)
            .style("color", isExp ? this.config.colors.export : this.config.colors.import);
            
        d3.select("#fluxMetricCO2").text(`${Math.round(d.co2_rate)} g/kWh`);

        const partners = [
            {n: "Royaume-Uni", v: d.exch_uk}, {n: "Allemagne/Belg.", v: d.exch_de_be},
            {n: "Suisse", v: d.exch_ch}, {n: "Italie", v: d.exch_it}, {n: "Espagne", v: d.exch_es}
        ];
        const main = partners.reduce((p,c) => Math.abs(c.v) > Math.abs(p.v) ? c : p);
        d3.select("#fluxMetricPartner").text(main.n);

        const textDiv = document.getElementById("fluxAnalysisText");
        if(textDiv) {
            let html = "";
            if (this.state.mode === "day") {
                html += `Sur cette journée, la France est globalement <strong>${isExp?"exportatrice":"importatrice"}</strong>. `;
                if(isExp) {
                    html += `Grâce à sa production, la France soutient ses voisins, avec des exportations notables vers <strong>${main.n}</strong>.`;
                } else {
                    html += `Le réseau national sollicite des importations, principalement depuis <strong>${main.n}</strong>.`;
                }
            } else {
                html += `En moyenne sur ce mois, la France est <strong>${isExp?"exportatrice":"importatrice"}</strong> nette. `;
                html += `Les échanges les plus intenses ont lieu avec <strong>${main.n}</strong>.`;
            }
            textDiv.innerHTML = html;
        }
    },

    loadDayData: async function(dayStr) {
        try {
            const raw = await d3.json(`data/flux_data/flux_${dayStr}.json`);
            if (!raw || !raw.length) return null;
            return {
                exch_uk: d3.mean(raw, d => d.exch_uk),
                exch_es: d3.mean(raw, d => d.exch_es),
                exch_it: d3.mean(raw, d => d.exch_it),
                exch_ch: d3.mean(raw, d => d.exch_ch),
                exch_de_be: d3.mean(raw, d => d.exch_de_be),
                co2_rate: d3.mean(raw, d => d.co2_rate)
            };
        } catch { return null; }
    },

    calculateMonthlyData: async function() {
        if(this.state.monthlyCache) return;
        const map = new Map();
        const promises = this.state.daysList.map(async day => {
            try {
                const r = await d3.json(`data/flux_data/flux_${day}.json`);
                if(!r) return;
                const k = day.slice(0,7);
                if(!map.has(k)) map.set(k, {c:0, s:{uk:0,es:0,it:0,ch:0,de:0,co2:0}});
                const m = map.get(k);
                m.s.uk += d3.mean(r, d=>d.exch_uk)||0; m.s.es += d3.mean(r, d=>d.exch_es)||0;
                m.s.it += d3.mean(r, d=>d.exch_it)||0; m.s.ch += d3.mean(r, d=>d.exch_ch)||0;
                m.s.de += d3.mean(r, d=>d.exch_de_be)||0; m.s.co2 += d3.mean(r, d=>d.co2_rate)||0;
                m.c++;
            } catch {}
        });
        await Promise.all(promises);
        this.state.monthlyCache = Array.from(map.entries()).sort().map(([k,v]) => ({
            label: k,
            data: {
                exch_uk: v.s.uk/v.c, exch_es: v.s.es/v.c, exch_it: v.s.it/v.c,
                exch_ch: v.s.ch/v.c, exch_de_be: v.s.de/v.c, co2_rate: v.s.co2/v.c
            }
        }));
    },

    bindEvents: function() {
        const slider = document.getElementById("timeSliderFlux");
        
        document.getElementById("modeDayFlux").onclick = () => {
            this.state.mode = "day";
            document.getElementById("modeDayFlux").classList.add("active");
            document.getElementById("modeMonthFlux").classList.remove("active");
            slider.max = this.state.daysList.length - 1;
            slider.value = 0; this.state.currentIndex = 0;
            this.updateView();
        };

        document.getElementById("modeMonthFlux").onclick = async () => {
            this.state.mode = "month";
            document.getElementById("modeMonthFlux").classList.add("active");
            document.getElementById("modeDayFlux").classList.remove("active");
            if(!this.state.monthlyCache) await this.calculateMonthlyData();
            slider.max = this.state.monthlyCache.length - 1;
            slider.value = 0; this.state.currentIndex = 0;
            this.updateView();
        };

        slider.addEventListener("input", (e) => {
            this.state.currentIndex = +e.target.value;
            this.updateView();
        });

        document.querySelectorAll(".btn-story").forEach(btn => {
            btn.addEventListener("click", () => {
                const eventKey = btn.getAttribute("data-target");
                const dateTarget = this.config.storyDates[eventKey];
                const index = this.state.daysList.indexOf(dateTarget);
                if(index !== -1) {
                    document.getElementById("modeDayFlux").click();
                    slider.value = index;
                    this.state.currentIndex = index;
                    this.updateView();
                }
            });
        });
    }
};

document.addEventListener("DOMContentLoaded", () => FluxApp.init());