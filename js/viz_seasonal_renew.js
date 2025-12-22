(async function () {
  const BASE = "data/filiere_json";
  const seasonal = await d3.json(`${BASE}/seasonal_renewables.json`);

  // ---------- Data / order ----------
  const SEASON_ORDER = ["Hiver", "Printemps", "Ete", "Automne"];
  const FILIERE_ORDER = ["Hydraulique", "Eolien", "Solaire", "Bioenergies"];

  let seasons = (seasonal?.seasons || []).slice();
  const unit = seasonal?.unit || "GWh";

  if (!seasons.length) {
    console.error("❌ seasonal_renewables.json vide ou invalide");
    return;
  }

  seasons.sort((a, b) => SEASON_ORDER.indexOf(a.season) - SEASON_ORDER.indexOf(b.season));

  const setKeys = new Set();
  seasons.forEach(s => Object.keys(s.values || {}).forEach(k => setKeys.add(k)));

  const filieres = [
    ...FILIERE_ORDER.filter(f => setKeys.has(f)),
    ...[...setKeys].filter(k => !FILIERE_ORDER.includes(k))
  ];

  seasons = seasons.map(s => ({
    season: s.season,
    values: filieres.reduce((acc, f) => {
      acc[f] = +((s.values && s.values[f]) ?? 0);
      return acc;
    }, {})
  }));

  // ---------- DOM ----------
  const tooltip = d3.select("#sTooltip");
  const legend = d3.select("#sLegend");

  // Storytelling panel (droite)
  const storyEl = d3.select("#seasonStory");
  const cardsEl = d3.select("#seasonCards");

  // ---------- SVG ----------
  const svg = d3.select("#sBarChart");
  const svgNode = svg.node();
  const width = svgNode.getBoundingClientRect().width || 900;
  const height = +svg.attr("height") || 360;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const margin = { top: 12, right: 18, bottom: 55, left: 70 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.selectAll("*").remove();
  legend.selectAll("*").remove();

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const xAxisG = g.append("g").attr("transform", `translate(0,${innerH})`);
  const yAxisG = g.append("g");

  // ---------- Scales ----------
  const color = d3.scaleOrdinal()
    .domain(filieres)
    .range(d3.schemeTableau10);

  const x0 = d3.scaleBand()
    .domain(seasons.map(d => d.season))
    .range([0, innerW])
    .paddingInner(0.18);

  const x1 = d3.scaleBand()
    .domain(filieres)
    .range([0, x0.bandwidth()])
    .padding(0.12);

  const maxY = d3.max(seasons, d => d3.max(filieres, f => +d.values[f])) || 1;
  const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

  // ---------- Axes ----------
  const fmtTick = d3.format(",");
  xAxisG.call(d3.axisBottom(x0));
  yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(fmtTick));

  // ---------- Bars ----------
  const fmtVal = d3.format(",.0f");
  const groups = g.selectAll(".season-group")
    .data(seasons)
    .enter()
    .append("g")
    .attr("class", "season-group")
    .attr("transform", d => `translate(${x0(d.season)},0)`);

  groups.selectAll("rect")
    .data(d => filieres.map(f => ({
      season: d.season,
      filiere: f,
      value: +d.values[f]
    })))
    .enter()
    .append("rect")
    .attr("x", d => x1(d.filiere))
    .attr("y", d => y(d.value))
    .attr("width", x1.bandwidth())
    .attr("height", d => innerH - y(d.value))
    .attr("fill", d => color(d.filiere))
    .on("mousemove", (event, d) => {
      tooltip
        .html(
          `<div><b>${d.season}</b></div>
           <div>${d.filiere} : <b>${fmtVal(d.value)}</b> ${unit}</div>`
        )
        .style("display", "block")
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY + 14) + "px");
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  // ---------- Legend ----------
  const items = legend.selectAll(".legend-item")
    .data(filieres)
    .enter()
    .append("div")
    .attr("class", "legend-item");

  items.append("div")
    .attr("class", "legend-color")
    .style("background", d => color(d));

  items.append("span").text(d => d);

  // ---------- STORYTELLING + CARDS (droite) ----------
  if (!storyEl.empty()) {
    storyEl.html(
      `Au fil des saisons, la production renouvelable dessine une histoire assez nette : <b>le Printemps</b> prend la tête avec <b>≈ 37 113 GWh</b>, porté par un duo <b>hydraulique + éolien</b> solide et une montée marquée du <b>solaire</b>. <b>L’Automne</b> suit de près avec <b>≈ 36 104 GWh</b>, où l’<b>éolien</b> devient le moteur principal et compense largement le recul du solaire. Puis vient <b>l’Été</b> à <b>≈ 33 689 GWh</b> : ici, le récit s’inverse, le <b>solaire explose</b> et devient la première contribution, mais la baisse de l’hydraulique et de l’éolien limite le total. Enfin, <b>l’Hiver</b> ferme la marche avec <b>≈ 33 280 GWh</b>, dominé par un couple <b>hydraulique–éolien</b> très fort, tandis que le solaire reste logiquement plus discret ; au passage, les <b>bioénergies</b> jouent un rôle d’appoint étonnamment régulier (autour de <b>~2 000 GWh</b> chaque saison), comme un “socle” stable tout au long de l’année.`
    );
  }

  // Saison -> classe CSS
  const seasonClass = (s) => {
    const key = (s || "").toLowerCase();
    if (key.includes("hiver")) return "s-hiver";
    if (key.includes("printemps")) return "s-printemps";
    if (key === "ete" || key.includes("été")) return "s-ete";
    if (key.includes("automne")) return "s-automne";
    return "";
  };

  if (!cardsEl.empty()) {
    const totals = seasons.map(s => {
      const total = d3.sum(filieres, f => +s.values[f]);

      let top = { filiere: null, value: -Infinity };
      filieres.forEach(f => {
        const v = +s.values[f];
        if (v > top.value) top = { filiere: f, value: v };
      });

      return { season: s.season, total, top };
    });

    cardsEl.selectAll("*").remove();

    const cards = cardsEl.selectAll(".story-card")
      .data(totals, d => d.season)
      .enter()
      .append("div")
      .attr("class", d => `story-card ${seasonClass(d.season)}`);

    cards.append("div")
      .attr("class", "kicker")
      .text(d => d.season);

    cards.append("div")
      .attr("class", "value")
      .text(d => `${fmtVal(d.total)} ${unit}`);

    cards.append("div")
      .attr("class", "meta")
      .text(d => `Dominante : ${d.top.filiere}`);
  }

})();
