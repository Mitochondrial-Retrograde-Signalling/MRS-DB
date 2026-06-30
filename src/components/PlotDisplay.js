import React from 'react';
import Plot from 'react-plotly.js';

function PlotDisplay({ plotData, loading, error }) {
  if (loading) {
    return (
      <div className="plot-container">
        <div className="plot-loading">
          <div className="spinner" />
          <p>Generating plot...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plot-container">
        <div className="plot-error">
          <p>Error generating plot:</p>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (!plotData) {
    return (
      <div className="plot-container">
        <div className="plot-placeholder">
          <p>Select a plot type to generate</p>
        </div>
      </div>
    );
  }

  if (plotData.format === 'png') {
    return (
      <div className="plot-container">
        <img
          src={`data:image/png;base64,${plotData.image}`}
          alt="Dotplot"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
    );
  }

  if (plotData.format === 'plotly_json') {
    return (
      <div className="plot-container">
        <Plot
          data={plotData.data.data}
          layout={{
            ...plotData.data.layout,
            autosize: true,
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
          config={{ responsive: true }}
        />
      </div>
    );
  }

  return <div className="plot-container"><p>Unknown plot format: {plotData.format}</p></div>;
}

export default PlotDisplay;
