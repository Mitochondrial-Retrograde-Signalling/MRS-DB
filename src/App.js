import React, { useEffect, useState } from "react";
import Select from "react-select";
import Plot from "react-plotly.js";
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

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

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Arabidopsis Gene Expression Explorer</h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <label>Organelle</label>
            <Tooltip title="Select an organelle to explore gene expression." arrow>
              <InfoOutlinedIcon fontSize="small" color="action" />
            </Tooltip>
          </div>
          <Select
            options={organelleOptions.map(o => ({ value: o, label: o }))}
            value={selectedOrganelle ? { value: selectedOrganelle, label: selectedOrganelle } : null}
            onChange={opt => setSelectedOrganelle(opt?.value || null)}
            placeholder="Search organelle..."
            isSearchable
            styles={{ container: base => ({ ...base, width: 300 }) }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <label>Genes</label>
            <Tooltip title="Choose one or more genes from the selected organelle." arrow>
              <InfoOutlinedIcon fontSize="small" color="action" />
            </Tooltip>
          </div>
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <label>Cell Types</label>
            <Tooltip title="Filter by specific cell types to focus your analysis." arrow>
              <InfoOutlinedIcon fontSize="small" color="action" />
            </Tooltip>
          </div>
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <label>Genotypes</label>
            <Tooltip title="Compare gene expression across selected genotypes." arrow>
              <InfoOutlinedIcon fontSize="small" color="action" />
            </Tooltip>
          </div>
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
        </div>

        {timepoints.length > 1 && (
          <div style={{ width: 300, paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <strong>Timepoint</strong>
              <Tooltip title="Select a range of timepoints to display plots." arrow>
                <InfoOutlinedIcon fontSize="small" color="action" />
              </Tooltip>
            </div>
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
    </div>
  );
}

export default App;
