import React, { useEffect, useState } from "react";
import Select from "react-select";

function App() {
  const [data, setData] = useState({});
  const [organelleOptions, setOrganelleOptions] = useState([]);
  const [selectedOrganelle, setSelectedOrganelle] = useState(null);
  const [geneOptions, setGeneOptions] = useState([]);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [timepoints, setTimepoints] = useState([]);
  const [allGenesByOrganelle, setAllGenesByOrganelle] = useState({});
  const [cellTypes, setCellTypes] = useState([]);
  const [genotypes, setGenotypes] = useState([]);

  // Load and process JSON files
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

      setData(newData);
      setTimepoints(Object.keys(tpMap));
      setOrganelleOptions(Array.from(organelles).sort());
      setAllGenesByOrganelle(allGenesByOrg);
      setCellTypes(Array.from(allCellTypes).sort());
      setGenotypes(Array.from(allGenotypes).sort());
    });
  }, []);

  // Update gene options when organelle changes
  useEffect(() => {
    if (selectedOrganelle && allGenesByOrganelle[selectedOrganelle]) {
      const genes = Array.from(allGenesByOrganelle[selectedOrganelle]).sort();
      setGeneOptions(genes);
      setSelectedGenes([]); // Reset on organelle change
      console.log("Available genes for", selectedOrganelle, ":", genes);
    }
  }, [selectedOrganelle, allGenesByOrganelle]);

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Organelle & Gene Selector</h2>

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

      {/* Display Selections */}
      {selectedOrganelle && (
        <p>
          <strong>Selected Organelle:</strong> {selectedOrganelle}
        </p>
      )}
      {selectedGenes.length > 0 && (
        <p>
          <strong>Selected Genes:</strong> {selectedGenes.join(", ")}
        </p>
      )}
    </div>
  );
}

export default App;
