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

      setData(newData);
      setTimepoints(Object.keys(tpMap));
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

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Organelle, Gene, Cell Type & Genotype Selector</h2>

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

      {/* Cell Type Selector */}
      <Select
        isMulti
        options={[{ value: "__ALL__", label: "All" }, ...cellTypes.map(ct => ({ value: ct, label: ct }))]}
        value={selectedCellTypes.map(ct => ({ value: ct, label: ct }))}
        onChange={(selectedOptions) => {
          if (!selectedOptions) {
            setSelectedCellTypes([]);
            console.log("Selected Cell Types: []");
            return;
          }
          const values = selectedOptions.map(o => o.value);
          if (values.includes("__ALL__")) {
            if (selectedCellTypes.length === cellTypes.length) {
              setSelectedCellTypes([]);
              console.log("Deselected all Cell Types");
            } else {
              setSelectedCellTypes(cellTypes);
              console.log("Selected all Cell Types:", cellTypes);
            }
          } else {
            setSelectedCellTypes(values);
            console.log("Selected Cell Types:", values);
          }
        }}
        placeholder="Select cell types"
        closeMenuOnSelect={false}
        hideSelectedOptions={false}
        isSearchable
        styles={{
          container: base => ({ ...base, width: 400, marginTop: "1rem", marginBottom: "1rem" }),
        }}
        components={{
          Option: ({ data, innerRef, innerProps, isSelected }) => {
            const isAll = data.value === "__ALL__";
            const isChecked = isAll
              ? selectedCellTypes.length === cellTypes.length
              : isSelected;

            return (
              <div
                ref={innerRef}
                {...innerProps}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: innerProps.isFocused ? "#f1f1f1" : "white",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  style={{ marginRight: "0.5rem" }}
                />
                {data.label}
              </div>
            );
          }
        }}
      />

      {/* Genotype Selector */}
      <Select
        isMulti
        options={[{ value: "__ALL__", label: "All" }, ...genotypes.map(g => ({ value: g, label: g }))]}
        value={selectedGenotypes.map(g => ({ value: g, label: g }))}
        onChange={(selectedOptions) => {
          if (!selectedOptions) {
            setSelectedGenotypes([]);
            console.log("Selected Genotypes: []");
            return;
          }
          const values = selectedOptions.map(o => o.value);
          if (values.includes("__ALL__")) {
            if (selectedGenotypes.length === genotypes.length) {
              setSelectedGenotypes([]);
              console.log("Deselected all Genotypes");
            } else {
              setSelectedGenotypes(genotypes);
              console.log("Selected all Genotypes:", genotypes);
            }
          } else {
            setSelectedGenotypes(values);
            console.log("Selected Genotypes:", values);
          }
        }}
        placeholder="Select genotypes"
        closeMenuOnSelect={false}
        hideSelectedOptions={false}
        isSearchable
        styles={{
          container: base => ({ ...base, width: 400, marginTop: "1rem", marginBottom: "1rem" }),
        }}
        components={{
          Option: ({ data, innerRef, innerProps, isSelected }) => {
            const isAll = data.value === "__ALL__";
            const isChecked = isAll
              ? selectedGenotypes.length === genotypes.length
              : isSelected;

            return (
              <div
                ref={innerRef}
                {...innerProps}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: innerProps.isFocused ? "#f1f1f1" : "white",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  style={{ marginRight: "0.5rem" }}
                />
                {data.label}
              </div>
            );
          }
        }}
      />
    </div>
  );
}

export default App;
