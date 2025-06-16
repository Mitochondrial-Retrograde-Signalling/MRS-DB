// Revised GeneExpressionTable using tanstack-table-header-rowspan for proper rowspan on Gene and Genotype with sticky first two columns
import React, { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { tableHeaderRowSpan } from 'tanstack-table-header-rowspan';
import chroma from 'chroma-js';

function GeneExpressionTable({ selectedGenes, selectedGenotype, selectedCellTypes, geneDetailsByGeneList, selectedGeneList, data }) {
  const tpKey = `${Object.keys(data)[0]}`;
  const geneListData = data[tpKey]?.[selectedGeneList];

  const values = [];
  selectedGenes.forEach(gene => {
    selectedGenotype.forEach(gt => {
      selectedCellTypes.forEach(cellType => {
        const clusterData = geneListData?.[gene]?.[gt]?.[cellType];
        if (clusterData) {
          Object.values(clusterData).forEach(val => {
            const num = parseFloat(val);
            if (!isNaN(num)) values.push(Math.abs(num));
          });
        }
      });
    });
  });
  const maxAbs = values.length > 0 ? Math.max(...values) : 1;
  const chromaScale = chroma.scale(['#008ae5', 'white', '#e50000']).domain([-maxAbs, 0, maxAbs]);

  const columnHelper = createColumnHelper();

  const dynamicColumns = useMemo(() => {
    const cellTypeGroups = selectedCellTypes.map(cellType => {
      const clusterSet = new Set();
  
      selectedGenes.forEach(gene => {
        selectedGenotype.forEach(gt => {
          const clusters = Object.keys(geneListData?.[gene]?.[gt]?.[cellType] || {});
          clusters.forEach(c => clusterSet.add(c));
        });
      });
  
      // If nothing was found at all for this cell type, still show a placeholder
      if (clusterSet.size === 0) {
        clusterSet.add('no_cluster');
      }
  
      const clusterColumns = Array.from(clusterSet)
        .sort((a, b) => {
          // Extract numbers from cluster names, fallback to string compare if not numeric
          const numA = parseInt(a.replace(/\D/g, ''), 10);
          const numB = parseInt(b.replace(/\D/g, ''), 10);
          if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b);
          return numA - numB;
        })
        .map(cluster =>
          columnHelper.accessor(row => {
            const key = `${cellType}__${cluster}`;
            return row[key] ?? 'no data';
          }, {
            id: `${cellType}__${cluster}`,
            header: cluster === 'no_cluster' ? 'No Cluster' : cluster.replace('log2FC_', '')
          })
        );
  
      return columnHelper.group({
        id: cellType,
        header: cellType,
        columns: clusterColumns
      });
    });
  
    return [
      columnHelper.accessor('gene', {
        id: 'gene',
        header: 'Gene',
        meta: { rowSpan: 2 }
      }),
      columnHelper.accessor('genotype', {
        id: 'genotype',
        header: 'Genotype',
        meta: { rowSpan: 2 }
      }),
      ...cellTypeGroups
    ];
  }, [selectedGenes, selectedGenotype, selectedCellTypes, geneListData]);
  

  const dataRows = useMemo(() => {
    const rows = [];
  
    selectedGenes.forEach(gene => {
      selectedGenotype.forEach((gt, idx, arr) => {
        const row = {
          gene,
          genotype: gt,
          rowSpan: arr.length,
          isFirst: idx === 0,
          isLast: idx === arr.length - 1
        };
  
        selectedCellTypes.forEach(cellType => {
          const clusters = geneListData?.[gene]?.[gt]?.[cellType]
            ? Object.keys(geneListData[gene][gt][cellType])
            : [];
  
          clusters.forEach(cluster => {
            const key = `${cellType}__${cluster}`;
            const value = geneListData?.[gene]?.[gt]?.[cellType]?.[cluster];
            row[key] = value ?? 'no data';
          });
  
          // If no clusters at all, mark as "no data" for a placeholder
          if (clusters.length === 0) {
            row[`${cellType}__no_cluster`] = 'no data';
          }
        });
  
        rows.push(row);
      });
    });
  
    return rows;
  }, [selectedGenes, selectedGenotype, selectedCellTypes, geneListData]);
  

  const table = useReactTable({
    data: dataRows,
    columns: dynamicColumns,
    getCoreRowModel: getCoreRowModel(),
    plugins: [tableHeaderRowSpan]
  });

  const generateBackgroundColor = value => {
    if (isNaN(value)) return {};
    const color = chromaScale(value).hex();
    const textColor = chroma.contrast(color, 'white') > 4.5 ? 'white' : 'black';
    return { backgroundColor: color, color: textColor };
  };

  const roundedValue = value =>
    isNaN(value) ? value : parseFloat(value).toFixed(2);

  return (
    <div className="table-container">
      <div style={{ minWidth: 'max-content', position: 'relative', padding: '0 2rem' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 'max-content' }}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const rowSpan = tableHeaderRowSpan(header);
                if (!rowSpan) return null;

                const isStickyCol = ['gene', 'genotype'].includes(header.column.id);
                const isClusterHeader = header.depth === 2;
                const stickyTop = header.depth === 1 ? 0 : 39;

                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    rowSpan={rowSpan}
                    style={{
                      border: '1px solid #ccc',
                      background: '#f0f0f0',
                      backgroundColor: '#f0f0f0',
                      padding: '8px',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      whiteSpace: 'nowrap',
                      fontStyle: isClusterHeader ? 'italic' : 'bold',
                      fontWeight: isClusterHeader ? 400 : 'bold',
                      top: stickyTop,
                      position: 'sticky',
                      left: header.column.id === 'gene' ? 0 : header.column.id === 'genotype' ? 120 : undefined,
                      zIndex: isStickyCol ? 3 : 2,
                      backgroundColor: '#f0f0f0',
                      ...(isClusterHeader && !isStickyCol
                        ? { width: '100px', minWidth: '100px', maxWidth: '100px' }
                        : {})
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

          <tbody>
            {table.getRowModel().rows.map(row => {
              const borderTop = row.original.isFirst ? '2px solid black' : '1px solid #b0b0b0';
              const borderBottom = row.original.isLast ? '2px solid black' : '1px solid #b0b0b0';
              const borderLR = '1px solid black';
              const groupRowStyle = {
                borderTop,
                borderBottom,
                borderLeft: borderLR,
                borderRight: borderLR,
                whiteSpace: 'nowrap',
                width: '120px'
              };

              return (
                <tr key={row.id}>
                  {row.original.isFirst && (
                    <td //Gene column
                      rowSpan={row.original.rowSpan}
                      style={{
                        ...groupRowStyle,
                        fontWeight: 'bold',
                        backgroundColor: '#f0f0f0',
                        position: 'sticky',
                        textAlign: 'center',
                        height: '80px',
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      {row.original.gene}
                    </td>
                  )}
                  <td // Genotype column
                    style={{
                      ...groupRowStyle,
                      fontStyle: 'italic',
                      position: 'sticky',
                      textAlign: 'left',
                      left: 120,
                      paddingLeft: '1rem',
                      zIndex: 1,
                      backgroundColor: '#f0f0f0',
                    }}
                  >
                    {row.original.genotype}
                  </td>

                  {row.getVisibleCells()
                    .filter(cell => !['gene', 'genotype'].includes(cell.column.id))
                    .map(cell => (
                      <td // log fold change
                        key={cell.id}
                        style={{
                          textAlign: 'center',
                          minWidth: '100px',
                          maxWidth: '100px',
                          width: '100px',
                          ...groupRowStyle,
                          ...(cell.getValue() === 'no data'
                            ? {
                                fontStyle: 'italic',
                                color: '#888',
                                backgroundColor: '#f9f9f9',
                                fontSize: '15px'
                              }
                            : generateBackgroundColor(cell.getValue()))
                        }}
                      >
                        {roundedValue(cell.getValue())}
                      </td>
                    ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default GeneExpressionTable;
