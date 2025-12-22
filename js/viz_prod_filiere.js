(async function () {
  const BASE = "data/filiere_json";

  const [idx, dailyAll, monthlyAll] = await Promise.all([
    d3.json(`${BASE}/index.json`),
    d3.json(`${BASE}/daily_all.json`),
    d3.json(`${BASE}/monthly_all.json`)
  ]);

  // ---------- State ----------
  let mode = "day";      // "day" | "month"
  let sliderIndex = 0;
  let solo = null;       // ex: "Nucleaire" sinon null
  const OPACITY_ALL = 0.22;

  // ---------- DOM ----------
  const btnDay = document.getElementById("fModeDay");
  const btnMonth = document.getElementById("fModeMonth");
  const slider = document.getElementById("fTimeSlider");
  const sliderLabel = document.getElementById("fSliderLabel");
  const titleValue = document.getElementById("fTitleValue");
  const legendEl = d3.select("#fLegend");
  const tooltip = d3.select("#fTooltip");

  // Donut (à ajouter dans ton aside à droite)
  // <svg id="prodDonut" width="260" height="220"></svg>
  // <div id="prodTotalEnergy"></div>
  // <ul id="prodDonutLegend"></ul>
  const donutSvg = d3.select("#prodDonut");
  const donutLegend = d3.select("#prodDonutLegend");
  const totalEnergyEl = document.getElementById("prodTotalEnergy");

  // ---------- SVG (Area chart) ----------
  const svg = d3.select("#fAreaChart");
  const svgNode = svg.node();

  const width = svgNode.getBoundingClientRect().width || 900;
  const height = +svg.attr("height");

  const margin = { top: 12, right: 18, bottom: 45, left: 70 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // clip
  const clipId = "f-clip";
  svg.append("defs").append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", innerW)
    .attr("height", innerH);

  const xAxisG = g.append("g").attr("transform", `translate(0,${innerH})`);
  const yAxisG = g.append("g");

  const pathsG = g.append("g").attr("clip-path", `url(#${clipId})`);

  const hoverLine = g.append("line")
    .attr("y1", 0).attr("y2", innerH)
    .attr("stroke", "#111")
    .attr("stroke-width", 1)
    .attr("opacity", 0);

  const overlay = g.append("rect")
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("fill", "transparent")
    .style("cursor", "crosshair");

  // ---------- Helpers ----------
  const parseClockToMinutes = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const parseISODate = d3.utcParse("%Y-%m-%d");

  function getCurrent() {
    if (mode === "day") {
      const d = idx.days[sliderIndex];
      return { key: d, unit: dailyAll.unit, series: dailyAll.dates[d].series };
    } else {
      const m = idx.months[sliderIndex];
      return { key: m, unit: monthlyAll.unit, series: monthlyAll.months[m].series };
    }
  }

  const seriesNames = dailyAll.dates[idx.days[0]].series.map(s => s.name);
  const BACKGROUND = new Set(["Nucleaire"]);

  const color = d3.scaleOrdinal()
    .domain(seriesNames)
    .range(d3.schemeTableau10.concat(d3.schemeSet3));

  function setActiveButtons() {
    btnDay.classList.toggle("active", mode === "day");
    btnMonth.classList.toggle("active", mode === "month");
  }

  function setupSlider() {
    const list = (mode === "day") ? idx.days : idx.months;
    slider.min = 0;
    slider.max = list.length - 1;
    slider.value = Math.min(sliderIndex, list.length - 1);
    sliderIndex = +slider.value;

    sliderLabel.textContent = (mode === "day")
      ? `Date : ${list[sliderIndex]}`
      : `Mois : ${list[sliderIndex]}`;
  }

  function renderLegend() {
    const items = legendEl.selectAll(".legend-item")
      .data(seriesNames, d => d);

    const enter = items.enter()
      .append("div")
      .attr("class", "legend-item f-legend-click")
      .on("click", (event, name) => {
        solo = (solo === name) ? null : name; // solo/reset
        update();
      });

    enter.append("div")
      .attr("class", "legend-color")
      .style("background", d => color(d));

    enter.append("span").text(d => d);

    items.merge(enter)
      .style("opacity", d => solo && d !== solo ? 0.35 : 1);

    items.exit().remove();
  }

  // ---------- Donut helpers (totaux énergie) ----------
  function inferStepHoursFromClock(values) {
    // values = [{t:"00:00", v:...}, ...]
    if (!values || values.length < 2) return 0.25;
    const a = parseClockToMinutes(values[0].t);
    const b = parseClockToMinutes(values[1].t);
    const stepMin = Math.max(1, b - a);
    return stepMin / 60;
  }

  function totalsMWhForDay(seriesDay) {
    // seriesDay = [{name, values:[{t, v(MW)}]}]
    const dtH = inferStepHoursFromClock(seriesDay[0].values); // usually 0.25
    const totals = {};
    for (const s of seriesDay) {
      let sum = 0;
      for (const p of s.values) sum += (+p.v || 0) * dtH;
      totals[s.name] = sum; // MWh
    }
    return { totals, unit: "MWh" };
  }

  function totalsMWhForMonth(seriesMonth) {
    // seriesMonth = [{name, values:[{t:"YYYY-MM-DD", v(MWh/jour)}]}]
    const totals = {};
    for (const s of seriesMonth) {
      let sum = 0;
      for (const p of s.values) sum += (+p.v || 0); // already MWh
      totals[s.name] = sum;
    }
    return { totals, unit: "MWh" };
  }

  function formatEnergyMWh(x) {
    if (x >= 1000000) return (x / 1000000).toFixed(2) + " TWh";
    if (x >= 1000) return (x / 1000).toFixed(1) + " GWh";
    return Math.round(x).toLocaleString("fr-FR") + " MWh";
  }

  // ---------- Donut init ----------
  const donutW = +donutSvg.attr("width") || 260;
  const donutH = +donutSvg.attr("height") || 220;
  const donutR = Math.min(donutW, donutH) * 0.38;

  const donutG = donutSvg.append("g")
    .attr("transform", `translate(${donutW / 2},${donutH / 2})`);

  const arc = d3.arc().innerRadius(donutR * 0.62).outerRadius(donutR);
  const pie = d3.pie().value(d => d.value).sort(null);

  const centerLabel = donutG.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-weight", "600");

  function updateDonut(totalsObj, soloName) {
  // totalsObj: { Nucleaire: MWh, Gaz: MWh, ... } (peut manquer certaines clés)
  const allEntries = seriesNames.map(name => ({
    name,
    value: +(totalsObj[name] || 0)
  }));

  const total = d3.sum(allEntries, d => d.value) || 0;

  // Donut: seulement > 0 (sinon arcs bizarres)
  let donutEntries = allEntries.filter(d => d.value > 0);

  // Si solo => donut = seulement la filière (même si 0, on gère)
  if (soloName) {
    const v = +(totalsObj[soloName] || 0);
    donutEntries = v > 0 ? [{ name: soloName, value: v }] : [];
  }

  if (totalEnergyEl) totalEnergyEl.textContent = total ? formatEnergyMWh(total) : "-";
  centerLabel.text(total ? (soloName ? soloName : "Total") : "—");

  const arcs = donutG.selectAll("path").data(pie(donutEntries), d => d.data.name);

  arcs.enter()
    .append("path")
    .attr("fill", d => color(d.data.name))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .merge(arcs)
    .transition().duration(250)
    .attr("d", d => arc(d));

  arcs.exit().remove();

  // Légende: TOUTES les filières, même 0
  if (!donutLegend.empty()) {
    const list = allEntries
      .map(d => ({
        ...d,
        pct: total ? (100 * d.value / total) : 0
      }))
      .sort((a, b) => d3.descending(a.value, b.value));

    const li = donutLegend.selectAll("li").data(list, d => d.name);

    li.enter().append("li").merge(li)
      .style("opacity", d => soloName && d.name !== soloName ? 0.45 : 1)
      .html(d => {
        const valStr = formatEnergyMWh(d.value);
        const pctStr = total ? `${d.pct.toFixed(1)}%` : "—";
        const zeroTag = d.value === 0 ? ` <span style="color:#888;">(0)</span>` : "";
        return `
          <span style="display:inline-flex;align-items:center;gap:8px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${color(d.name)};display:inline-block;"></span>
            <span><b>${d.name}</b> — ${pctStr} (${valStr})${zeroTag}</span>
          </span>
        `;
      });

    li.exit().remove();
  }
 }


  let xScale, yScale;

  function update() {
    setActiveButtons();
    setupSlider();
    renderLegend();

    const { key, unit, series } = getCurrent();
    titleValue.textContent = key;

    // --- Donut totals (toujours en MWh) ---
    // IMPORTANT: on utilise "series" original (pas seriesAdj)
    // - day: series = MW -> conversion en MWh
    // - month: series = MWh/jour -> somme en MWh
    const donutInfo = (mode === "day")
      ? totalsMWhForDay(series)
      : totalsMWhForMonth(series);

    updateDonut(donutInfo.totals, solo);

    // --------- Convert monthly from MWh -> MW mean (MWh / 24) ----------
    let displayUnit = unit;   // day: "MW"
    let seriesAdj = series;

    if (mode === "month") {
      displayUnit = "MW (moyenne journalière)";
      seriesAdj = series.map(s => ({
        name: s.name,
        values: s.values.map(p => ({ t: p.t, v: (+p.v) / 24 }))
      }));
    }

    const visible = solo ? [solo] : seriesNames;

    // X scale
    if (mode === "day") {
      const times = seriesAdj[0].values.map(d => parseClockToMinutes(d.t));
      xScale = d3.scaleLinear().domain(d3.extent(times)).range([0, innerW]);
    } else {
      const dates = seriesAdj[0].values.map(d => parseISODate(d.t));
      xScale = d3.scaleUtc().domain(d3.extent(dates)).range([0, innerW]);
    }

    // Y max on visible series
    const maxY = d3.max(seriesAdj.filter(s => visible.includes(s.name)), s =>
      d3.max(s.values, d => +d.v)
    ) || 1;

    yScale = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

    const xAxis = (mode === "day")
      ? d3.axisBottom(xScale).ticks(12).tickFormat(m => {
          const h = Math.floor(m / 60);
          const mm = String(m % 60).padStart(2, "0");
          return `${h}h${mm}`;
        })
      : d3.axisBottom(xScale).ticks(8).tickFormat(d3.utcFormat("%d/%m"));

    xAxisG.call(xAxis);
    yAxisG.call(d3.axisLeft(yScale).ticks(6));

    const area = d3.area()
      .x(d => (mode === "day") ? xScale(parseClockToMinutes(d.t)) : xScale(parseISODate(d.t)))
      .y0(innerH)
      .y1(d => yScale(+d.v))
      .curve(d3.curveMonotoneX);

    const paths = pathsG.selectAll("path")
      .data(seriesAdj, d => d.name);

    paths.enter().append("path")
        .attr("fill", d => color(d.name))
        .attr("stroke", d => color(d.name))
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .merge(paths)
        .transition().duration(250)
        .attr("d", d => area(d.values))
        // aire plus légère, ligne plus nette
        .attr("fill-opacity", d => {
                const base = BACKGROUND.has(d.name) ? 0.05 : 0.10;
                return solo ? (d.name === solo ? 0.22 : 0) : base;
                })
        .attr("stroke-opacity", d => {
        const base = BACKGROUND.has(d.name) ? 0.55 : 0.95;
        return solo ? (d.name === solo ? 1 : 0) : base;
        })
        .attr("stroke-width", d => {
        const base = BACKGROUND.has(d.name) ? 1.2 : 1.6;
        return solo ? (d.name === solo ? 2.2 : 0) : base;
        });

    paths.exit().remove();

    // Hover
    overlay.on("mousemove", (event) => {
      const [mx] = d3.pointer(event, overlay.node());
      const xVal = xScale.invert(mx);

      const base = seriesAdj[0].values;
      let idxPick = 0;

      if (mode === "day") {
        // nearest (ok en jour)
        const arr = base.map(d => parseClockToMinutes(d.t));
        idxPick = d3.bisectCenter(arr, xVal);
        idxPick = Math.max(0, Math.min(idxPick, base.length - 1));

        // ligne suit la souris en jour
        hoverLine.attr("x1", mx).attr("x2", mx).attr("opacity", 1);
      } else {
        // month: pick "current day" (floor)
        const arr = base.map(d => parseISODate(d.t).getTime());
        idxPick = d3.bisectLeft(arr, xVal.getTime()) - 1;
        idxPick = Math.max(0, Math.min(idxPick, base.length - 1));

        // snap line exactly on selected day
        const snappedX = xScale(parseISODate(base[idxPick].t));
        hoverLine.attr("x1", snappedX).attr("x2", snappedX).attr("opacity", 1);
      }

      const shown = seriesAdj.filter(s => !solo || s.name === solo);
      const rows = shown.map(s => ({
        name: s.name,
        t: s.values[idxPick].t,
        v: +s.values[idxPick].v
      })).sort((a, b) => d3.descending(a.v, b.v));

      const header = `<div><b>${key}</b> — <b>${rows[0]?.t ?? ""}</b></div>
                      <div style="color:#666;">Unité: ${displayUnit}</div>`;

      const body = rows.map(r => `
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${color(r.name)};display:inline-block;"></span>
          <span style="min-width:92px;">${r.name}</span>
          <span><b>${Math.round(r.v).toLocaleString("fr-FR")}</b></span>
        </div>`).join("");

      tooltip.html(`${header}<hr style="border:none;border-top:1px solid #eee;margin:8px 0;">${body}`)
        .style("display", "block")
        .style("left", (event.pageX + 14) + "px")
        .style("top", (event.pageY + 14) + "px");
    });

    overlay.on("mouseleave", () => {
      hoverLine.attr("opacity", 0);
      tooltip.style("display", "none");
    });
  }

  // Events
  btnDay.addEventListener("click", () => {
    mode = "day";
    sliderIndex = 0;
    solo = null;
    update();
  });

  btnMonth.addEventListener("click", () => {
    mode = "month";
    sliderIndex = 0;
    solo = null;
    update();
  });

  slider.addEventListener("input", () => {
    sliderIndex = +slider.value;
    update();
  });

  // Init
  update();
})();
