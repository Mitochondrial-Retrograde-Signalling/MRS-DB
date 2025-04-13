import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import Select from "react-select";

function App() {
  const [data, setData] = useState({});
  const [organelleOptions, setOrganelleOptions] = useState([]);
  const [selectedOrganelle, setSelectedOrganelle] = useState(null);
  const [geneOptions, setGeneOptions] = useState([]);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [timepoints, setTimepoints] = useState([]); // activate later
  const [selectedTimepoints, setSelectedTimepoints] = useState([]);
  const [visibleTimepoints, setVisibleTimepoints] = useState({});
  const [cellTypes, setCellTypes] = useState([]); // activate later
  const [genotypes, setGenotypes] = useState([]); // activate later
  const [allGenesByOrganelle, setAllGenesByOrganelle] = useState({});

  useEffect(() => {
    const files = ["1h.json", "2h.json"];
    Promise.all(files.map(f => fetch(`/data/processed/${f}`).then(res => res.json()))).then(jsons => {
      const newData = {};
      const organelles = new Set();
      const allGenesByOrg = {};
      const allCellTypes = new Set();
      const allGenotypes = new Set();
      const tpMap = {};

      files.forEach((file, i) => {
        const tp = file.replace(".json", "");
        tpMap[tp] = true;
        newData[tp] = jsons[i];

        Object.entries(jsons[i]).forEach(([organelle, genes]) => {
          organelles.add(organelle);
          if (!allGenesByOrg[organelle]) allGenesByOrg[organelle] = new Set();

          Object.entries(genes).forEach(([gene, geneData]) => {
            allGenesByOrg[organelle].add(gene);
            Object.entries(geneData).forEach(([genotype, cellMap]) => {
              if (genotype === "Details") return;
              allGenotypes.add(genotype);
              Object.keys(cellMap).forEach(cellType => {
                allCellTypes.add(cellType);
              });
            });
          });
        });
      });

      setData(newData);
      setTimepoints(Object.keys(tpMap));
      setSelectedTimepoints(Object.keys(tpMap));
      setOrganelleOptions(Array.from(organelles).sort());
      setAllGenesByOrganelle(allGenesByOrg);
      setCellTypes(Array.from(allCellTypes).sort());
      setGenotypes(Array.from(allGenotypes).sort());

      const vis = {};
      Object.keys(tpMap).forEach(tp => vis[tp] = true);
      setVisibleTimepoints(vis);
    });
  }, []);

  useEffect(() => {
    if (selectedOrganelle && allGenesByOrganelle[selectedOrganelle]) {
      const genes = Array.from(allGenesByOrganelle[selectedOrganelle]).sort();
      setGeneOptions(genes);
      setSelectedGenes([]);
      console.log("These are the list of genes from the selected Organelle", genes)
    }
  }, [selectedOrganelle, allGenesByOrganelle]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedGenes.length) params.set("genes", selectedGenes.join(","));
    if (selectedOrganelle) params.set("organelle", selectedOrganelle);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    console.log(`${window.location.pathname}?${params.toString()}`)
  }, [selectedGenes, selectedOrganelle]);

  const toggleTimepoint = (tp) => {
    setVisibleTimepoints(prev => ({ ...prev, [tp]: !prev[tp] }));
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Gene Expression Heatmap Viewer</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <Select
          options={organelleOptions.map(o => ({ value: o, label: o }))}
          value={selectedOrganelle ? { value: selectedOrganelle, label: selectedOrganelle } : null}
          onChange={opt => setSelectedOrganelle(opt?.value || null)}
          placeholder="Select organelle"
          styles={{ container: base => ({ ...base, width: 250 }) }}
        />

        <Select
          isMulti
          options={geneOptions.map(g => ({ value: g, label: g }))}
          value={selectedGenes.map(g => ({ value: g, label: g }))}
          onChange={opts => setSelectedGenes(opts.map(o => o.value))}
          placeholder="Select genes"
          styles={{ container: base => ({ ...base, width: 300 }) }}
          isSearchable
          isDisabled={!selectedOrganelle}
        />
      </div>

      {selectedTimepoints.map(tp => (
        <div key={tp} style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ marginRight: "1rem" }}>{tp}</h3>
            <button onClick={() => toggleTimepoint(tp)}>
              {visibleTimepoints[tp] ? "Hide" : "Show"}
            </button>
          </div>

          {visibleTimepoints[tp] && selectedOrganelle && selectedGenes.length > 0 && (
            <PlotWrapper
              tp={tp}
              data={data}
              selectedOrganelle={selectedOrganelle}
              selectedGenes={selectedGenes}
            />
          )}
        </div>
      ))}

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        style={{
          position: "fixed",
          bottom: "1rem",
          right: "1rem",
          padding: "0.5rem 1rem",
          backgroundColor: "#1976d2",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        ↑ Top
      </button>
    </div>
  );
}

const PlotWrapper = ({ tp, data, selectedOrganelle, selectedGenes }) => {
  const organelleData = data[tp]?.[selectedOrganelle];
  if (!organelleData) return null;

  const xMetaSet = new Set();
  selectedGenes.forEach(gene => {
    const geneData = organelleData[gene];
    if (!geneData) return;
    Object.entries(geneData).forEach(([genotype, cellMap]) => {
      if (genotype === "Details") return;
      Object.entries(cellMap || {}).forEach(([cellType, clusters]) => {
        Object.keys(clusters || {}).forEach(cluster => {
          xMetaSet.add(`${cellType}||${cluster}`);
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
    const geneData = organelleData[gene];
    if (!geneData) return;

    Object.entries(geneData).forEach(([genotype, cellMap]) => {
      if (genotype === "Details") return;

      const yLabel = `${gene} / ${genotype}`;
      yLabels.push(yLabel);

      const zRow = [];
      const maskRow = [];

      xMeta.forEach(key => {
        const [cellType, cluster] = key.split("||");
        const val = geneData[genotype]?.[cellType]?.[cluster];

        if (val === "ns") {
          zRow.push(null);
          maskRow.push(1);
        } else {
          zRow.push(val ?? null);
          maskRow.push(0);
        }
      });

      zData.push(zRow);
      maskData.push(maskRow);
    });
  });

  return (
    <div style={{ overflowX: "auto" }}>
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
            hovertemplate: "%{y}<br>%{x}: %{z}<extra></extra>",
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
          title: `${selectedOrganelle} - ${tp}`,
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


export default App;
