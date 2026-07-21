import React, { useCallback, useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import { matchSorter } from 'match-sorter';
import './App.css';
import { toast } from 'react-toastify';
import GeneExpressionTable from './components/GeneExpressionTable';
import PlotDisplay from './components/PlotDisplay';
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
  const [activePlotTab, setActivePlotTab] = useState('heatmap'); // 'heatmap' | 'dotplot' | 'umap'
  const [umapGeneIndex, setUmapGeneIndex] = useState(0);
  const [umapCarouselMode, setUmapCarouselMode] = useState('gene'); // 'gene' | 'timepoint'
  const [umapTimepointIndex, setUmapTimepointIndex] = useState(0);
  const [umapHighlightBy, setUmapHighlightBy] = useState('celltype'); // 'celltype' | 'cluster'
  const [umapHighlightValues, setUmapHighlightValues] = useState([]); // selected category values
  const [umapCategories, setUmapCategories] = useState({ celltypes: [], clusters: [] }); // from /api/umap-categories
  const [plotData, setPlotData] = useState(null);   // { plotType, image?, data? }
  const [plotLoading, setPlotLoading] = useState(false);
  const [plotError, setPlotError] = useState(null);


  const [data, setData] = useState({});
  const [timepoints, setTimepoints] = useState([]);
  const allTimepoints = timepoints.map(tp => `${tp}h`); // e.g. ['1h', '3h', '6h']


  const [geneDetailsByGeneList, setGeneDetailsByGeneList] = useState({});

  const [selectedGeneList, setSelectedGeneList] = useState('');

  const [cellTypeSearch, setCellTypeSearch] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const plotDebounceRef = useRef(null);
  // Keyed by "${timepoint}:${geneName}" → plotData object
  const umapCacheRef = useRef({});
  // Tracks cache keys currently being background-fetched (to avoid duplicate requests)
  const umapPrefetchingRef = useRef(new Set());
  const umapColoringCacheRef = useRef({}); // keyed by "${timepoint}:celltype" | "${timepoint}:cluster"
  const [umapColoringImages, setUmapColoringImages] = useState({ celltype: null, cluster: null });
  const [umapColoringLoading, setUmapColoringLoading] = useState(false);

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
  
  const API_BASE = '';

  // Check if all required selections are made
  const hasAllSelections = selectedGenes.length > 0 && selectedGenotype.length > 0 && selectedCellTypes.length > 0 && selectedGeneList;
  // Spatial mode only requires genes + gene list (no genotype / cell types needed)
  const hasSpatialSelections = selectedGenes.length > 0 && !!selectedGeneList;

  const fetchPlot = useCallback(async (plotType) => {
    if (!hasSpatialSelections) return;

    // Build GeneName list and geneLabels mapping from selected Gene IDs
    const detailsMap = geneDetailsByGeneList[selectedGeneList] || {};
    const geneLabels = {};
    const geneNames = selectedGenes.map(geneId => {
      const details = detailsMap[geneId];
      const geneName = details?.name || geneId;  // Fallback to Gene ID if no GeneName
      geneLabels[geneName] = details?.label || geneId;  // "GeneID (GeneName)" or just GeneID
      return geneName;
    });

    // UMAP: check frontend cache first — instant render with no spinner
    if (plotType === 'umap' && geneNames.length > 0) {
      const currentGene = geneNames[umapGeneIndex];
      const cacheKey = `${selectedTimepoint}:${currentGene}:${umapHighlightBy}:${[...umapHighlightValues].sort().join(',')}`;
      if (umapCacheRef.current[cacheKey]) {
        setPlotData(umapCacheRef.current[cacheKey]);
        setPlotError(null);
        setActivePlotTab('umap');
        return;
      }
    }

    setPlotLoading(true);
    setPlotError(null);
    try {
      const body = {
        plotType,
        genes: geneNames,
        geneLabels: geneLabels,
        genotypes: selectedGenotype,
        cellTypes: selectedCellTypes,
        timepoint: selectedTimepoint,
      };
      if (plotType === 'umap' && geneNames.length > 0) {
        body.gene = geneNames[umapGeneIndex];
        body.umapHighlightBy = umapHighlightBy;
        body.umapHighlightValues = umapHighlightValues;
      }
      const res = await fetch(`${API_BASE}/api/plot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Populate frontend UMAP cache so subsequent visits to this gene are instant
      if (plotType === 'umap' && body.gene) {
        umapCacheRef.current[`${selectedTimepoint}:${body.gene}:${umapHighlightBy}:${[...umapHighlightValues].sort().join(',')}`] = data;
      }
      setPlotData(data);
      setActivePlotTab(plotType);
    } catch (err) {
      setPlotError(err.message);
      setPlotData(null);
    } finally {
      setPlotLoading(false);
    }
  }, [hasSpatialSelections, selectedGenes, selectedGenotype, selectedCellTypes, selectedTimepoint, selectedGeneList, geneDetailsByGeneList, umapGeneIndex, umapHighlightBy, umapHighlightValues]);

  // Fetch plot with 300 ms debounce — prevents burst requests during rapid filter changes.
  // Stale plot stays visible (see PlotDisplay.js overlay) until the new result arrives.
  useEffect(() => {
    if (activePlotTab !== 'dotplot' && activePlotTab !== 'umap') return;
    if (!hasSpatialSelections) return;
    if (plotDebounceRef.current) clearTimeout(plotDebounceRef.current);
    plotDebounceRef.current = setTimeout(() => {
      fetchPlot(activePlotTab);
    }, 300);
    return () => {
      if (plotDebounceRef.current) clearTimeout(plotDebounceRef.current);
    };
  }, [activePlotTab, hasSpatialSelections, fetchPlot]);

  // Background prefetch: when UMAP tab is active, sequentially fetch remaining plots
  // so carousel navigation is instant.
  // Gene mode:      prefetch all genes at the current timepoint (existing behaviour).
  // Timepoint mode: prefetch all timepoints for the currently-displayed gene.
  useEffect(() => {
    if (activePlotTab !== 'umap' || !hasSpatialSelections) return;

    // Gene mode: no point prefetching if there is only one gene
    if (umapCarouselMode === 'gene' && selectedGenes.length <= 1) return;
    // Timepoint mode: no point prefetching if there is only one timepoint
    if (umapCarouselMode === 'timepoint' && allTimepoints.length <= 1) return;

    let cancelled = false;

    const runPrefetch = async () => {
      const detailsMap = geneDetailsByGeneList[selectedGeneList] || {};
      const tpList = timepoints.map(tp => `${tp}h`);

      if (umapCarouselMode === 'gene') {
        // ── Gene mode: iterate over all selected genes ──────────────────────
        for (const geneId of selectedGenes) {
          if (cancelled) break;
          const details = detailsMap[geneId];
          const geneName = details?.name || geneId;
          const geneLabel = details?.label || geneId;
          const cacheKey = `${selectedTimepoint}:${geneName}:${umapHighlightBy}:${[...umapHighlightValues].sort().join(',')}`;
          if (umapCacheRef.current[cacheKey] || umapPrefetchingRef.current.has(cacheKey)) continue;

          umapPrefetchingRef.current.add(cacheKey);
          try {
            const res = await fetch(`${API_BASE}/api/plot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                plotType: 'umap',
                genes: [geneName],
                geneLabels: { [geneName]: geneLabel },
                genotypes: [],
                cellTypes: [],
                timepoint: selectedTimepoint,
                gene: geneName,
                umapHighlightBy: umapHighlightBy,
                umapHighlightValues: umapHighlightValues,
              }),
            });
            if (res.ok && !cancelled) {
              umapCacheRef.current[cacheKey] = await res.json();
            }
          } catch { /* silently ignore prefetch failures */ }
          finally { umapPrefetchingRef.current.delete(cacheKey); }
        }
      } else {
        // ── Timepoint mode: iterate over all timepoints for the current gene ─
        const currentGeneId = selectedGenes[umapGeneIndex] ?? selectedGenes[0];
        if (!currentGeneId) return;
        const details = detailsMap[currentGeneId];
        const geneName = details?.name || currentGeneId;
        const geneLabel = details?.label || currentGeneId;

        for (const tp of tpList) {
          if (cancelled) break;
          const cacheKey = `${tp}:${geneName}:${umapHighlightBy}:${[...umapHighlightValues].sort().join(',')}`;
          if (umapCacheRef.current[cacheKey] || umapPrefetchingRef.current.has(cacheKey)) continue;

          umapPrefetchingRef.current.add(cacheKey);
          try {
            const res = await fetch(`${API_BASE}/api/plot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                plotType: 'umap',
                genes: [geneName],
                geneLabels: { [geneName]: geneLabel },
                genotypes: [],
                cellTypes: [],
                timepoint: tp,
                gene: geneName,
                umapHighlightBy: umapHighlightBy,
                umapHighlightValues: umapHighlightValues,
              }),
            });
            if (res.ok && !cancelled) {
              umapCacheRef.current[cacheKey] = await res.json();
            }
          } catch { /* silently ignore prefetch failures */ }
          finally { umapPrefetchingRef.current.delete(cacheKey); }
        }
      }
    };

    runPrefetch();
    return () => { cancelled = true; };
  }, [activePlotTab, hasSpatialSelections, umapCarouselMode, selectedGenes, umapGeneIndex, timepoints, selectedTimepoint, selectedGeneList, geneDetailsByGeneList, umapHighlightBy, umapHighlightValues]);

  // Reset carousel index, mode, and clear UMAP cache when gene selection changes.
  useEffect(() => {
    umapCacheRef.current = {};
    umapPrefetchingRef.current.clear();
    setUmapGeneIndex(0);
    setUmapCarouselMode('gene');
    setUmapTimepointIndex(0);
  }, [selectedGenes]);

  // Clear UMAP cache when highlight settings change so stale renders are not served.
  useEffect(() => {
    umapCacheRef.current = {};
    umapPrefetchingRef.current.clear();
  }, [umapHighlightBy, umapHighlightValues]);

  // Fetch available celltypes and clusters from the spatial h5ad when UMAP tab
  // is activated or the timepoint changes. Populates the Highlight-by multi-select.
  useEffect(() => {
    if (activePlotTab !== 'umap') return;
    fetch(`${API_BASE}/api/umap-categories?timepoint=${selectedTimepoint}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setUmapCategories(data); })
      .catch(() => { /* silently ignore — multi-select will be empty */ });
  }, [activePlotTab, selectedTimepoint]);

  // Fetch UMAP cell-type and cluster coloring images for the reference box.
  // These are independent of gene selection — only the timepoint matters.
  useEffect(() => {
    if (activePlotTab !== 'umap' || !hasSpatialSelections) return;

    const celltypeKey = `${selectedTimepoint}:celltype`;
    const clusterKey  = `${selectedTimepoint}:cluster`;

    // Both already cached — serve immediately without spinner
    if (umapColoringCacheRef.current[celltypeKey] && umapColoringCacheRef.current[clusterKey]) {
      setUmapColoringImages({
        celltype: umapColoringCacheRef.current[celltypeKey],
        cluster:  umapColoringCacheRef.current[clusterKey],
      });
      return;
    }

    setUmapColoringLoading(true);

    Promise.all([
      fetch(`${API_BASE}/api/umap-coloring?timepoint=${selectedTimepoint}&color_by=celltype`)
        .then(res => res.ok ? res.json() : null),
      fetch(`${API_BASE}/api/umap-coloring?timepoint=${selectedTimepoint}&color_by=cluster`)
        .then(res => res.ok ? res.json() : null),
    ])
      .then(([celltypeData, clusterData]) => {
        const celltypeImg = celltypeData?.image ?? null;
        const clusterImg  = clusterData?.image  ?? null;
        if (celltypeImg) umapColoringCacheRef.current[celltypeKey] = celltypeImg;
        if (clusterImg)  umapColoringCacheRef.current[clusterKey]  = clusterImg;
        setUmapColoringImages({ celltype: celltypeImg, cluster: clusterImg });
      })
      .catch(() => { /* silently fail — box simply stays blank */ })
      .finally(() => setUmapColoringLoading(false));
  }, [activePlotTab, hasSpatialSelections, selectedTimepoint]);

  const timepointLabels = {
    '1h': '1-hour Timepoint',
    '3h': '3-hour Timepoint',
    '6h': '6-hour Timepoint',
  };

  // Pre-compute UMAP timepoint-mode gene dropdown values (avoids IIFE in JSX)
  const umapTpDetailsMap = geneDetailsByGeneList[selectedGeneList] || {};
  const umapTpGeneOpts = selectedGenes.map(gid => {
    const d = umapTpDetailsMap[gid];
    return { value: gid, label: d?.name || gid };
  });
  const umapTpCurrentGid = selectedGenes[umapGeneIndex] ?? selectedGenes[0];
  const umapTpCurrentLabel = (umapTpDetailsMap[umapTpCurrentGid]?.name || umapTpCurrentGid);

  return (
    <div className="app-wrapper">
      <header className="top-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem'}}>
        <img src="/zju-logo.png" alt="Zhejiang University Logo" style={{ height: '42px' }} />
      </header>
      
      {/* ── Plot Type Tab Bar ── */}
      <div className="mode-switcher-bar">
        <button
          className={`mode-tab ${activePlotTab === 'heatmap' ? 'active' : ''}`}
          onClick={() => {
            setActivePlotTab('heatmap');
            setPlotData(null);
            setPlotError(null);
          }}
        >
          Heatmap
        </button>
        <button
          className={`mode-tab ${activePlotTab === 'dotplot' ? 'active' : ''}`}
          onClick={() => {
            setActivePlotTab('dotplot');
            setPlotData(null);
            setPlotError(null);
          }}
        >
          Dot Plot
        </button>
        <button
          className={`mode-tab ${activePlotTab === 'umap' ? 'active' : ''}`}
          onClick={() => {
            setActivePlotTab('umap');
            setPlotData(null);
            setPlotError(null);
          }}
        >
          UMAP Feature Plot
        </button>
      </div>

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
            <div className="sidebar-content">
              <h2 style={{ textAlign: 'center' }}>Filter Search</h2>


              {/* Gene List Dropdown */}
              <div className="search-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>Gene List</label>
                  {selectedGeneList.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedGeneList([]);
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
                  options={geneListOptions.map(list => ({ value: list, label: list }))}
                  value={selectedGeneList ? { value: selectedGeneList, label: selectedGeneList } : null}
                  onChange={(opt) => {
                    const newGeneList = opt?.value || '';
                    setSelectedGeneList(newGeneList);
                    setSelectedGenes([]);
                    setGeneLimitReached(false);
                  }}
                  placeholder="Select Gene List..."
                  isSearchable
                  styles={{
                    container: base => ({ ...base, width: '100%' }),
                    menu: base => ({ ...base, zIndex: 9999 }),
                  }}
                />
              </div>

              {/* Genotype Dropdown — heatmap tab only */}
              {activePlotTab === 'heatmap' && (
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
              )} {/* end activePlotTab === 'heatmap' — Genotype */}

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




              {/* Cell Type Filter — heatmap tab only */}
              {activePlotTab === 'heatmap' && (
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
              )} {/* end activePlotTab === 'heatmap' — Cell Types */}

              {/* UMAP-specific controls — shown only in UMAP tab */}
              {activePlotTab === 'umap' && (
                <>
                  <div className="search-section">
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Browse by</label>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                      {[
                        { value: 'gene',      label: 'Genes'      },
                        { value: 'timepoint', label: 'Timepoints' },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          className={`umap-color-mode-btn${umapCarouselMode === value ? ' active' : ''}`}
                          onClick={() => {
                            if (value === 'timepoint') {
                              const idx = allTimepoints.indexOf(selectedTimepoint);
                              setUmapTimepointIndex(idx >= 0 ? idx : 0);
                            }
                            setUmapCarouselMode(value);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {umapCarouselMode === 'gene' && (
                      <>
                        <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px', color: '#555' }}>
                          At timepoint:
                        </label>
                        <Select
                          value={{ value: selectedTimepoint, label: selectedTimepoint }}
                          options={allTimepoints.map(tp => ({ value: tp, label: tp }))}
                          onChange={(opt) => { if (opt) setSelectedTimepoint(opt.value); }}
                          isSearchable={false}
                          styles={{
                            container: base => ({ ...base, width: '100%' }),
                            menu: base => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                      </>
                    )}
                    {umapCarouselMode === 'timepoint' && (
                      <>
                        <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px', color: '#555' }}>
                          For gene:
                        </label>
                        <Select
                          value={{ value: umapTpCurrentGid, label: umapTpCurrentLabel }}
                          options={umapTpGeneOpts}
                          onChange={(opt) => {
                            if (!opt) return;
                            const idx = selectedGenes.indexOf(opt.value);
                            if (idx >= 0) setUmapGeneIndex(idx);
                          }}
                          isSearchable
                          styles={{
                            container: base => ({ ...base, width: '100%' }),
                            menu: base => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                      </>
                    )}
                  </div>

                  <div className="search-section">
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Highlight by</label>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                      {[
                        { value: 'celltype', label: 'Cell Type' },
                        { value: 'cluster',  label: 'Cluster'   },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          className={`umap-color-mode-btn${umapHighlightBy === value ? ' active' : ''}`}
                          onClick={() => {
                            setUmapHighlightBy(value);
                            setUmapHighlightValues([]);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <Select
                      isMulti
                      closeMenuOnSelect={false}
                      options={
                        (umapHighlightBy === 'celltype'
                          ? umapCategories.celltypes
                          : umapCategories.clusters
                        ).map(v => ({ value: v, label: String(v) }))
                      }
                      value={umapHighlightValues.map(v => ({ value: v, label: String(v) }))}
                      onChange={(opts) => setUmapHighlightValues((opts || []).map(o => o.value))}
                      placeholder={umapHighlightBy === 'celltype' ? 'Select cell types…' : 'Select clusters…'}
                      isSearchable
                      styles={{
                        container: base => ({ ...base, width: '100%' }),
                        menu: base => ({ ...base, zIndex: 9999 }),
                      }}
                    />
                  </div>
                </>
              )} {/* end activePlotTab === 'umap' — UMAP controls */}
            </div>
          )}
        </div>



        <div className={`main-content ${sidebarVisible ? '' : 'expanded'}`}>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* <h2>Main Content Area</h2> */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem', marginRight: '1.5rem' }}>
              {activePlotTab === 'heatmap' && (
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
              )} {/* end activePlotTab === 'heatmap' — descriptions */}

              {activePlotTab === 'heatmap' && (
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
              )} {/* end activePlotTab === 'heatmap' — download */}
            </div>

            {timepoints.length > 0 && activePlotTab !== 'umap' && (
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

            {/* Placeholder message — shown when required selections are incomplete */}
            {activePlotTab === 'heatmap' && !hasAllSelections && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                textAlign: 'center',
                color: '#666',
                fontSize: '1.2rem',
                fontWeight: '500',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                borderRadius: '8px',
                margin: '2rem'
              }}>
                <div>
                  <div>Please select a Gene List, Genes, Genotypes, and Cell Types to view data</div>
                  <div style={{ fontSize: '0.9rem', color: '#999', marginTop: '0.5rem' }}>
                    Use the filter panel on the left to make your selections
                  </div>
                </div>
              </div>
            )}
            {(activePlotTab === 'dotplot' || activePlotTab === 'umap') && !hasSpatialSelections && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                textAlign: 'center',
                color: '#666',
                fontSize: '1.2rem',
                fontWeight: '500',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                borderRadius: '8px',
                margin: '2rem'
              }}>
                <div>
                  <div>Please select a Gene List and Genes (up to 10) to view spatial data</div>
                  <div style={{ fontSize: '0.9rem', color: '#999', marginTop: '0.5rem' }}>
                    Use the filter panel on the left to make your selections
                  </div>
                </div>
              </div>
            )}

            {/* Show table or plot based on active tab */}
            {activePlotTab === 'heatmap' && hasAllSelections && (
              <GeneExpressionTable
                selectedGenes={selectedGenes}
                selectedGenotype={selectedGenotype}
                selectedCellTypes={selectedCellTypes}
                geneDetailsByGeneList={geneDetailsByGeneList}
                selectedGeneList={selectedGeneList}
                data={{ [selectedTimepoint]: data[selectedTimepoint] }}
              />
            )}

            {hasSpatialSelections && (activePlotTab === 'dotplot' || activePlotTab === 'umap') && (
              <>
                {(() => {
                  // Determine whether to show the carousel wrapper.
                  const showGeneCarousel = umapCarouselMode === 'gene' && selectedGenes.length > 1;
                  const showTimepointCarousel = umapCarouselMode === 'timepoint' && allTimepoints.length > 1;
                  const showCarousel = showGeneCarousel || showTimepointCarousel;

                  // Carousel navigation values for gene mode
                  const geneNavIndex = umapGeneIndex;
                  const geneNavMax = selectedGenes.length - 1;

                  // Carousel navigation values for timepoint mode
                  const tpNavIndex = umapTimepointIndex;
                  const tpNavMax = allTimepoints.length - 1;

                  if (!showCarousel) {
                    return (
                      <PlotDisplay
                        plotData={plotData}
                        loading={plotLoading}
                        error={plotError}
                      />
                    );
                  }

                  // ── Shared carousel shell ───────────────────────────────────
                  const prevDisabled = umapCarouselMode === 'gene' ? geneNavIndex === 0 : tpNavIndex === 0;
                  const nextDisabled = umapCarouselMode === 'gene' ? geneNavIndex === geneNavMax : tpNavIndex === tpNavMax;

                  const handlePrev = () => {
                    if (umapCarouselMode === 'gene') {
                      setUmapGeneIndex(i => Math.max(0, i - 1));
                    } else {
                      const newIdx = Math.max(0, tpNavIndex - 1);
                      setUmapTimepointIndex(newIdx);
                      setSelectedTimepoint(allTimepoints[newIdx]);
                    }
                  };

                  const handleNext = () => {
                    if (umapCarouselMode === 'gene') {
                      setUmapGeneIndex(i => Math.min(geneNavMax, i + 1));
                    } else {
                      const newIdx = Math.min(tpNavMax, tpNavIndex + 1);
                      setUmapTimepointIndex(newIdx);
                      setSelectedTimepoint(allTimepoints[newIdx]);
                    }
                  };

                  const badgeLabel = umapCarouselMode === 'gene'
                    ? `Gene ${geneNavIndex + 1} of ${selectedGenes.length}`
                    : allTimepoints[tpNavIndex];

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 1.5rem' }}>
                      <button
                        onClick={handlePrev}
                        disabled={prevDisabled}
                        style={{ background: 'white', border: '1px solid #ccd', borderRadius: '6px', width: '36px', height: '36px', cursor: prevDisabled ? 'default' : 'pointer', fontSize: '1.2rem', color: '#1a5276', opacity: prevDisabled ? 0.3 : 1, flexShrink: 0 }}
                      >
                        ←
                      </button>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(255,255,255,0.85)', padding: '2px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600, color: '#1a5276', pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                          {badgeLabel}
                        </div>
                        <PlotDisplay
                          plotData={plotData}
                          loading={plotLoading}
                          error={plotError}
                        />
                      </div>
                      <button
                        onClick={handleNext}
                        disabled={nextDisabled}
                        style={{ background: 'white', border: '1px solid #ccd', borderRadius: '6px', width: '36px', height: '36px', cursor: nextDisabled ? 'default' : 'pointer', fontSize: '1.2rem', color: '#1a5276', opacity: nextDisabled ? 0.3 : 1, flexShrink: 0 }}
                      >
                        →
                      </button>
                    </div>
                  );
                })()}
              </>
            )}

            {/* ── UMAP Cell Type & Cluster Reference Box ── */}
            {hasSpatialSelections && activePlotTab === 'umap' && (
              <div style={{ padding: '0 1.5rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {/* Cell type panel */}
                  <div style={{
                    flex: 1,
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    background: '#fff',
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.9rem', color: '#333' }}>
                      Cell Type
                    </div>
                    {umapColoringLoading && !umapColoringImages.celltype ? (
                      <div className="plot-loading">
                        <div className="spinner" />
                        <p>Loading...</p>
                      </div>
                    ) : umapColoringImages.celltype ? (
                      <img
                        src={`data:image/png;base64,${umapColoringImages.celltype}`}
                        alt="UMAP colored by cell type"
                        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                      />
                    ) : null}
                  </div>
                  {/* Cluster panel */}
                  <div style={{
                    flex: 1,
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    background: '#fff',
                  }}>
                    <div style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.9rem', color: '#333' }}>
                      Cluster
                    </div>
                    {umapColoringLoading && !umapColoringImages.cluster ? (
                      <div className="plot-loading">
                        <div className="spinner" />
                        <p>Loading...</p>
                      </div>
                    ) : umapColoringImages.cluster ? (
                      <img
                        src={`data:image/png;base64,${umapColoringImages.cluster}`}
                        alt="UMAP colored by cluster"
                        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer
            style={{
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.85rem',
              color: '#666',
              backgroundColor: '#f8f8f8',
              borderTop: '1px solid #ddd',
              flexShrink: 0,
              marginTop: 'auto'
            }}
          >
            If you use this tool in your research, please cite as: <br />
            Single nuclei and spatial transcriptome reveals heterogeneous, polarized and spatial aspects of mitochondrial retrograde signalling in <em>Arabidopsis thaliana</em> (<u>link to be inserted when publication submitted/accepted</u>).
          </footer>
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