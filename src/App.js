import React, { useEffect, useState } from 'react';
import Select from 'react-select';
import { matchSorter } from 'match-sorter';
import './App.css';
import { toast } from 'react-toastify';
import GeneExpressionTable from './components/GeneExpressionTable';

function App() {
  const [geneListOptions, setGeneListOptions] = useState([]);
  const [allGenesByGeneList, setAllGenesByGeneList] = useState({});
  const [selectedGenotype, setSelectedGenotype] = useState([]);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [selectedCellTypes, setSelectedCellTypes] = useState([]);
  const [geneLimitReached, setGeneLimitReached] = useState(false);

  const [data, setData] = useState({});
  const [timepoints, setTimepoints] = useState([]);
  const [selectedTimepointRange, setSelectedTimepointRange] = useState([0, 0]);

  const [geneDetailsByGeneList, setGeneDetailsByGeneList] = useState({});
  const [cellTypes, setCellTypes] = useState([]);
  const [genotypes, setGenotypes] = useState([]);

  const [selectedGeneList, setSelectedGeneList] = useState('');

  const [cellTypeSearch, setCellTypeSearch] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useEffect(() => {
    const files = ['1h.json', '3h.json', '6h.json'];
    Promise.all(
      files.map(f => fetch(`/data/processed/${f}`).then(res => res.json()))
    ).then(jsons => {
      const newData = {};
      const geneLists = new Set();
      const allGenesByGeneList = {};
      const allCellTypes = new Set();
      const allGenotypes = new Set();
      const tpMap = {};
      const geneDetailsByList = {};

      files.forEach((file, i) => {
        const json = jsons[i];
        const tp = `${json.Timepoint}h`;
        tpMap[tp] = true;
        newData[tp] = json.GeneList;

        Object.entries(json.GeneList).forEach(([geneList, genes]) => {
          geneLists.add(geneList);
          if (!allGenesByGeneList[geneList]) allGenesByGeneList[geneList] = new Set();
          if (!geneDetailsByList[geneList]) geneDetailsByList[geneList] = {};

          Object.entries(genes).forEach(([gene, geneData]) => {
            allGenesByGeneList[geneList].add(gene);

            const geneName = geneData?.Details?.GeneName || '';
            const label = geneName ? `${gene} (${geneName})` : gene;
            const description = geneData?.Details?.Description || '';

            geneDetailsByList[geneList][gene] = {
              id: gene,
              name: geneName,
              label,
              description
            };

            Object.entries(geneData).forEach(([genotype, cellMap]) => {
              if (genotype === 'Details') return;
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
      setGeneListOptions(Array.from(geneLists).sort());
      setAllGenesByGeneList(allGenesByGeneList);
      setGeneDetailsByGeneList(geneDetailsByList);
      setCellTypes(Array.from(allCellTypes).sort());
      setGenotypes(Array.from(allGenotypes).sort());
    });
  }, []);

  const geneOptions = selectedGeneList && geneDetailsByGeneList[selectedGeneList]
  ? Object.values(geneDetailsByGeneList[selectedGeneList]).map(({ id, label }) => ({
      value: id,
      label: label || id,
    }))
  : [];

  const CustomValue = () => (
    <div style={{ fontStyle: 'italic', color: '#999', paddingLeft: '6px' }}>
      Select maximum of 10 genes
    </div>
  );
  
  return (
    <div className="app-wrapper">
      <header className="top-bar">
        <img src="/zju-logo.png" alt="ZJU Logo" className="zju-logo" />
      </header>

      <div className="app-container">
        {sidebarVisible && (
          <div className="sidebar">
            <h2>Filter Search</h2>

            {/* Gene List Dropdown */}
            <div className="search-section">
              <label>Gene List:</label>
              <Select
                options={geneListOptions.map(list => ({ value: list, label: list }))}
                value={selectedGeneList ? { value: selectedGeneList, label: selectedGeneList } : null}
                onChange={(opt) => setSelectedGeneList(opt?.value || '')}
                placeholder="Select Gene List..."
                isSearchable
                styles={{
                  container: base => ({ ...base, width: '100%' }),
                  menu: base => ({ ...base, zIndex: 9999 }),
                }}
              />
            </div>

            {/* Genotype Dropdown */}
            <div className="search-section">
              <label>Genotype:</label>
              <Select
                isMulti
                options={genotypes.map(gt => ({ value: gt, label: gt }))}
                value={selectedGenotype.map(gt => ({ value: gt, label: gt }))}
                onChange={(opts) => setSelectedGenotype((opts || []).map(o => o.value))}
                placeholder="Select genotypes..."
                isSearchable
                styles={{
                  container: base => ({ ...base, width: '100%' }),
                  control: base => ({
                    ...base,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    minHeight: 40,
                    height: 40,
                    backgroundColor: 'white',
                  }),
                  valueContainer: (base) => ({
                    ...base,
                    padding: '0 6px',
                    overflow: 'hidden',
                    flexWrap: 'nowrap',
                  }),
                  multiValue: () => ({ display: 'none' }), // ✅ hide default tags
                  indicatorsContainer: base => ({
                    ...base,
                    marginLeft: 'auto',
                    height: '100%',
                    alignItems: 'center'
                  }),
                  dropdownIndicator: base => ({
                    ...base,
                    padding: '0 8px',
                    color: '#666'
                  }),
                  clearIndicator: () => ({ display: 'none' }),
                  menu: base => ({ ...base, zIndex: 9999 }),
                }}
              />



              {/* Custom Pills Below */}
              <div className="pill-container">
                {selectedGenotype.map(gt => (
                  <div
                    key={gt}
                    className="pill"
                    onClick={() =>
                      setSelectedGenotype(selectedGenotype.filter(item => item !== gt))
                    }
                  >
                    {gt} <span className="pill-x">×</span>
                  </div>
                ))}
              </div>
            </div>


            {/* Gene Multi-Select with fuzzy search */}
            <div className="search-section">
              <label>Genes:</label>
              <Select
                isMulti
                options={geneOptions}
                value={selectedGenes.map(g => geneOptions.find(o => o.value === g) || { value: g, label: g })}
                onChange={(opts) => {
                  const selected = (opts || []).map(o => o.value);
                  if (selected.length <= 10) {
                    setSelectedGenes(selected);
                    setGeneLimitReached(false);
                  } else {
                    setGeneLimitReached(true);
                  }
                }}
                placeholder={selectedGeneList ? "Select genes..." : "Select a Gene List first"}
                isSearchable
                isDisabled={!selectedGeneList}
                styles={{
                  container: base => ({ ...base, width: '100%' }),
                  control: base => ({
                    ...base,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    minHeight: 40,
                    height: 40,
                    backgroundColor: selectedGeneList ? 'white' : '#f3f3f3',
                  }),
                  valueContainer: base => ({
                    ...base,
                    padding: '0 6px',
                    overflow: 'hidden',
                    flexWrap: 'nowrap',
                  }),
                  multiValue: () => ({ display: 'none' }),
                  indicatorsContainer: base => ({
                    ...base,
                    marginLeft: 'auto',
                    height: '100%',
                    alignItems: 'center'
                  }),
                  dropdownIndicator: base => ({
                    ...base,
                    padding: '0 8px',
                    color: '#666'
                  }),
                  clearIndicator: () => ({ display: 'none' }),
                  menu: base => ({ ...base, zIndex: 9999 }),
                }}
              />

              {/* ✅ Limit warning goes right below the pills */}
              {geneLimitReached && (
                <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#d9534f', marginTop: '4px' }}>
                  You can only select up to 10 genes.
                </div>
              )}
              
              {/* ✅ Pills below input */}
              <div className="pill-container">
                {selectedGenes.map(g => {
                  const label = geneDetailsByGeneList[selectedGeneList]?.[g]?.label || g;
                  return (
                    <div
                      key={g}
                      className="pill"
                      onClick={() => {
                        setSelectedGenes(selectedGenes.filter(item => item !== g));
                        setGeneLimitReached(false); // clear warning when one is removed
                      }}
                    >
                      {label} <span className="pill-x">×</span>
                    </div>
                  );
                })}
              </div>
            </div>





            {/* Cell Type Filter */}
            <div className="search-section">
              <label>Cell Types:</label>
              <Select
                isMulti
                options={cellTypes.map(ct => ({ value: ct, label: ct }))}
                value={selectedCellTypes.map(ct => ({ value: ct, label: ct }))}
                onChange={(opts) => setSelectedCellTypes((opts || []).map(o => o.value))}
                placeholder="Select cell types..."
                isSearchable
                styles={{
                  container: base => ({ ...base, width: '100%' }),
                  control: base => ({
                    ...base,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    minHeight: 40,
                    height: 40,
                    backgroundColor: 'white',
                  }),
                  valueContainer: base => ({
                    ...base,
                    padding: '0 6px',
                    overflow: 'hidden',
                    flexWrap: 'nowrap',
                  }),
                  multiValue: () => ({ display: 'none' }),
                  indicatorsContainer: base => ({
                    ...base,
                    marginLeft: 'auto',
                    height: '100%',
                    alignItems: 'center'
                  }),
                  dropdownIndicator: base => ({
                    ...base,
                    padding: '0 8px',
                    color: '#666'
                  }),
                  clearIndicator: () => ({ display: 'none' }),
                  menu: base => ({ ...base, zIndex: 9999 }),
                }}
              />

              {/* ✅ Custom pill-style tags */}
              <div className="pill-container">
                {selectedCellTypes.map(ct => (
                  <div
                    key={ct}
                    className="pill"
                    onClick={() =>
                      setSelectedCellTypes(selectedCellTypes.filter(item => item !== ct))
                    }
                  >
                    {ct} <span className="pill-x">×</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Toggle Sidebar */}
        <button
          className={`toggle-button ${sidebarVisible ? '' : 'collapsed'}`}
          onClick={() => setSidebarVisible(!sidebarVisible)}
        >
          {sidebarVisible ? '<<' : '>>'}
        </button>

        <div className="main-content">
          <h2>Main Content Area</h2>

          {selectedGenes.length > 0 && selectedGenotype.length > 0 && selectedCellTypes.length > 0 && selectedGeneList && (
            <GeneExpressionTable
              selectedGenes={selectedGenes}
              selectedGenotype={selectedGenotype}
              selectedCellTypes={selectedCellTypes}
              geneDetailsByGeneList={geneDetailsByGeneList}
              selectedGeneList={selectedGeneList}
              data={data}
            />
          )}

          {selectedGenes.length === 0 && (
            <p style={{ fontStyle: 'italic', color: '#888' }}>
              Please select at least one gene, genotype, and cell type to view the table.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;
