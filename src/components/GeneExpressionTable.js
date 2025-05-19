// Revised GeneExpressionTable using tanstack-table-header-rowspan for proper rowspan on Gene and Genotype
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

  // Compute maxAbs from actual values in data
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

      const clusterColumns = Array.from(clusterSet).sort().map(cluster =>
        columnHelper.accessor(row => {
          const val = geneListData?.[row.gene]?.[row.genotype]?.[cellType]?.[cluster];
          return val === undefined ? 'NA' : val;
        }, {
          id: `${cellType}__${cluster}`,
          header: cluster.replace('log2FC_', '')
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
        rows.push({
          gene,
          genotype: gt,
          rowSpan: arr.length,
          isFirst: idx === 0,
          isLast: idx === arr.length - 1
        });
      });
    });
    return rows;
  }, [selectedGenes, selectedGenotype]);

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
    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const rowSpan = tableHeaderRowSpan(header);
              if (!rowSpan) return null;

              return (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  rowSpan={rowSpan}
                  style={{
                    width: header.getSize?.() ?? 'auto',
                    border: '1px solid #ddd',
                    background: '#f0f0f0',
                    padding: '8px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
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
            const borderTop = row.original.isFirst ? '3px solid black' : '1px solid black';
            const borderBottom = row.original.isLast ? '3px solid black' : '1px solid black';
            const borderLR = '2px solid black';
            const groupRowStyle = {
              borderTop,
              borderBottom,
              borderLeft: borderLR,
              borderRight: borderLR
            };

            return (
              <tr key={row.id}>
                {row.original.isFirst && (
                  <td
                    rowSpan={row.original.rowSpan}
                    style={{
                      ...groupRowStyle,
                      fontWeight: 'bold',
                      backgroundColor: '#f0f0f0'
                    }}
                  >
                    {row.original.gene}
                  </td>
                )}
                <td style={{ ...groupRowStyle, fontStyle: 'italic' }}>{row.original.genotype}</td>

                {row.getVisibleCells()
                  .filter(cell => !['gene', 'genotype'].includes(cell.column.id))
                  .map(cell => (
                    <td
                      key={cell.id}
                      style={{
                        ...groupRowStyle,
                        ...generateBackgroundColor(cell.getValue())
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
  );
}

export default GeneExpressionTable;
