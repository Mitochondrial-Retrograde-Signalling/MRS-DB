import React from "react";
import { useTable } from "react-table";
import chroma from "chroma-js";

function Table() {
  const chromaScale = chroma.scale(["white", "008ae5"]).domain([0, 1]);

  const data = [
    {
      category: "Category 1",
      rows: [
        { subCategory: "Sub-A", k: 0.11, l: 0.21, m: 0.31, w: 0.41, x: 0.51, y: 0.61, z: 0.71, f: 0.81, g: 0.91, h: 0.41, i: 0.31, j: 0.21 },
        { subCategory: "Sub-B", k: 0.15, l: 0.25, m: 0.35, w: 0.45, x: 0.55, y: 0.65, z: 0.75, f: 0.85, g: 0.95, h: 0.45, i: 0.35, j: 0.25 }
      ]
    },
    {
      category: "Category 2",
      rows: [
        { subCategory: "Sub-A", k: 0.31, l: 0.41, m: 0.51, w: 0.11, x: 0.21, y: 0.31, z: 0.41, f: 0.51, g: 0.61, h: 0.71, i: 0.81, j: 0.91 },
        { subCategory: "Sub-B", k: 0.35, l: 0.45, m: 0.55, w: 0.15, x: 0.25, y: 0.35, z: 0.45, f: 0.55, g: 0.65, h: 0.75, i: 0.85, j: 0.95 }
      ]
    }
  ];

  const flatData = data.flatMap(d => d.rows.map((r, idx, arr) => ({
    ...r,
    category: d.category,
    rowSpan: arr.length,
    isFirst: idx === 0,
    isLast: idx === arr.length - 1
  })));

  const columns = React.useMemo(
    () => [
      { Header: "Category", accessor: "category" },
      { Header: "Sub-Category", accessor: "subCategory" },
      {
        Header: "Scores",
        columns: [
          {
            Header: "A",
            columns: [
              { Header: "k", accessor: "k" },
              { Header: "l", accessor: "l" },
              { Header: "m", accessor: "m" }
            ]
          },
          {
            Header: "B",
            columns: [
              { Header: "w", accessor: "w" },
              { Header: "x", accessor: "x" },
              { Header: "y", accessor: "y" },
              { Header: "z", accessor: "z" }
            ]
          },
          {
            Header: "C",
            columns: [
              { Header: "f", accessor: "f" },
              { Header: "g", accessor: "g" },
              { Header: "h", accessor: "h" },
              { Header: "i", accessor: "i" },
              { Header: "j", accessor: "j" }
            ]
          }
        ]
      }
    ],
    []
  );

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } = useTable({
    columns,
    data: flatData
  });

  const generateBackgroundColor = value => {
    if (isNaN(value)) return {};
    const color = chromaScale(value).hex();
    const textColor = chroma.contrast(color, "white") > 4.5 ? "white" : "black";
    return { backgroundColor: color, color: textColor };
  };

  const convertDecimalToPercentageWithinCell = value =>
    isNaN(value) ? value : `${Math.round(value * 100)}%`;

  // Function to determine column-wise borders by ID groupings
  const getColumnBorder = id => {
    if (["k", "l", "m"].includes(id)) return { borderLeft: '2px solid black', borderRight: '2px solid black' };
    if (["w", "x", "y", "z"].includes(id)) return { borderLeft: '2px solid black', borderRight: '2px solid black' };
    if (["f", "g", "h", "i", "j"].includes(id)) return { borderLeft: '2px solid black', borderRight: '2px solid black' };
    return {};
  };

  return (
    <table {...getTableProps()} style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        {headerGroups.map(headerGroup => (
          <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
            {headerGroup.headers.map(column => (
              <th {...column.getHeaderProps()} key={column.id} scope="col" style={{ border: '2px solid black' }}>
                {column.render("Header")}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody {...getTableBodyProps()}>
        {rows.map(row => {
          prepareRow(row);
          const borderTop = row.original.isFirst ? '3px solid black' : '1px solid black';
          const borderBottom = row.original.isLast ? '3px solid black' : '1px solid black';
          const borderLeftRight = '2px solid black';

          const groupRowStyle = {
            borderLeft: borderLeftRight,
            borderRight: borderLeftRight,
            borderTop,
            borderBottom
          };

          return (
            <tr {...row.getRowProps()} key={row.id}>
              {row.original.isFirst && (
                <td rowSpan={row.original.rowSpan} style={{ ...groupRowStyle, fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                  {row.original.category}
                </td>
              )}
              <td style={{ ...groupRowStyle, fontStyle: 'italic' }}>{row.original.subCategory}</td>
              {row.cells
                .filter(cell => !["category", "subCategory"].includes(cell.column.id))
                .map(cell => {
                  const colBorder = getColumnBorder(cell.column.id);
                  return (
                    <td
                      style={{
                        ...generateBackgroundColor(cell.value),
                        ...groupRowStyle,
                        ...colBorder
                      }}
                      key={cell.column.id}
                    >
                      {convertDecimalToPercentageWithinCell(cell.value)}
                    </td>
                  );
                })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default Table;
