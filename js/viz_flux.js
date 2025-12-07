// Module de la carte des Flux (+ map)

const FluxViz = {
    svg: null,
    gMap: null,   // groupe pour la map (en arrière-plan)
    gLinks: null, // groupe pour les flèches
    gNodes: null, // groupe pour les cercles 
    projection: null, // fonction de projection GPS -> Pixels

    // coords GPS (approximatives) des centres énergétiques/pays
    geoCoords: {
        "FR": [2.5, 46.5],    // France (Centre)
        "UK": [-1.5, 52.0],   // Royaume-Uni
        "BE/DE": [6.5, 50.5], // Moyenne Belgique/Allemagne (frontiere belge/allemande)
        "CH": [8.2, 46.8],    // Suisse
        "IT": [10.5, 44.5],   // Italie (nord)
        "ES": [-3.5, 40.0]    // Espagne
    },

    // init
    init: function(containerId) {
        const container = d3.select(containerId);
        container.selectAll("*").remove();

        const w = 600, h = 500;
        this.svg = container.append("svg")
            .attr("width", w).attr("height", h)
            .attr("viewBox", `0 0 ${w} ${h}`)
            .style("background", "#f8fafc"); // fond léger "mer"

        // def de la projection (+ zoom sur la France)
        this.projection = d3.geoMercator()
            .center([3.5, 46.5]) // centré sur la France
            .scale(1400)         // zoom
            .translate([w / 2, h / 2]);

        this.gMap = this.svg.append("g").attr("class", "map-layer");
        this.gLinks = this.svg.append("g").attr("class", "links-layer");
        this.gNodes = this.svg.append("g").attr("class", "nodes-layer");

        // def des flèches (markers)
        this.defineMarkers();

        // chargement fond de map (geojson Europe simple)
        this.loadMapData();

        console.log("Module FluxViz (Geo) Initialisé");
    },

    // chargement de la map (asynchrone)
    loadMapData: function() {
        // URL map geojson léger
        const geoUrl = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

        d3.json(geoUrl).then(data => {
            // liste codes pays à afficher
            const neighborsList = ["FRA", "GBR", "DEU", "BEL", "CHE", "ITA", "ESP", "LUX", "NLD", "PRT", "AUT"];                                                     //V2
            //const neighborsList = ["FRA", "GBR", "DEU", "BEL", "CHE", "ITA", "ESP"];                                                                               //V1
            //const neighborsList = ["FRA", "GBR", "DEU", "BEL", "CHE", "ITA", "ESP", "LUX", "NLD", "PRT", "AUT", "IRL","DNK","POL","CZE","SVN","HRV","SVK","HUN"];  //V3
            
            // filtre pour garder que les pays proche (ceux afficher)
            const features = data.features.filter(d => neighborsList.includes(d.id));

            // dessiner les pays
            this.gMap.selectAll("path")
                .data(features)
                .join("path")
                .attr("d", d3.geoPath().projection(this.projection))
                .attr("id", d => d.id === "FRA" ? "FR" : d.id) // ID pour cibler la France en CSS (TODO artefact -> remove)
                .attr("fill", d => d.id === "FRA" ? "#cbd5e1" : "#e2e8f0") // color la France un peu plus foncée
                .attr("stroke", "white")
                .attr("stroke-width", 1);
        });
    },

    defineMarkers: function() {
        const defs = this.svg.append("defs");
        // Export (Vert)
        defs.append("marker").attr("id", "arrow-export")
            .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
            .attr("markerWidth", 5).attr("markerHeight", 6).attr("orient", "auto")
            .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#2ecc71");
        // Import (Rouge)
        defs.append("marker").attr("id", "arrow-import")
            .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
            .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
            .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#e74c3c");
    },

    // maj
    update: function(dataStep) {
        if (!this.svg || !dataStep) return;

        // pos de la France (centre calculé par projection)
        const [cx, cy] = this.projection(this.geoCoords["FR"]);

        // construction des données Voisins avec projection GPS
        const neighbors = [
            { id: "UK", name: "Royaume-Uni", val: dataStep.exch_uk, coords: this.geoCoords["UK"] },
            { id: "BE/DE", name: "Allemagne/Belg.", val: dataStep.exch_de_be, coords: this.geoCoords["BE/DE"] },
            { id: "CH", name: "Suisse", val: dataStep.exch_ch, coords: this.geoCoords["CH"] },
            { id: "IT", name: "Italie", val: dataStep.exch_it, coords: this.geoCoords["IT"] },
            { id: "ES", name: "Espagne", val: dataStep.exch_es, coords: this.geoCoords["ES"] }
        ];

        // calculer les pos x,y projetées pour chaque voisin
        neighbors.forEach(n => {
            const [nx, ny] = this.projection(n.coords);
            n.x = nx;
            n.y = ny;
        });

        // echelle de couleur pour le CO2
        const colorCO2 = d3.scaleLinear()
            .domain([0, 40, 80, 120])
            .range(["#2ecc71", "#f1c40f", "#e67e22", "#e74c3c"]);

        const t = d3.transition().duration(200).ease(d3.easeLinear);

        // DESSIN DES LIENS (FLÈCHES)
        const links = this.gLinks.selectAll(".link-flux").data(neighbors, d => d.id);

        const rFrance = 22; // rayon France (22px)
        const rVoisin = 9; // rayon Voisin (9px) 
        const marge = 6; // marge pour éviter que la flèche touche le cercle (6px)

        links.join(
            enter => enter.append("line").attr("class", "link-flux").attr("stroke-linecap", "round"),
            update => update,
            exit => exit.remove()
        )
        .transition(t)
        .attr("stroke-width", d => Math.max(2, Math.abs(d.val) / 600)) // un peu plus épais sur la carte
        .attr("stroke", d => d.val < 0 ? "#2ecc71" : "#e74c3c") // Vert = Export, Rouge = Import
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

        // DESSIN DES NOEUDS (VOISINS)
        const nodes = this.gNodes.selectAll(".node-neighbor").data(neighbors, d => d.id);
        
        // cercle
        nodes.enter().append("circle")
            .attr("class", "node-neighbor")
            .attr("r", rVoisin) // rayon fixe
            .attr("fill", "white")
            .attr("stroke", "#334155")
            .attr("stroke-width", 2)
            .merge(nodes)
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        // texte (Nom + Valeur)
        const labels = this.gNodes.selectAll(".label-neighbor").data(neighbors, d => d.id);
        labels.enter().append("text")
            .attr("class", "label-neighbor")
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .attr("fill", "#1e293b")
            .style("text-shadow", "0px 0px 3px white") // ombre pour lisibilité sur la carte
            .merge(labels)
            .attr("x", d => d.x)
            .attr("y", d => d.y + 21) // juste sous le point
            .text(d => `${d.id}: ${Math.abs(Math.round(d.val))} MW`);

        // LA FRANCE (CENTRE)
        // sélecteur unique pour pas le redessiner en boucle
        let franceGroup = this.gNodes.select(".france-group");
        if (franceGroup.empty()) {
            franceGroup = this.gNodes.append("g").attr("class", "france-group");
            
            // halo pour le style
            franceGroup.append("circle")
                .attr("r", 30)
                .attr("fill", "none")
                .attr("stroke", "currentColor")
                .attr("stroke-width", 1)
                .attr("opacity", 0.5)
                .attr("class", "pulse-circle");

            // cercle principal
            franceGroup.append("circle")
                .attr("class", "main-circle")
                .attr("r", rFrance)
                .attr("stroke", "white")
                .attr("stroke-width", 2);

            // label
            franceGroup.append("text")
                .attr("y", -26)
                .attr("text-anchor", "middle")
                .style("font-weight", "bold")
                .style("font-size", "12px")
                .text("FRANCE");
        }

        // maj pos (cas si resize) + couleur
        franceGroup.attr("transform", `translate(${cx},${cy})`);
        
        const co2 = dataStep.co2_rate || 0;
        const color = colorCO2(co2);
        
        franceGroup.select(".main-circle").transition(t).attr("fill", color);
        franceGroup.select(".pulse-circle").attr("stroke", color);

        // METRIQUES HTML (colonne de droite analyse)
        const totalNet = neighbors.reduce((acc, n) => acc + (n.val || 0), 0);
        const isNetExporter = totalNet < 0;

        d3.select("#flux-balance").html(
            `<span style="color:${isNetExporter ? '#2ecc71' : '#e74c3c'}">
                ${isNetExporter ? "Exportateur Net" : "Importateur Net"}
             </span> 
             (${Math.abs(Math.round(totalNet))} MW)`
        );
        d3.select("#flux-co2").text(`${Math.round(co2)} g/kWh`);
    },

    // logique analyse textuelle
    updateAnalysis: function(dataStep, mode) {
        if (!dataStep) return;
        const neighbors = [
            { name: "Royaume-Uni", val: dataStep.exch_uk },
            { name: "Allemagne/Belgique", val: dataStep.exch_de_be },
            { name: "Suisse", val: dataStep.exch_ch },
            { name: "Italie", val: dataStep.exch_it },
            { name: "Espagne", val: dataStep.exch_es }
        ];
        const totalNet = neighbors.reduce((acc, n) => acc + (n.val || 0), 0);
        const isExport = totalNet < 0;
        const mainPartner = neighbors.reduce((prev, curr) => (Math.abs(curr.val) > Math.abs(prev.val)) ? curr : prev);

        d3.select("#fluxMetricBalance").text(`${Math.abs(Math.round(totalNet))} MW (${isExport ? "Export" : "Import"})`).style("color", isExport ? "#2ecc71" : "#e74c3c");
        d3.select("#fluxMetricPartner").text(`${mainPartner.name} (${Math.round(Math.abs(mainPartner.val))} MW)`);
        d3.select("#fluxMetricCO2").text(`${Math.round(dataStep.co2_rate || 0)} g/kWh`);

        const container = document.getElementById("fluxAnalysisText");
        let text = "";
        if (mode === "day") {
            text += `Sur cette journée, la France est globalement <strong>${isExport ? "exportatrice" : "importatrice"}</strong>. `;
            text += isExport ? `Elle soutient le réseau européen, principalement vers <strong>${mainPartner.name}</strong>.` : `Elle sollicite des imports, notamment depuis <strong>${mainPartner.name}</strong>.`;
            text += ` L'intensité carbone nationale est de <strong>${Math.round(dataStep.co2_rate)} g/kWh</strong>.`;
        } else {
            text += `En moyenne ce mois-ci, le solde est <strong>${isExport ? "exportateur" : "importateur"}</strong>. Partenaire principal : <strong>${mainPartner.name}</strong>.`;
        }
        if(container) container.innerHTML = text;
    }
};