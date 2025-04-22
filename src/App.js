import React, { useEffect, useState, useRef } from "react";
import Select from "react-select";
import Plot from "react-plotly.js";
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useLocation, useNavigate, BrowserRouter } from 'react-router-dom';

function App() {
  const [data, setData] = useState({});
  const [organelleOptions, setOrganelleOptions] = useState([]);
  const [selectedOrganelle, setSelectedOrganelle] = useState(null);
  const [geneOptions, setGeneOptions] = useState([]);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [timepoints, setTimepoints] = useState([]);
  const [selectedTimepointRange, setSelectedTimepointRange] = useState([0, 0]);
  const [allGenesByOrganelle, setAllGenesByOrganelle] = useState({});
  const [cellTypes, setCellTypes] = useState([]);
  const [selectedCellTypes, setSelectedCellTypes] = useState([]);
  const [genotypes, setGenotypes] = useState([]);
  const [selectedGenotypes, setSelectedGenotypes] = useState([]);
  const [plotVisibility, setPlotVisibility] = useState({});
  const [showScrollUp, setShowScrollUp] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const skipNextSync = useRef(false);

  // This is used to avoid label overflow
  const wrappedLabels = {
    "Companion cell": "Companion<br>cell",
    "Epidermis": "Epi-<br>dermis",
    "G2/M phase": "G2/m<br>phase",
    "Leaf guard cell": "Leaf<br>guard<br>cell",
    "Leaf pavement cell": "Leaf<br>pave-<br>ment\cell",
    "Mesophyll": "Meso<br>phyll",
    "Phloem parenchyma": "Phloem<br>paren-<br>chyma",
    "S phase": "S phase",
    "Unknown": "Unknown",
    "Xylem": "Xylem",
  };
  
  // This is for the scroll up button
  useEffect(() => {
    const handleScroll = () => setShowScrollUp(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  // This is for reading the json files
  useEffect(() => {
    const files = ["1h.json", "3h.json", "6h.json"];
    Promise.all(
      files.map(f => fetch(`/data/processed/${f}`).then(res => res.json()))
    ).then(jsons => {
      const newData = {};
      const organelles = new Set();
      const allGenesByOrg = {};
      const allCellTypes = new Set();
      const allGenotypes = new Set();
      const tpMap = {};

      files.forEach((file, i) => {
        const json = jsons[i];
        const tp = `${json.Timepoint}h`;
        tpMap[tp] = true;
        newData[tp] = json.Organelle;

        Object.entries(json.Organelle).forEach(([organelle, genes]) => {
          organelles.add(organelle);
          if (!allGenesByOrg[organelle]) allGenesByOrg[organelle] = new Set();

          Object.entries(genes).forEach(([gene, geneData]) => {
            allGenesByOrg[organelle].add(gene);
            Object.entries(geneData).forEach(([genotype, cellMap]) => {
              if (genotype === "Details") return;
              allGenotypes.add(genotype);
              Object.keys(cellMap || {}).forEach(cellType => {
                allCellTypes.add(cellType);
              });
            });
          });
        });
      });

      const numericTPs = Object.keys(tpMap)
        .map(tp => parseInt(tp))
        .sort((a, b) => a - b);

      setData(newData);
      setTimepoints(numericTPs);
      setSelectedTimepointRange([numericTPs[0], numericTPs[numericTPs.length - 1]]);
      setOrganelleOptions(Array.from(organelles).sort());
      setAllGenesByOrganelle(allGenesByOrg);
      setCellTypes(Array.from(allCellTypes).sort());
      setGenotypes(Array.from(allGenotypes).sort());
    });
  }, []);

  // This is for showing the genes specific to the selected Organelle
  useEffect(() => {
    if (selectedOrganelle && allGenesByOrganelle[selectedOrganelle]) {
      const genes = Array.from(allGenesByOrganelle[selectedOrganelle]).sort();
      setGeneOptions(genes);
      setSelectedGenes([]);
    }
  }, [selectedOrganelle, allGenesByOrganelle]);

  // This resizes the heatmap upon new selection
  // It has some time delay to avoid early rendering
  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
  }, [selectedGenes, selectedOrganelle, selectedGenotypes, selectedCellTypes]);

  // Sync organelle and others first — but NOT genes
  useEffect(() => {
    if (
      organelleOptions.length === 0 ||
      genotypes.length === 0 ||
      cellTypes.length === 0 ||
      timepoints.length === 0 ||
      Object.keys(allGenesByOrganelle).length === 0
    ) return;

    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }

    const params = new URLSearchParams(location.search);
    const org = params.get("organelle") || organelleOptions[0];
    const cellTypesParsed = params.get("cellTypes")?.split(",") || [cellTypes[0]];
    const genotypesParsed = params.get("genotypes")?.split(",") || [genotypes[0]];

    const tpRange = params.get("tpRange")?.split(",").map(Number);
    const validRange = tpRange?.length === 2 && !tpRange.includes(NaN)
      ? tpRange
      : [timepoints[0], timepoints[timepoints.length - 1]];

    setSelectedOrganelle(org);
    setSelectedCellTypes(cellTypesParsed);
    setSelectedGenotypes(genotypesParsed);
    setSelectedTimepointRange(validRange);
  }, [
    location.search,
    organelleOptions,
    genotypes,
    cellTypes,
    allGenesByOrganelle,
    timepoints
  ]);

  // Sync genes separately — only after geneOptions are available
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const genes = params.get("genes")?.split(",") || [];
    const validGenes = genes.filter(g => geneOptions.includes(g));
    if (validGenes.length) {
      setSelectedGenes(validGenes);
    }
  }, [geneOptions, location.search]);

  // Sync state → URL only if meaningful values are selected
  useEffect(() => {
    if (
      !selectedOrganelle ||
      selectedGenes.length === 0 ||
      selectedGenotypes.length === 0 ||
      selectedCellTypes.length === 0 ||
      (selectedTimepointRange[0] === 0 && selectedTimepointRange[1] === 0)
    ) {
      return;
    }

    const params = new URLSearchParams();
    if (selectedOrganelle) params.set("organelle", selectedOrganelle);
    if (selectedGenes.length) params.set("genes", selectedGenes.join(","));
    if (selectedGenotypes.length) params.set("genotypes", selectedGenotypes.join(","));
    if (selectedCellTypes.length) params.set("cellTypes", selectedCellTypes.join(","));
    if (selectedTimepointRange.length === 2) params.set("tpRange", selectedTimepointRange.join(","));

    const newSearch = params.toString();
    const currentSearch = location.search.startsWith("?") ? location.search.substring(1) : location.search;

    if (newSearch !== currentSearch) {
      skipNextSync.current = true;
      navigate({ search: newSearch }, { replace: true });
    }
  }, [
    selectedOrganelle,
    selectedGenes,
    selectedGenotypes,
    selectedCellTypes,
    selectedTimepointRange,
    navigate,
    location.search
  ]);

  // Renders plot for selected timepoint/s
  const renderPlot = (tp) => {
    const tpKey = `${tp}h`;
    const organelleData = data[tpKey]?.[selectedOrganelle];
    if (!organelleData) return null;

    const xMetaSet = new Set();
    selectedGenes.forEach(gene => {
      const geneData = organelleData[gene];
      if (!geneData) return;
      selectedGenotypes.forEach(genotype => {
        const cellMap = geneData[genotype] || {};
        selectedCellTypes.forEach(cellType => {
          const clusters = cellMap[cellType] || {};
          Object.keys(clusters).forEach(cluster => {
            if (cluster.startsWith("log2FC")) {
              xMetaSet.add(`${cellType}||${cluster}`);
            }
          });
        });
      });
    });

    const xMeta = Array.from(xMetaSet).sort();
    const xLabels = xMeta.map(k => k.split("||")[1].replace("log2FC_", ""));

    const tileSize = 50;
    const plotWidth = tileSize * xLabels.length + 400;
    const plotHeight = tileSize * selectedGenes.length * selectedGenotypes.length + 200;

    const yLabels = [];
    const zData = [];
    const maskData = [];
    const hoverData = [];

    selectedGenes.forEach(gene => {
      selectedGenotypes.forEach(genotype => {
        yLabels.push(`${gene} - ${genotype}`);
        const zRow = [];
        const maskRow = [];
        const hoverTextRow = [];

        xMeta.forEach(key => {
          const [cellType, cluster] = key.split("||");
          const val = organelleData[gene]?.[genotype]?.[cellType]?.[cluster];
        
          if (val === "ns") {
            zRow.push(NaN);              // Still not plottable
            maskRow.push(1);             // Masked
            hoverTextRow.push("ns");     // show "ns"
          } else if (val === undefined || val === null) {
            zRow.push(null);             // Missing data
            maskRow.push(1);
            hoverTextRow.push("No data");  // distinguish
          } else {
            zRow.push(parseFloat(val));
            maskRow.push(0);
            hoverTextRow.push(val);
          }
        });

        zData.push(zRow);
        maskData.push(maskRow);
        hoverData.push(hoverTextRow);
      });
    });

    const shapes = [];
    const annotations = [];

    for (let i = 0; i < selectedGenes.length; i++) {
      const startIndex = i * selectedGenotypes.length;
      const endIndex = startIndex + selectedGenotypes.length - 1;

      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: -0.5,
        x1: xLabels.length - 0.5,
        y0: startIndex - 0.5,
        y1: endIndex + 0.5,
        line: {
          color: 'white',
          width: 2
        },
        layer: 'above',
        fillcolor: 'rgba(0,0,0,0)'
      });
    }

    const cellTypeGroups = {};
    xMeta.forEach((key, idx) => {
      const [cellType] = key.split("||");
      if (!cellTypeGroups[cellType]) cellTypeGroups[cellType] = [];
      cellTypeGroups[cellType].push(idx);
    });

    Object.entries(cellTypeGroups).forEach(([cellType, indices]) => {
      const start = Math.min(...indices);
      const end = Math.max(...indices);
    
      // Use the wrapped labels if there is only a single cluster in the cell type
      const displayLabel = (indices.length === 1 && wrappedLabels[cellType])
      ? wrappedLabels[cellType]
      : cellType;

      // Background rectangle for the cell type label
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: start - 0.5,
        x1: end + 0.5,
        y0: yLabels.length - 0.5 + 0.2,  // just above heatmap
        y1: yLabels.length - 0.5 + 1.2,  // height of label
        fillcolor: '#bfbaba',           // light gray background
        line: {
          color: 'white',
          width: 2 },
        layer: 'below'
      });
    
      // Cell type label text (annotation on top)
      annotations.push({
        x: (start + end) / 2,
        y: yLabels.length - 0.5 + 0.7,
        xref: 'x',
        yref: 'y',
        text: displayLabel,
        showarrow: false,
        font: { size: 9, color: '#333' },
        align: 'center'
      });
    
      // Optional vertical separator
      if (start > 0) {
        shapes.push({
          type: 'line',
          x0: start - 0.5,
          x1: start - 0.5,
          y0: -0.5,
          y1: yLabels.length - 0.5,
          xref: 'x',
          yref: 'y',
          line: {
            color: 'white',
            width: 2
          },
          layer: 'above'
        });
      }
    });

    const allNull = zData.length === 0 || zData.flat().every(v => v === null || Number.isNaN(v));
    
    // Skip rendering the plot if there's no data or "ns" (not significant)
    if (!xLabels.length || !yLabels.length || !zData.length || allNull) {
      return (
        <div id={`plot-${tpKey}`} key={tpKey} style={{ marginBottom: "3rem" }}>
          <h3>{tpKey}</h3>
          <div style={{ marginBottom: '0.5rem', color: '#666', fontStyle: 'italic' }}>
            All values are not statistically significant or missing. No heatmap rendered.
          </div>
        </div>
      );
    }

    const visible = plotVisibility[tpKey] !== false; // Default to true
    const toggleVisibility = () => {
      setPlotVisibility(prev => ({ ...prev, [tpKey]: !visible }));
    };

    return (
      <div id={`plot-${tpKey}`} key={tpKey} style={{ marginBottom: "3rem" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
          <h3 style={{ margin: 0 }}>
            {tpKey}
            <span
              title="This heatmap shows log₂ fold change. Gray tiles represent 'ns' (not statistically significant) or No data."
              style={{ marginLeft: '8px', cursor: 'help', fontSize: '1rem', color: '#666' }}
            >
              ℹ️
            </span>
          </h3>
          <button onClick={toggleVisibility} style={{ fontSize: '0.85rem' }}>
            {visible ? 'Hide' : 'Show'}
          </button>
        </div>

        {visible && (
          <Plot
            useResizeHandler={false}
            style={{ width: `${plotWidth}px`, height: `${plotHeight}px` }}
            data={[
              {
                z: zData,
                x: xLabels.map((_, i) => i),
                y: yLabels.map((_, i) => i),
                type: "heatmap",
                colorscale: [[0, "blue"], [0.5, "white"], [1, "red"]],
                zmid: 0,
                showscale: true,
                colorbar: {
                  title: {
                    text: "log₂ Fold Change",
                    side: "right",
                    font: { size: 12, weight: "bold" }
                  }
                },
                z: zData,
                hovertext: hoverData,
                hovertemplate: "%{y}<br>%{x}: %{hovertext}<extra></extra>",
              },
              {
                z: maskData,
                x: xLabels.map((_, i) => i),
                y: yLabels.map((_, i) => i),
                type: "heatmap",
                colorscale: [[0, "rgba(0,0,0,0)"], [1, "#d3d3d3"]],
                showscale: false,
                hoverinfo: "skip",
                opacity: 1
              }
            ]}
            layout={{
              width: plotWidth,
              height: plotHeight,
              margin: { l: 180, r: 30, t: 40, b: 140 },
              yaxis: {
                tickvals: yLabels.map((_, i) => i),
                ticktext: yLabels,
                automargin: true,
                dtick: 1,
                constrain: 'domain',
                ticks: "",
              },
              xaxis: {
                tickvals: xLabels.map((_, i) => i),
                ticktext: xLabels,
                tickangle: -60,
                tickfont: { size: 12 },
                automargin: true,
                constrain: 'domain',
                ticks: '',
                showline: false,
                showgrid: false,
                zeroline: false
              },
              shapes,
              annotations
            }}
            config={{ responsive: true }}
          />
          )}
      </div>
    );
  };

  return (
    <>
      {/* FULL-WIDTH NAVBAR */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          backgroundColor: '#f8f9fa',
          zIndex: 100,
          padding: '1rem 3rem 1.5rem 3rem',
          borderBottom: '1px solid #ccc',
          width: '100%',
        }}
      >
        {/* Title positioned on top */}
        <div style={{ width: '100%', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Arabidopsis Gene Expression Explorer</h2>
        </div>
  
        {/* Filter controls in flex container */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2rem',
            alignItems: 'flex-start',
          }}
        >
          {/* Organelle */}
          <div style={{ maxWidth: '150px', flex: '1 1 240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
              <strong>Organelle</strong>
              <span title="Select an organelle to explore gene expression." style={{ marginLeft: '8px', cursor: 'help', fontSize: '1rem', color: '#666' }}>
                ℹ️
              </span>
            </div>
            <div style={{ height: 56 }}>
              <Select
                options={organelleOptions.map(o => ({ value: o, label: o }))}
                value={selectedOrganelle ? { value: selectedOrganelle, label: selectedOrganelle } : null}
                onChange={opt => setSelectedOrganelle(opt?.value || null)}
                placeholder="Search organelle..."
                isSearchable
                styles={{ container: base => ({ ...base, width: '100%' }) }}
              />
            </div>
          </div>
  
          {/* Genotypes */}
          <div style={{ maxWidth: '220px', flex: '1 1 240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
              <strong>Genotypes</strong>
              <span title="Compare gene expression across selected genotypes." style={{ marginLeft: '8px', cursor: 'help', fontSize: '1rem', color: '#666' }}>
                ℹ️
              </span>
            </div>
            <Select
              isMulti
              options={genotypes.map(g => ({ value: g, label: g }))}
              value={selectedGenotypes.map(g => ({ value: g, label: g }))}
              onChange={(opts) => setSelectedGenotypes((opts || []).map(o => o.value))}
              placeholder="Select genotypes"
              closeMenuOnSelect={false}
              isSearchable
              styles={{
                container: base => ({ ...base, width: '100%' }),
                valueContainer: base => ({
                  ...base,
                  maxHeight: 80,
                  overflowY: 'auto',
                  flexWrap: 'wrap',
                }),
                menu: base => ({ ...base, zIndex: 9999 }),
              }}
            />
          </div>
  
          {/* Genes */}
          <div style={{ maxWidth: '230px', flex: '1 1 240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
              <strong>Genes</strong>
              <span title="Choose one or more genes from the selected organelle." style={{ marginLeft: '8px', cursor: 'help', fontSize: '1rem', color: '#666' }}>
                ℹ️
              </span>
            </div>
            <div style={{ height: 120, display: 'flex', alignItems: 'stretch' }}>
              <Select
                isMulti
                options={geneOptions.map(g => ({ value: g, label: g }))}
                value={selectedGenes.map(g => ({ value: g, label: g }))}
                onChange={opts => setSelectedGenes(opts.map(o => o.value))}
                placeholder="Select genes"
                isSearchable
                isDisabled={!selectedOrganelle}
                styles={{
                  container: base => ({ ...base, width: '100%' }),
                  control: base => ({
                    ...base,
                    minHeight: 120,
                    height: 120,
                    alignItems: 'flex-start',
                  }),
                  valueContainer: base => ({
                    ...base,
                    maxHeight: 80,
                    overflowY: 'auto',
                    flexWrap: 'wrap',
                  }),
                  menu: base => ({ ...base, zIndex: 9999 }),
                }}
              />
            </div>
          </div>
  
          {/* Cell Types */}
          <div style={{ maxWidth: '240px', flex: '1 1 240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
              <strong>Cell Types</strong>
              <span title="Filter by specific cell types to focus your analysis." style={{ marginLeft: '8px', cursor: 'help', fontSize: '1rem', color: '#666' }}>
                ℹ️
              </span>
            </div>
            <div style={{ height: 120, display: 'flex', alignItems: 'stretch' }}>
              <Select
                isMulti
                options={cellTypes.map(ct => ({ value: ct, label: ct }))}
                value={selectedCellTypes.map(ct => ({ value: ct, label: ct }))}
                onChange={(opts) => setSelectedCellTypes((opts || []).map(o => o.value))}
                placeholder="Select cell types"
                closeMenuOnSelect={false}
                isSearchable
                styles={{
                  container: base => ({ ...base, width: '100%' }),
                  control: base => ({
                    ...base,
                    minHeight: 120,
                    height: 120,
                    alignItems: 'flex-start',
                  }),
                  valueContainer: base => ({
                    ...base,
                    maxHeight: 80,
                    overflowY: 'auto',
                    flexWrap: 'wrap',
                  }),
                  menu: base => ({ ...base, zIndex: 9999 }),
                }}
              />
            </div>
          </div>
  
          {/* Timepoint */}
          {timepoints.length > 1 && (
            <div style={{ maxWidth: '280px', flex: '1 1 240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
                <strong>Timepoint</strong>
                <span title="Select a range of timepoints to display plots." style={{ marginLeft: '8px', cursor: 'help', fontSize: '1rem', color: '#666' }}>
                  ℹ️
                </span>
              </div>
              <Slider
                range
                min={timepoints[0]}
                max={timepoints[timepoints.length - 1]}
                value={selectedTimepointRange}
                onChange={range => setSelectedTimepointRange(range)}
                marks={timepoints.reduce((acc, tp) => {
                  acc[tp] = tp.toString();
                  return acc;
                }, {})}
                step={null}
                allowCross={false}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>
      </div>
  
      {/* CONTENT AREA */}
      <div style={{ padding: '1rem', paddingLeft: '5vw' }}>
        {timepoints
          .filter(tp => tp >= selectedTimepointRange[0] && tp <= selectedTimepointRange[1])
          .map(tp => renderPlot(tp))}
  
        {showScrollUp && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              position: 'fixed',
              bottom: '30px',
              right: '30px',
              zIndex: 1000,
              padding: '0.6rem 0.95rem',
              fontSize: '1.5rem',
              borderRadius: '50%',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              cursor: 'pointer'
            }}
          >
            ⮝
          </button>
        )}
      </div>
    </>
  );
  
  
}

export default function WrappedApp() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
