import React, { useEffect, useState } from "react";
import Select from "react-select";
import Plot from "react-plotly.js";
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

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

  useEffect(() => {
    if (selectedOrganelle && allGenesByOrganelle[selectedOrganelle]) {
      const genes = Array.from(allGenesByOrganelle[selectedOrganelle]).sort();
      setGeneOptions(genes);
      setSelectedGenes([]);
    }
  }, [selectedOrganelle, allGenesByOrganelle]);

  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
  }, [selectedGenes, selectedOrganelle, selectedGenotypes, selectedCellTypes]);

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
    const plotWidth = tileSize * xLabels.length + 200;
    const plotHeight = tileSize * selectedGenes.length * selectedGenotypes.length + 200;

    const yLabels = [];
    const zData = [];
    const maskData = [];

    selectedGenes.forEach(gene => {
      selectedGenotypes.forEach(genotype => {
        yLabels.push(`${gene} - ${genotype}`);
        const zRow = [];
        const maskRow = [];

        xMeta.forEach(key => {
          const [cellType, cluster] = key.split("||");
          const val = organelleData[gene]?.[genotype]?.[cellType]?.[cluster];
          if (val === "ns" || val === undefined) {
            zRow.push(null);
            maskRow.push(1);
          } else {
            zRow.push(parseFloat(val));
            maskRow.push(0);
          }
        });

        zData.push(zRow);
        maskData.push(maskRow);
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
          width: 10
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

      annotations.push({
        x: (start + end) / 2,
        y: -1.5,
        xref: 'x',
        yref: 'y',
        text: cellType,
        showarrow: false,
        font: { size: 10, color: '#333' },
        align: 'center'
      });

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

    if (!xLabels.length || !yLabels.length || !zData.length) return null;

    return (
      <div id={`plot-${tpKey}`} key={tpKey} style={{ marginBottom: "3rem" }}>
        <h3>{tpKey}</h3>
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
              hovertemplate: "%{y}<br>cluster %{x}: %{z}<extra></extra>"
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
              constrain: 'domain'
            },
            xaxis: {
              tickvals: xLabels.map((_, i) => i),
              ticktext: xLabels,
              tickangle: -45,
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
      </div>
    );
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Arabidopsis Gene Expression Explorer</h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <Select
          options={organelleOptions.map(o => ({ value: o, label: o }))}
          value={selectedOrganelle ? { value: selectedOrganelle, label: selectedOrganelle } : null}
          onChange={opt => setSelectedOrganelle(opt?.value || null)}
          placeholder="Search organelle..."
          isSearchable
          styles={{ container: base => ({ ...base, width: 300 }) }}
        />

        <Select
          isMulti
          options={geneOptions.map(g => ({ value: g, label: g }))}
          value={selectedGenes.map(g => ({ value: g, label: g }))}
          onChange={opts => setSelectedGenes(opts.map(o => o.value))}
          placeholder="Select genes"
          isSearchable
          isDisabled={!selectedOrganelle}
          styles={{ container: base => ({ ...base, width: 300 }) }}
        />

        <Select
          isMulti
          options={cellTypes.map(ct => ({ value: ct, label: ct }))}
          value={selectedCellTypes.map(ct => ({ value: ct, label: ct }))}
          onChange={(opts) => setSelectedCellTypes((opts || []).map(o => o.value))}
          placeholder="Select cell types"
          closeMenuOnSelect={false}
          isSearchable
          styles={{ container: base => ({ ...base, width: 300 }) }}
        />

        <Select
          isMulti
          options={genotypes.map(g => ({ value: g, label: g }))}
          value={selectedGenotypes.map(g => ({ value: g, label: g }))}
          onChange={(opts) => setSelectedGenotypes((opts || []).map(o => o.value))}
          placeholder="Select genotypes"
          closeMenuOnSelect={false}
          isSearchable
          styles={{ container: base => ({ ...base, width: 300 }) }}
        />

        {timepoints.length > 1 && (
          <div style={{ width: 300, paddingTop: '1rem' }}>
            <strong>Timepoint</strong>
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
            />
          </div>
        )}
      </div>

      {timepoints
        .filter(tp => tp >= selectedTimepointRange[0] && tp <= selectedTimepointRange[1])
        .map(tp => renderPlot(tp))}
    </div>
  );
}

export default App;
