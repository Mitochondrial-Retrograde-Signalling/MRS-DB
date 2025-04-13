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
      console.log("Available genes for", selectedOrganelle, ":", genes);
    }
  }, [selectedOrganelle, allGenesByOrganelle]);

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
    const xLabels = xMeta.map(k => {
      const [ct, cl] = k.split("||");
      return `${ct}<br>${cl.replace("log2FC_", "")}`;
    });

    const yLabels = [];
    const zData = [];
    const maskData = [];

    selectedGenes.forEach(gene => {
      selectedGenotypes.forEach(genotype => {
        const yLabel = `${gene} / ${genotype}`;
        yLabels.push(yLabel);

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

    return (
      <div key={tpKey} style={{ marginBottom: "3rem" }}>
        <h3>{tpKey}</h3>
        <Plot
          data={[
            {
              z: zData,
              x: xLabels.map((_, i) => i),
              y: yLabels,
              type: "heatmap",
              colorscale: "RdBu",
              zmid: 0,
              hoverongaps: false,
              hovertemplate: "%{y}<br>%{x}: %{z}<extra></extra>"
            },
            {
              z: maskData,
              x: xLabels.map((_, i) => i),
              y: yLabels,
              type: "heatmap",
              colorscale: [[0, "rgba(0,0,0,0)"], [1, "lightgray"]],
              showscale: false,
              hoverinfo: "skip",
              opacity: 1
            }
          ]}
          layout={{
            margin: { l: 180, r: 30, t: 40, b: 120 },
            yaxis: { automargin: true },
            xaxis: {
              tickangle: -45,
              tickvals: xLabels.map((_, i) => i),
              ticktext: xLabels,
              automargin: true
            },
            autosize: true,
            responsive: true
          }}
          config={{ responsive: true }}
          style={{ width: "100%", height: yLabels.length * 55 + 120 }}
        />
      </div>
    );
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Organelle, Gene, Cell Type, Genotype & Timepoint Selector</h2>

      {/* Organelle Dropdown */}
      <Select
        options={organelleOptions.map(o => ({ value: o, label: o }))}
        value={selectedOrganelle ? { value: selectedOrganelle, label: selectedOrganelle } : null}
        onChange={opt => {
          console.log("Selected Organelle:", opt?.value);
          setSelectedOrganelle(opt?.value || null);
        }}
        placeholder="Search organelle..."
        isSearchable
        styles={{ container: base => ({ ...base, width: 300, marginBottom: "1rem" }) }}
      />

      {/* Gene Dropdown */}
      <Select
        isMulti
        options={geneOptions.map(g => ({ value: g, label: g }))}
        value={selectedGenes.map(g => ({ value: g, label: g }))}
        onChange={opts => {
          const selected = opts.map(o => o.value);
          console.log("Selected Genes:", selected);
          setSelectedGenes(selected);
        }}
        placeholder="Select genes"
        isSearchable
        isDisabled={!selectedOrganelle}
        styles={{ container: base => ({ ...base, width: 400, marginBottom: "1rem" }) }}
      />

      {/* Cell Type Multi-Select */}
      <Select
        isMulti
        options={[{ value: "__ALL__", label: "All" }, ...cellTypes.map(ct => ({ value: ct, label: ct }))]}
        value={selectedCellTypes.map(ct => ({ value: ct, label: ct }))}
        onChange={(selectedOptions) => {
          const values = (selectedOptions || []).map(o => o.value);
          if (values.includes("__ALL__")) {
            const all = selectedCellTypes.length === cellTypes.length ? [] : cellTypes;
            setSelectedCellTypes(all);
            console.log("Selected Cell Types:", all);
          } else {
            setSelectedCellTypes(values);
            console.log("Selected Cell Types:", values);
          }
        }}
        placeholder="Select cell types"
        closeMenuOnSelect={false}
        isSearchable
        styles={{ container: base => ({ ...base, width: 400, marginBottom: "1rem" }) }}
        components={{
          Option: ({ data, innerRef, innerProps, isSelected }) => {
            const isAll = data.value === "__ALL__";
            const isChecked = isAll
              ? selectedCellTypes.length === cellTypes.length
              : isSelected;
            return (
              <div ref={innerRef} {...innerProps} style={{ padding: "0.5rem 1rem", display: "flex", alignItems: "center" }}>
                <input type="checkbox" checked={isChecked} readOnly style={{ marginRight: "0.5rem" }} />
                {data.label}
              </div>
            );
          }
        }}
      />

      {/* Genotype Multi-Select */}
      <Select
        isMulti
        options={[{ value: "__ALL__", label: "All" }, ...genotypes.map(g => ({ value: g, label: g }))]}
        value={selectedGenotypes.map(g => ({ value: g, label: g }))}
        onChange={(selectedOptions) => {
          const values = (selectedOptions || []).map(o => o.value);
          if (values.includes("__ALL__")) {
            const all = selectedGenotypes.length === genotypes.length ? [] : genotypes;
            setSelectedGenotypes(all);
            console.log("Selected Genotypes:", all);
          } else {
            setSelectedGenotypes(values);
            console.log("Selected Genotypes:", values);
          }
        }}
        placeholder="Select genotypes"
        closeMenuOnSelect={false}
        isSearchable
        styles={{ container: base => ({ ...base, width: 400, marginBottom: "1rem" }) }}
        components={{
          Option: ({ data, innerRef, innerProps, isSelected }) => {
            const isAll = data.value === "__ALL__";
            const isChecked = isAll
              ? selectedGenotypes.length === genotypes.length
              : isSelected;
            return (
              <div ref={innerRef} {...innerProps} style={{ padding: "0.5rem 1rem", display: "flex", alignItems: "center" }}>
                <input type="checkbox" checked={isChecked} readOnly style={{ marginRight: "0.5rem" }} />
                {data.label}
              </div>
            );
          }
        }}
      />

      {/* Timepoint Range Slider */}
      {timepoints.length > 1 && (
        <div style={{ marginTop: "2rem", width: 500 }}>
          <strong>Timepoint</strong>
          <Slider
            range
            min={timepoints[0]}
            max={timepoints[timepoints.length - 1]}
            value={selectedTimepointRange}
            onChange={(range) => {
              setSelectedTimepointRange(range);
              console.log("Selected Timepoint Range:", range);
            }}
            marks={timepoints.reduce((acc, tp) => {
              acc[tp] = tp.toString();
              return acc;
            }, {})}
            step={null}
            allowCross={false}
            trackStyle={[{ backgroundColor: "#37474f" }]}
            handleStyle={[
              { borderColor: "#37474f", backgroundColor: "white" },
              { borderColor: "#37474f", backgroundColor: "white" }
            ]}
            railStyle={{ backgroundColor: "#cfd8dc" }}
          />
        </div>
      )}

      {/* Plot one heatmap per selected timepoint */}
      {timepoints
        .filter(tp => tp >= selectedTimepointRange[0] && tp <= selectedTimepointRange[1])
        .map(tp => renderPlot(tp))}
    </div>
  );
}

export default App;
