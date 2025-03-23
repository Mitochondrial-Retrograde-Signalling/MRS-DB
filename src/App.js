import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import Select from "react-select";

function App() {
  const [data, setData] = useState(null);
  const [geneList, setGeneList] = useState([]);
  const [selectedGene, setSelectedGene] = useState("");
  const [heatmaps, setHeatmaps] = useState([]);
  const [showDescription, setShowDescription] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selectedOrganelle, setSelectedOrganelle] = useState("");
  const [organelleList, setOrganelleList] = useState([]);

  const getGeneDescription = () => {
    if (!data || !selectedOrganelle || !selectedGene) return "";
  
    // Try to get description from first available timepoint
    const firstTP = Object.keys(data).find((tp) =>
      data[tp]?.[selectedOrganelle]?.["wild type"]?.[selectedGene]
    );
  
    return (
      data?.[firstTP]?.[selectedOrganelle]?.["wild type"]?.[selectedGene]?.["Gene Info"]
        ?.["Description"] || "No description available."
    );
  };
  
  useEffect(() => {
    if (!data || !selectedOrganelle) return;
  
    // Collect unique genes across all timepoints for selected organelle
    const genesSet = new Set();
    Object.values(data).forEach((tpData) => {
      const organelleData = tpData[selectedOrganelle];
      if (organelleData?.["wild type"]) {
        Object.keys(organelleData["wild type"]).forEach((gene) =>
          genesSet.add(gene)
        );
      }
    });
  
    const genes = Array.from(genesSet).sort();
    setGeneList(genes);
    setSelectedGene(genes[0] || "");
  }, [data, selectedOrganelle]);
  
  const toggleExpand = (tp) => {
    setExpanded((prev) => ({
      ...prev,
      [tp]: !prev[tp],
    }));
  };

  useEffect(() => {
    fetch("/data/test_data.json")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        const firstTP = Object.keys(json)[0];
        const organelles = Object.keys(json[firstTP]);
        setOrganelleList(organelles);
      });
  }, []);

  useEffect(() => {
    if (!data || !selectedGene) return;

    const genotypes = ["wild type", "mutant"];
    const timepoints = Object.keys(data);
    const newHeatmaps = [];

    timepoints.forEach((tp) => {
      const rawSPD = data[tp][selectedOrganelle];
      const cellClusterMap = {};

      genotypes.forEach((genotype) => {
        const geneData = rawSPD[genotype][selectedGene]["Cell type"];
        Object.entries(geneData).forEach(([cellType, clusters]) => {
          if (!cellClusterMap[cellType]) cellClusterMap[cellType] = new Set();
          Object.keys(clusters).forEach((cluster) =>
            cellClusterMap[cellType].add(cluster)
          );
        });
      });

      const orderedCellTypes = Object.keys(cellClusterMap).sort();
      const xMeta = []; // track full pair (cellType + cluster)
      const cellTypeBoundaries = [];
      
      orderedCellTypes.forEach((cellType) => {
        const clusters = Array.from(cellClusterMap[cellType]).sort();
        cellTypeBoundaries.push({
          cellType,
          start: xMeta.length,
          count: clusters.length,
        });
        clusters.forEach((cluster) => {
          xMeta.push({ cellType, cluster });
        });
      });
      
      const x = xMeta.map(({ cluster }) => cluster); // just cluster labels for axis
      

      const z = genotypes.map((genotype) =>
        xMeta.map(({ cellType, cluster }) => {
          const val =
            rawSPD[genotype][selectedGene]["Cell type"]?.[cellType]?.[cluster];
          return val === "ns" || val === undefined ? 0 : val;
        })
      );
      

      const text = genotypes.map((genotype, rowIndex) =>
        xMeta.map(({ cluster }) => {
          const clusterLabel = cluster.match(/Cluster\s+(\d+)/)?.[1] || cluster;
          const val =
            rawSPD[genotype][selectedGene]["Cell type"]?.[xMeta[rowIndex]?.cellType]?.[cluster];
          const v = val === "ns" || val === undefined ? 0 : val;
      
          return v === 0
            ? `Cluster: ${clusterLabel}<br>Genotype: ${genotype}<br>log2FC: Not Significant`
            : `Cluster: ${clusterLabel}<br>Genotype: ${genotype}<br>log2FC: ${v.toFixed(1)}`;
        })
      );
      

      const flatZ = z.flat();
      const maxAbs = Math.max(...flatZ.map((val) => Math.abs(val)));

      const annotations = cellTypeBoundaries.map(({ cellType, start, count }) => {
        const clusterWidthPx = 40;
        const boxWidthPx = count * clusterWidthPx;
        const textPx = cellType.length * 7;
        const needsShortening = textPx > boxWidthPx;
        const displayText = needsShortening
          ? cellType.slice(0, Math.floor(boxWidthPx / 7) - 3) + "…"
          : cellType;
        const fontSize = needsShortening ? 10 : 12;

        return {
          x: start + count / 2 - 0.5,
          y: 1.1,
          text: displayText,
          hovertext: cellType,
          hoverinfo: "text",
          showarrow: false,
          xref: "x",
          yref: "paper",
          font: {
            size: fontSize,
            color: "black",
          },
          xanchor: "center",
          yanchor: "middle",
        };
      });

      const shapes = [];

      cellTypeBoundaries.forEach(({ start, count }, idx) => {
        if (idx > 0) {
          shapes.push({
            type: "line",
            x0: start - 0.5,
            x1: start - 0.5,
            y0: -0.5,
            y1: 1.5,
            line: { color: "black", width: 2 },
          });
        }

        shapes.push({
          type: "path",
          xref: "x",
          yref: "paper",
          path: `
            M ${start - 0.5},1.25
            H ${start + count - 0.5}
            V 0.97
            H ${start - 0.5}
            Z
          `,
          fillcolor: "#e6e6e6",
          line: {
            color: "black",
            width: 2,
          },
        });
      });

      // Add vertical bounding lines
      shapes.push(
        {
          type: "line",
          xref: "x",
          yref: "y",
          x0: -0.5,
          x1: -0.5,
          y0: -0.5,
          y1: 1.5,
          line: { color: "black", width: 2 },
        },
        {
          type: "line",
          xref: "x",
          yref: "y",
          x0: x.length - 0.5,
          x1: x.length - 0.5,
          y0: -0.5,
          y1: 1.5,
          line: { color: "black", width: 2 },
        }
      );

      newHeatmaps.push({
        timepoint: tp,
        x,
        y: ["Wild Type", "Mutant"],
        z,
        maxAbs,
        annotations,
        shapes,
        text,
      });
    });

    setHeatmaps(newHeatmaps);

    // Initialize expanded states to true
    const initialExpanded = {};
    newHeatmaps.forEach(hm => {
      initialExpanded[hm.timepoint] = true;
    });
    setExpanded(initialExpanded);
    
  }, [data, selectedGene]);

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Gene Expression Heatmaps by Timepoint</h2>

    <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      <Select
        options={organelleList.map((org) => ({ value: org, label: org }))}
        value={selectedOrganelle ? { value: selectedOrganelle, label: selectedOrganelle } : null}
        onChange={(selected) => setSelectedOrganelle(selected.value)}
        placeholder="Select organelle..."
        styles={{ container: (base) => ({ ...base, width: 300 }) }}
      />

      <Select
        options={geneList.map((gene) => ({ value: gene, label: gene }))}
        value={selectedGene ? { value: selectedGene, label: selectedGene } : null}
        onChange={(selected) => setSelectedGene(selected.value)}
        placeholder="Select gene..."
        isDisabled={!selectedOrganelle}
        isSearchable
        styles={{ container: (base) => ({ ...base, width: 300 }) }}
      />
    {/* </div> */}


      <label style={{ display: "block", marginBottom: "1rem", opacity: selectedGene ? 1 : 0.5 }}>
        <input
          type="checkbox"
          checked={showDescription}
          onChange={(e) => setShowDescription(e.target.checked)}
          disabled={!selectedGene}
          style={{ marginRight: "0.5rem" }}
        />
        Show gene description
      </label>
    </div>

      {showDescription && data && selectedGene && (
        <div
          style={{
            background: "#f8f8f8",
            border: "1px solid #ccc",
            borderRadius: "6px",
            padding: "1rem",
            marginBottom: "1rem",
            maxWidth: "90%",
          }}
        >
          <strong>Description:</strong> {getGeneDescription()}
        </div>
      )}

      {heatmaps.map((hm) => (
        <div key={hm.timepoint} style={{ marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, marginRight: "1rem" }}>
              Timepoint {hm.timepoint}
            </h3>
            <button onClick={() => toggleExpand(hm.timepoint)}>
              {expanded[hm.timepoint] ? "Hide" : "Show"}
            </button>
          </div>

          {expanded[hm.timepoint] !== false && (
            <Plot
              data={[
                {
                  z: hm.z,
                  x: hm.x,
                  y: hm.y,
                  text: hm.text,
                  type: "heatmap",
                  colorscale: [
                    [0, "blue"],
                    [0.5, "white"],
                    [1, "red"],
                  ],
                  zmid: 0,
                  zmin: -hm.maxAbs,
                  zmax: hm.maxAbs,
                  xgap: 1,
                  ygap: 1,
                  hoverongaps: false,
                  colorbar: {
                    title: "Expression",
                    tickformat: ".1f",
                  },
                  hovertemplate: "%{text}<extra></extra>",
                },
              ]}
              layout={{
                title: "",
                xaxis: {
                  title: "Clusters",
                  tickangle: 270,
                  tickmode: "array",
                  tickvals: hm.x.map((_, i) => i),
                  ticktext: hm.x.map((label) => {
                    const match = label.match(/Cluster\s+(\d+)/);
                    return match ? match[0] : label;
                  }),
                },
                yaxis: {
                  title: "Genotype",
                  automargin: true,
                  showline: false,
                  zeroline: false,
                  showgrid: false,
                },
                annotations: hm.annotations,
                shapes: hm.shapes,
                margin: { l: 100, b: 100, t: 40 },
              }}
              style={{ width: "100%", height: "230px" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default App;
