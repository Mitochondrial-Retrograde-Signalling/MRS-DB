import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import Select from "react-select";

function App() {
  const [data, setData] = useState(null);
  const [geneList, setGeneList] = useState([]);
  const [selectedGene, setSelectedGene] = useState("");
  const [heatmaps, setHeatmaps] = useState([]);
  const [showDescription, setShowDescription] = useState(false);

  useEffect(() => {
    fetch("/data/test_data.json")
      .then((res) => res.json())
      .then((json) => {
        const genes = Object.keys(json["3"]["SPD"]["wild type"]); // Assuming all genes are consistent
        setGeneList(genes);
        setData(json);
        setSelectedGene(genes[0]);
      });
  }, []);

  useEffect(() => {
    if (!data || !selectedGene) return;

    const genotypes = ["wild type", "mutant"];
    const timepoints = Object.keys(data);
    const newHeatmaps = [];

    timepoints.forEach((tp) => {
      const rawSPD = data[tp]["SPD"];
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
  }, [data, selectedGene]);

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Gene Expression Heatmaps by Timepoint</h2>

      <Select
        options={geneList.map((gene) => ({ value: gene, label: gene }))}
        value={{ value: selectedGene, label: selectedGene }}
        onChange={(selected) => setSelectedGene(selected.value)}
        isSearchable
        placeholder="Search gene..."
        styles={{
          container: (base) => ({
            ...base,
            width: 300,
            marginBottom: "1rem",
          }),
        }}
      />

      <label style={{ display: "block", marginBottom: "1rem" }}>
        <input
          type="checkbox"
          checked={showDescription}
          onChange={(e) => setShowDescription(e.target.checked)}
          style={{ marginRight: "0.5rem" }}
        />
        Show gene description
      </label>

      {showDescription && data && selectedGene && (
        <div
          style={{
            background: "#f8f8f8",
            border: "1px solid #ccc",
            borderRadius: "6px",
            padding: "1rem",
            marginBottom: "1rem",
            maxWidth: "800px",
          }}
        >
          <strong>Description:</strong>{" "}
          {
            data["3"]["SPD"]["wild type"][selectedGene]["Gene Info"][
              "Description"
            ]
          }
        </div>
      )}

      {heatmaps.map((hm) => (
        <div key={hm.timepoint} style={{ marginBottom: "10px" }}>
          <h3 style={{ textAlign: "left" }}>Timepoint {hm.timepoint}</h3>
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
                tickvals: hm.x.map((_, i) => i), // index-based ticks
                ticktext: hm.x.map(label => {
                  const match = label.match(/Cluster\s+\d+/);
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
        </div>
      ))}
    </div>
  );
}

export default App;
