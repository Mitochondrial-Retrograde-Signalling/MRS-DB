import React, { useEffect, useState } from 'react';
import Select from 'react-select';
import { matchSorter } from 'match-sorter';
import './App.css';
import { toast } from 'react-toastify';
import GeneExpressionTable from './components/GeneExpressionTable';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import * as XLSX from "xlsx";

function App() {
  const [geneListOptions, setGeneListOptions] = useState([]);
  const [allGenesByGeneList, setAllGenesByGeneList] = useState({});
  const [selectedGenotype, setSelectedGenotype] = useState([]);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [selectedCellTypes, setSelectedCellTypes] = useState([]);
  const [geneLimitReached, setGeneLimitReached] = useState(false);
  const [selectedTimepointRange, setSelectedTimepointRange] = useState([0, 0]);
  const [selectedTimepoint, setSelectedTimepoint] = useState('1h');
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [cellTypes, setCellTypes] = useState([]);
  const [genotypes, setGenotypes] = useState([]);
  const genotypeOptions = [{ value: '*', label: 'Select All' }, ...genotypes.map(gt => ({ value: gt, label: gt }))];
  const cellTypeOptions = [{ value: '*', label: 'Select All' }, ...cellTypes.map(ct => ({ value: ct, label: ct }))];
  const [showCitation, setShowCitation] = useState(false);
  const [geneSearchInput, setGeneSearchInput] = useState('');


  const [data, setData] = useState({});
  const [timepoints, setTimepoints] = useState([]);


  const [geneDetailsByGeneList, setGeneDetailsByGeneList] = useState({});

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
      setSelectedTimepoint(`${numericTPs[0]}h`);
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
  
  const downloadTPData = () => {
    const tpKey = `${selectedTimepoint}`;
    const geneListData = data[tpKey]?.[selectedGeneList];
    if (!geneListData) return;
  
    const clusterMap = {};
    const allPairs = [];
  
    [...selectedCellTypes].sort().forEach(cellType => {
      const clusters = new Set();
      selectedGenes.forEach(gene => {
        selectedGenotype.forEach(genotype => {
          const clusterObj = geneListData?.[gene]?.[genotype]?.[cellType];
          if (clusterObj) {
            Object.keys(clusterObj).forEach(c => clusters.add(c));
          }
        });
      });
      const clusterList = Array.from(clusters).sort();
      clusterMap[cellType] = clusterList;
      clusterList.forEach(c => allPairs.push([cellType, c]));
    });
  
    const headerRow1 = ["Gene", "Genotype"];
    const headerRow2 = ["", ""];
  
    Object.entries(clusterMap).forEach(([cellType, clusters]) => {
      clusters.forEach(() => headerRow1.push(cellType));
      clusters.forEach(cl => headerRow2.push(cl));
    });
  
    const merges = [];
    let col = 2;
    Object.entries(clusterMap).forEach(([cellType, clusters]) => {
      if (clusters.length > 1) {
        merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + clusters.length - 1 } });
      }
      col += clusters.length;
    });
  
    const dataRows = [];
    selectedGenes.forEach(gene => {
      selectedGenotype.forEach(genotype => {
        const row = [gene, genotype];
        allPairs.forEach(([ct, cl]) => {
          const val = geneListData?.[gene]?.[genotype]?.[ct]?.[cl];
          row.push(val !== undefined && val !== null && !Number.isNaN(val) ? val : "no data");
        });
        dataRows.push(row);
      });
    });
  
    const sheetData = [headerRow1, headerRow2, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!merges"] = merges;
    ws["!cols"] = headerRow1.map(() => ({ wch: 15 }));
  
    const wb = XLSX.utils.book_new();
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFileName = `${tpKey}_data_${now}.xlsx`;
    const userFileName = prompt("Enter filename for download:", defaultFileName);


    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    if (userFileName) {
      XLSX.writeFile(wb, userFileName.endsWith('.xlsx') ? userFileName : `${userFileName}.xlsx`);
    }
  };
  

  const timepointLabels = {
    '1h': '1-hour Timepoint',
    '3h': '3-hour Timepoint',
    '6h': '6-hour Timepoint',
  };

  return (
    <div className="app-wrapper">
      <header className="top-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem'}}>
        <img src="/zju-logo.png" alt="Zhejiang University Logo" style={{ height: '42px' }} />
        <span className="partnership-text">in partnership with</span>
        <img src="/latrobe-logo.svg" alt="La Trobe University Logo" style={{ height: '50px' }} />
      </header>
      
      <div className="app-container">
        <div className={`sidebar ${sidebarVisible ? '' : 'collapsed'}`}>
          <button
            className="toggle-button"
            onClick={() => setSidebarVisible(!sidebarVisible)}
            title={sidebarVisible ? 'Hide filter' : 'Show filter'}
          >
            {sidebarVisible ? <FiChevronLeft /> : <FiChevronRight />}
          </button>

          {sidebarVisible && (
            <>
              <h2 style={{ textAlign: 'center' }}>Filter Search</h2>

              {/* Gene List Dropdown */}
              <div className="search-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>
                    Gene List
                  </label>
                  {selectedGeneList.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedGeneList([]);
                        setSelectedGenes([]); // Reset selected genes
                        setGeneLimitReached(false); // Also reset the limit warning if needed
                      }}
                      style={{
                        fontSize: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#007bff',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                
                <Select
                  options={geneListOptions.map(list => ({ value: list, label: list }))}
                  value={selectedGeneList ? { value: selectedGeneList, label: selectedGeneList } : null}
                  onChange={(opt) => {
                    const newGeneList = opt?.value || '';
                    setSelectedGeneList(newGeneList);
                    setSelectedGenes([]); // Reset selected genes
                    setGeneLimitReached(false); // Also reset the limit warning if needed
                  }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>
                    Genotype
                  </label>
                  {selectedGenotype.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedGenotype([]);
                      }}
                      style={{
                        fontSize: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#007bff',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Select
                  isMulti
                  options={genotypeOptions}
                  value={selectedGenotype.map(gt => ({ value: gt, label: gt }))}
                  onChange={(opts) => {
                    const values = (opts || []).map(o => o.value);
                    if (values.includes('*')) {
                      setSelectedGenotype(genotypes); // Select all
                    } else {
                      setSelectedGenotype(values);
                    }
                  }}
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

              {/* Gene Multi-Select */}
              <div className="search-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>
                    Genes (max of 10):
                    <span style={{ marginLeft: '6px', fontSize: '0.85rem', color: '#555' }}>
                      {selectedGenes.length} selected
                    </span>
                  </label>
                  {selectedGenes.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedGenes([]);
                        setGeneLimitReached(false);
                      }}
                      style={{
                        fontSize: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#007bff',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Select
                  isMulti
                  closeMenuOnSelect={false}
                  hideSelectedOptions={false}
                  options={
                    geneOptions.filter(opt =>
                      opt.label.toLowerCase().includes(geneSearchInput.toLowerCase())
                    )
                  }
                  inputValue={geneSearchInput}
                  onInputChange={(val, { action }) => {
                    // Don't clear search on selection
                    if (action !== 'input-blur' && action !== 'menu-close') {
                      setGeneSearchInput(val);
                    }
                  }}
                  value={selectedGenes.map(g => geneOptions.find(o => o.value === g) || { value: g, label: g })}
                  onChange={(opts, { action }) => {
                    const selected = (opts || []).map(o => o.value);
                    if (selected.length <= 10) {
                      setSelectedGenes(selected);
                      setGeneLimitReached(false);
                    } else {
                      setGeneLimitReached(true);
                    }

                    // Retain search value after selecting (key fix!)
                    if (action === 'select-option') {
                      setGeneSearchInput(geneSearchInput); // force re-setting current input
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


                {geneLimitReached && (
                  <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#d9534f', marginTop: '4px' }}>
                    You can only select up to 10 genes.
                  </div>
                )}

                <div className="pill-container">
                  {selectedGenes.map(g => {
                    const label = geneDetailsByGeneList[selectedGeneList]?.[g]?.label || g;
                    return (
                      <div
                        key={g}
                        className="pill"
                        onClick={() => {
                          setSelectedGenes(selectedGenes.filter(item => item !== g));
                          setGeneLimitReached(false);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>
                    Cell Types
                  </label>
                  {selectedCellTypes.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedCellTypes([]);
                      }}
                      style={{
                        fontSize: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#007bff',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Select
                  isMulti
                  options={cellTypeOptions}
                  value={selectedCellTypes.map(ct => ({ value: ct, label: ct }))}
                  onChange={(opts) => {
                    const values = (opts || []).map(o => o.value);
                    if (values.includes('*')) {
                      setSelectedCellTypes(cellTypes); // Select all
                    } else {
                      setSelectedCellTypes(values);
                    }
                  }}
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
            </>
          )}
        </div>


        <div className={`main-content ${sidebarVisible ? '' : 'expanded'}`}>
        {/* <h2>Main Content Area</h2> */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem', marginRight: '1.5rem' }}>
            <button
              onClick={() => setShowDescriptions(prev => !prev)}
              style={{
                padding: '10px 16px',
                backgroundColor: 'white',
                color: '#1a3c7c',
                border: '2px solid #1a3c7c',
                borderRadius: '6px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'background 0.2s, color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f5f8ff'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
            >
              {showDescriptions ? 'Hide Gene Descriptions' : 'View Gene Descriptions'}
            </button>

            <button
              style={{
                padding: '10px 16px',
                backgroundColor: '#0b4ca3',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'background 0.2s'
              }}
              onClick={ downloadTPData }
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#093f88'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0b4ca3'}
            >
              Download
            </button>
          </div>

          {timepoints.length > 0 && (
            <div className="tab-bar">
              {timepoints.map(tp => {
                const label = `${tp}h`;
                return (
                  <button
                    key={label}
                    className={`tab-button ${selectedTimepoint === label ? 'active' : ''}`}
                    onClick={() => setSelectedTimepoint(label)}
                  >
                    {timepointLabels[label] || label}
                  </button>
                );
              })}
            </div>
          )}
          {selectedGenes.length > 0 && selectedGenotype.length > 0 && selectedCellTypes.length > 0 && selectedGeneList && (
            <GeneExpressionTable
              selectedGenes={selectedGenes}
              selectedGenotype={selectedGenotype}
              selectedCellTypes={selectedCellTypes}
              geneDetailsByGeneList={geneDetailsByGeneList}
              selectedGeneList={selectedGeneList}
              data={{ [selectedTimepoint]: data[selectedTimepoint] }}
            />
          )}
          

          <footer
            style={{
              marginTop: '2rem',
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.85rem',
              color: '#666',
              backgroundColor: '#f8f8f8',
              borderTop: '1px solid #ddd',
            }}
          >
            © 2025 — This tool was developed by Zhejiang University in partnership with La Trobe University.
            Please cite as: <br />
            <em>Your Name, et al. (2025). <u>Title of the Study or Dataset</u>. Retrieved from https://yourwebapp.url</em>
          </footer>
          
          {selectedGenes.length === 0 && (
            <p style={{ fontStyle: 'italic', color: '#888', textIndent: '1.5rem' }}>
              Please select at least one gene, genotype, and cell type to view the table.
            </p>
          )}
        </div>



        {/* Description sidebar */}
        <div
          className={`description-sidebar ${showDescriptions ? 'visible' : 'hidden'}`}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              borderBottom: '2px solid #ccc',
            }}
          >
            <h3 style={{ margin: 0 }}>Gene Descriptions</h3>
            <button
              onClick={() => setShowDescriptions(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: '#666',
              }}
              title="Close"
            >
              ✕
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {selectedGenes.map((gene) => {
              const details = geneDetailsByGeneList[selectedGeneList]?.[gene];
              return (
                <li key={gene} style={{ marginBottom: '1rem' }}>
                  <strong>{details?.label || gene}</strong>
                  <p style={{ fontSize: '0.85rem', color: '#555' }}>
                    {details?.description || 'No description available.'}
                  </p>
                </li>
              );
            })}
          </ul>



        </div>


      </div>
    



    </div>
  );
}

export default App;
