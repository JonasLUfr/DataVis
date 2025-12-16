/**
 * Module : Visualisation des Flux Transfrontaliers & CO2
 * Fichier : js/viz_flux.js
 * Dépendances : D3.js v7, TopoJSON (optionnel, ici GeoJSON)
 */

const FluxApp = {
    // --- 1. CONFIGURATION ---
    config: {
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-11-27"),
        geoUrl: "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
        // Coordonnées GPS des centres (Pays/Zones)
        coords: {
            "FR": [2.5, 46.5],    // France (Centre)
            "UK": [-1.5, 52.0],   // Royaume-Uni
            "BE/DE": [6.5, 50.5], // Moyenne Belgique/Allemagne
            "CH": [8.2, 46.8],    // Suisse
            "IT": [10.5, 44.5],   // Italie
            "ES": [-3.5, 40.0]    // Espagne
        }
    },

    // --- 2. ÉTAT DE L'APPLICATION ---
    state: {
        mode: "day",           // 'day' ou 'month'
        currentIndex: 0,       // Index du slider (jour ou mois)
        daysList: [],          // Liste des strings "YYYY-MM-DD"
        monthlyCache: null,    // STOCKAGE DES DONNÉES MOIS (Pour ne pas recalculer)
        isMapLoaded: false,
        lastRequestId: 0       // Pour gérer les requêtes rapides -> sinon bug affichage
    },

    // --- 3. ÉLÉMENTS D3 ---
    viz: {
        svg: null,
        gMap: null,
        gLinks: null,
        gNodes: null,
        projection: null
    },

    // ============================================================
    // INITIALISATION
    // ============================================================
    init: async function() {
        console.log("FluxApp: Initialisation...");

        // 1. Génération du calendrier
        this.generateCalendar();

        // 2. Initialisation du conteneur SVG
        this.initSVG();

        // 3. Chargement de la carte (Fond géographique)
        await this.loadMap();

        // 4. Attachement des écouteurs d'événements (Boutons, Slider)
        this.bindEvents();

        // 5. Lancement de la vue par défaut (Jour 1)
        this.updateView();
    },

    generateCalendar: function() {
        // Génère la liste des jours de Janvier à Novembre
        for (let d = new Date(this.config.startDate); d <= this.config.endDate; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            this.state.daysList.push(`${y}-${m}-${day}`);
        }
        
        // Initialisation slider
        const slider = document.getElementById("timeSliderFlux");
        if(slider) {
            slider.max = this.state.daysList.length - 1;
            slider.value = 0;
        }
    },

    initSVG: function() {
        const container = d3.select("#flux-chart");
        container.selectAll("*").remove(); // Nettoyage sécu

        const w = 600, h = 500;
        this.viz.svg = container.append("svg")
            .attr("width", w)
            .attr("height", h)
            .attr("viewBox", `0 0 ${w} ${h}`); // Responsive

        // Définition de la projection (Centrée sur la France, Dézoomée)
        this.viz.projection = d3.geoMercator()
            .center([3.5, 46.5]) 
            .scale(1600) 
            .translate([w / 2, h / 2]);

        // Création des calques (Ordre d'affichage : Carte > Flèches > Points)
        this.viz.gMap = this.viz.svg.append("g").attr("class", "map-layer");
        this.viz.gLinks = this.viz.svg.append("g").attr("class", "links-layer");
        this.viz.gNodes = this.viz.svg.append("g").attr("class", "nodes-layer");

        // Définition des marqueurs (Flèches)
        const defs = this.viz.svg.append("defs");
        
        // Flèche Export (Verte)
        defs.append("marker").attr("id", "arrow-export")
            .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
            .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
            .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#2ecc71");
        
        // Flèche Import (Rouge)
        defs.append("marker").attr("id", "arrow-import")
            .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
            .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
            .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#e74c3c");
    },

    loadMap: async function() {
        try {
            const data = await d3.json(this.config.geoUrl);
            const countries = ["FRA", "GBR", "DEU", "BEL", "CHE", "ITA", "ESP", "LUX"];
            
            this.viz.gMap.selectAll("path")
                .data(data.features.filter(d => countries.includes(d.id)))
                .join("path")
                .attr("d", d3.geoPath().projection(this.viz.projection))
                .attr("id", d => d.id === "FRA" ? "FR" : d.id) // ID utile pour CSS
                .attr("fill", d => d.id === "FRA" ? "#cbd5e1" : "#e2e8f0")
                .attr("stroke", "white");
            
            this.state.isMapLoaded = true;
        } catch (error) {
            console.error("Erreur chargement carte:", error);
            document.getElementById("fluxAnalysisText").innerHTML = "⚠️ Erreur chargement fond de carte.";
        }
    },

    // ============================================================
    // GESTION DES DONNÉES (JOUR & MOIS)
    // ============================================================

    // Charge les données d'un jour spécifique
    loadDayData: async function(dayStr) {
        try {
            const url = `data/flux_data/flux_${dayStr}.json`;
            const raw = await d3.json(url);
            
            if (!raw || !raw.length) return null;

            // On calcule la moyenne de la journée pour l'affichage
            return {
                exch_uk: d3.mean(raw, d => d.exch_uk),
                exch_es: d3.mean(raw, d => d.exch_es),
                exch_it: d3.mean(raw, d => d.exch_it),
                exch_ch: d3.mean(raw, d => d.exch_ch),
                exch_de_be: d3.mean(raw, d => d.exch_de_be),
                co2_rate: d3.mean(raw, d => d.co2_rate)
            };
        } catch (e) {
            console.warn(`Pas de données pour ${dayStr}`);
            return null;
        }
    },

    // Calcul lourd : Agrégation de tous les fichiers jours en mois
    // + MISE EN CACHE dans this.state.monthlyCache
    calculateMonthlyData: async function() {
        if (this.state.monthlyCache) return this.state.monthlyCache;

        // Feedback utilisateur
        document.getElementById("fluxAnalysisText").innerHTML = "<em>Calcul des moyennes mensuelles en cours... (Cela peut prendre quelques secondes)</em>";

        const monthlyMap = new Map();

        // On boucle sur tous les jours
        // Note: Pour optimiser, on pourrait utiliser Promise.all par blocs
        const promises = this.state.daysList.map(async dayStr => {
            try {
                const raw = await d3.json(`data/flux_data/flux_${dayStr}.json`);
                if (!raw) return;
                
                const monthKey = dayStr.substring(0, 7); // "2025-01"
                if (!monthlyMap.has(monthKey)) {
                    monthlyMap.set(monthKey, { count: 0, sums: { exch_uk: 0, exch_es: 0, exch_it: 0, exch_ch: 0, exch_de_be: 0, co2_rate: 0 } });
                }
                
                const m = monthlyMap.get(monthKey);
                // Moyenne du jour
                m.sums.exch_uk += d3.mean(raw, d => d.exch_uk) || 0;
                m.sums.exch_es += d3.mean(raw, d => d.exch_es) || 0;
                m.sums.exch_it += d3.mean(raw, d => d.exch_it) || 0;
                m.sums.exch_ch += d3.mean(raw, d => d.exch_ch) || 0;
                m.sums.exch_de_be += d3.mean(raw, d => d.exch_de_be) || 0;
                m.sums.co2_rate += d3.mean(raw, d => d.co2_rate) || 0;
                m.count++;

            } catch (e) { /* Ignorer jours manquants */ }
        });

        await Promise.all(promises);

        // Transformation en tableau propre
        const results = Array.from(monthlyMap.entries()).sort().map(([key, val]) => {
            return {
                label: key, // "2025-01"
                data: {
                    exch_uk: val.sums.exch_uk / val.count,
                    exch_es: val.sums.exch_es / val.count,
                    exch_it: val.sums.exch_it / val.count,
                    exch_ch: val.sums.exch_ch / val.count,
                    exch_de_be: val.sums.exch_de_be / val.count,
                    co2_rate: val.sums.co2_rate / val.count
                }
            };
        });

        // SAUVEGARDE DANS LE CACHE
        this.state.monthlyCache = results;
        return results;
    },

    // ============================================================
    // MISE À JOUR VUE (Visuel + Texte)
    // ============================================================
    updateView: async function() {
        // Incrémenter ID de requête pour éviter les conflits -> resolution bug affi fleches
        const currentRequestId = ++this.state.lastRequestId;

        let dataToDisplay = null;
        let labelDisplay = "";

        // 1. Récupération des données selon le mode
        if (this.state.mode === "day") {
            const dayStr = this.state.daysList[this.state.currentIndex];
            labelDisplay = dayStr;
            
            // Mise à jour textes statiques HTML
            document.getElementById("fluxTitlePrefix").textContent = "Interconnexions (Jour) –";
            document.getElementById("fluxTitleDate").textContent = dayStr;
            document.getElementById("sliderLabelFlux").textContent = `Jour : ${dayStr}`;

            dataToDisplay = await this.loadDayData(dayStr);

        } else {
            // MODE MOIS
            // Vérification si le cache existe, sinon on le crée
            if (!this.state.monthlyCache) {
                await this.calculateMonthlyData();
            }

            // Sécurité si on change de mode rapidement
            if (currentRequestId !== this.state.lastRequestId) return;
            if (this.state.currentIndex >= this.state.monthlyCache.length) this.state.currentIndex = 0;
            
            const monthData = this.state.monthlyCache[this.state.currentIndex];
            if (monthData) {
                labelDisplay = monthData.label;
                dataToDisplay = monthData.data;
                
                document.getElementById("fluxTitlePrefix").textContent = "Interconnexions (Moy. Mensuelle) –";
                document.getElementById("fluxTitleDate").textContent = monthData.label;
                document.getElementById("sliderLabelFlux").textContent = `Mois : ${monthData.label}`;
            }
        }

        // 2. Vérifier si c'est toujours la requête active
        if (currentRequestId !== this.state.lastRequestId) {
            // Si une nouvelle requête a été lancée entre temps, on annule celle-ci
            return;
        }

        // 3. Gestion cas "Pas de données"
        if (!dataToDisplay) {
            document.getElementById("fluxAnalysisText").innerHTML = "⚠️ Données indisponibles pour cette période.";
            this.toggleChartVisibility(false); // Cacher proprement
            this.resetMetrics();
            //this.clearChart();
            return;
        }

        // 4. Afficher les données
        this.toggleChartVisibility(true); // Réafficher proprement
        this.drawFlux(dataToDisplay);

        // 4. Mise à jour de l'analyse texte à droite
        this.updateAnalysisText(dataToDisplay);
    },

    // Fonction de dessin D3
    // Plutôt que de tout supprimer, on joue sur l'opacité pour la stabilité
    toggleChartVisibility: function(isVisible) {
        if (!this.viz.gLinks || !this.viz.gNodes) return;
        const opacity = isVisible ? 1 : 0;
        this.viz.gLinks.transition().duration(200).style("opacity", opacity);
        this.viz.gNodes.transition().duration(200).style("opacity", opacity);
    },

    resetMetrics: function() {
        d3.select("#fluxMetricBalance").text("-");
        d3.select("#fluxMetricPartner").text("-");
        d3.select("#fluxMetricCO2").text("-");
    },

    drawFlux: function(data) {
        if(!this.viz.svg) return;

        // On s'assure que le graphique est visible
        this.viz.gLinks.style("opacity", 1);
        this.viz.gNodes.style("opacity", 1);

        const [cx, cy] = this.viz.projection(this.config.coords.FR);

        // Préparation des voisins avec coordonnées projetées
        const neighbors = [
            { id: "UK", name: "Royaume-Uni", val: data.exch_uk, coords: this.config.coords.UK },
            { id: "BE/DE", name: "All./Belg.", val: data.exch_de_be, coords: this.config.coords["BE/DE"] },
            { id: "CH", name: "Suisse", val: data.exch_ch, coords: this.config.coords.CH },
            { id: "IT", name: "Italie", val: data.exch_it, coords: this.config.coords.IT },
            { id: "ES", name: "Espagne", val: data.exch_es, coords: this.config.coords.ES }
        ];

        // Projection des points
        neighbors.forEach(n => { 
            const p = this.viz.projection(n.coords); 
            n.x = p[0]; n.y = p[1]; 
        });

        // Interruption des transitions précédentes pour éviter les bugs visuels
        this.viz.gLinks.selectAll("*").interrupt();
        this.viz.gNodes.selectAll("*").interrupt();

        const t = d3.transition().duration(400);

        // --- DESSIN DES LIENS ---
        const links = this.viz.gLinks.selectAll("line").data(neighbors, d => d.id);

        const rFrance = 22; // rayon France (22px)
        const rVoisin = 9; // rayon Voisin (9px) 
        const marge = 6; // marge pour éviter que la flèche touche le cercle (6px)
        
        links.join(
            enter => enter.append("line")
                .attr("stroke-linecap", "round")
                .attr("opacity", 0)
                .call(enter => enter.transition(t).attr("opacity", 1)),
            update => update,
            exit => exit.transition(t).attr("opacity", 0).remove()
        )
        .transition(t)
        .attr("stroke", d => d.val < 0 ? "#2ecc71" : "#e74c3c") // Vert = Export (<0)
        .attr("stroke-width", d => Math.max(2, Math.abs(d.val) / 500))
        .attr("marker-end", d => d.val < 0 ? "url(#arrow-export)" : "url(#arrow-import)")
        .attr("x1", d => d.val < 0 ? cx : d.x)
        .attr("y1", d => d.val < 0 ? cy : d.y)
        .attr("x2", d => {
            // identifier source et cible
            const xSource = d.val < 0 ? cx : d.x;
            const ySource = d.val < 0 ? cy : d.y;
            const xTarget = d.val < 0 ? d.x : cx;
            const yTarget = d.val < 0 ? d.y : cy;
            
            // choisir le rayon à soustraire (si cible est France ou Voisin)
            const rTarget = d.val < 0 ? rVoisin + marge : rFrance + marge;

            // calculer l'angle + le décalage
            const angle = Math.atan2(yTarget - ySource, xTarget - xSource);
            // reculer le point d'arrivée (x2) en fonction de l'angle
            return xTarget - Math.cos(angle) * rTarget; 
        })
        .attr("y2", d => {
            const xSource = d.val < 0 ? cx : d.x;
            const ySource = d.val < 0 ? cy : d.y;
            const xTarget = d.val < 0 ? d.x : cx;
            const yTarget = d.val < 0 ? d.y : cy;

            const rTarget = d.val < 0 ? rVoisin + marge : rFrance + marge;

            const angle = Math.atan2(yTarget - ySource, xTarget - xSource);
            // pareil pour Y
            return yTarget - Math.sin(angle) * rTarget; 
        });

        // --- DESSIN DES NOEUDS ---
        this.viz.gNodes.selectAll("circle.neighbor").data(neighbors).join("circle")
            .attr("class", "neighbor")
            .attr("r", rVoisin)
            .attr("fill", "white").attr("stroke", "#334155").attr("stroke-width", 2)
            .attr("cx", d => d.x).attr("cy", d => d.y);
        
        this.viz.gNodes.selectAll("text.label").data(neighbors).join("text")
            .attr("class", "label")
            .attr("x", d => d.x).attr("y", d => d.y + 18)
            .attr("text-anchor", "middle").attr("font-size", "10px").attr("font-weight", "bold")
            .text(d => `${d.id}: ${Math.abs(Math.round(d.val))} MW`);

        // --- FRANCE ---
        const colorScale = d3.scaleLinear().domain([0, 40, 80]).range(["#2ecc71", "#f1c40f", "#e74c3c"]);
        const co2Color = colorScale(data.co2_rate || 20);
        
        let fr = this.viz.gNodes.select(".fr-group");
        if(fr.empty()) {
            fr = this.viz.gNodes.append("g").attr("class", "fr-group");
            fr.append("circle").attr("r", 30).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-width", 1).attr("opacity", 0.3).attr("class", "pulse-circle");
            fr.append("circle").attr("r", rFrance).attr("stroke", "white").attr("stroke-width", 2).attr("class", "fill-circle");
            fr.append("text").attr("y", -15).attr("text-anchor", "middle").style("font-weight", "bold").style("font-size", "12px").text("FRANCE");
        }
        
        fr.attr("transform", `translate(${cx},${cy})`);
        fr.select(".fill-circle").transition(t).attr("fill", co2Color);
        fr.select(".pulse-circle").transition(t).attr("stroke", co2Color);
    },

    clearChart: function() {
        this.viz.gLinks.selectAll("*").remove();
        this.viz.gNodes.selectAll("*").remove();
    },

    // Mise à jour de la colonne de droite
    updateAnalysisText: function(d) {
        // Somme algébrique des échanges (Neg = Export, Pos = Import)
        const net = (d.exch_uk||0) + (d.exch_es||0) + (d.exch_it||0) + (d.exch_ch||0) + (d.exch_de_be||0);
        const isExp = net < 0;
        
        d3.select("#fluxMetricBalance").html(
            `<span style="color:${isExp?'#2ecc71':'#e74c3c'}">
                ${Math.abs(Math.round(net))} MW (${isExp?"Export":"Import"})
             </span>`
        );
        d3.select("#fluxMetricCO2").text(`${Math.round(d.co2_rate)} g/kWh`);
        
        // Trouver le partenaire avec le plus gros volume (valeur absolue)
        const partners = [
            {n: "Royaume-Uni", v: d.exch_uk}, {n: "Allemagne/Belg.", v: d.exch_de_be},
            {n: "Suisse", v: d.exch_ch}, {n: "Italie", v: d.exch_it}, {n: "Espagne", v: d.exch_es}
        ];
        const main = partners.reduce((p,c) => Math.abs(c.v) > Math.abs(p.v) ? c : p);
        d3.select("#fluxMetricPartner").text(`${main.n} (${Math.round(Math.abs(main.v))} MW)`);

        // Texte narratif
        const textContainer = d3.select("#fluxAnalysisText");
        let html = "";
        
        if (this.state.mode === "day") {
            html += `Sur cette journée, la France est globalement <strong>${isExp?"exportatrice":"importatrice"}</strong>. `;
            if(isExp) {
                html += `Grâce à sa production, la France soutient ses voisins, avec des exports notables vers <strong>${main.n}</strong>.`;
            } else {
                html += `Le réseau national sollicite des importations, principalement depuis <strong>${main.n}</strong>.`;
            }
        } else {
            html += `En moyenne sur ce mois, la France est <strong>${isExp?"exportatrice":"importatrice"}</strong> nette. `;
            html += `Les échanges les plus intenses ont lieu avec <strong>${main.n}</strong>.`;
        }
        
        textContainer.html(html);
    },

    // ============================================================
    // GESTION DES ÉVÉNEMENTS
    // ============================================================
    bindEvents: function() {
        const btnDay = document.getElementById("modeDayFlux");
        const btnMonth = document.getElementById("modeMonthFlux");
        const slider = document.getElementById("timeSliderFlux");

        // Click Bouton JOUR
        btnDay.addEventListener("click", () => {
            this.state.mode = "day";
            btnDay.classList.add("active");
            btnMonth.classList.remove("active");
            
            // Reset slider pour jours
            slider.max = this.state.daysList.length - 1;
            slider.value = 0;
            this.state.currentIndex = 0;
            
            this.updateView();
        });

        // Click Bouton MOIS
        btnMonth.addEventListener("click", async () => {
            this.state.mode = "month";
            btnMonth.classList.add("active");
            btnDay.classList.remove("active");

            // Si le cache est vide, on lance le calcul (une seule fois)
            if (!this.state.monthlyCache) {
                await this.calculateMonthlyData();
            }

            // Config slider pour mois (0 à 10 si 11 mois)
            slider.max = this.state.monthlyCache.length - 1;
            slider.value = 0;
            this.state.currentIndex = 0;

            this.updateView();
        });

        // Slider Input
        slider.addEventListener("input", (e) => {
            this.state.currentIndex = +e.target.value;
            this.updateView();
        });
    }
};

// Lancement au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
    FluxApp.init();
});