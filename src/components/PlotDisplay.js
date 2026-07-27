import React from 'react';
import Plot from 'react-plotly.js';

function PlotDisplay({ plotData, loading, error }) {
  // No stale data + loading → full spinner
  if (loading && !plotData) {
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

  // Render the current (possibly stale) plot; overlay a spinner when reloading
  let plotContent;
  if (plotData.format === 'png') {
    plotContent = (
      <img
        src={`data:image/png;base64,${plotData.image}`}
        alt="Dotplot"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    );
  } else if (plotData.format === 'plotly_json') {
    plotContent = (
      <Plot
        data={plotData.data.data}
        layout={{ ...plotData.data.layout, autosize: true }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        config={{ responsive: true }}
      />
    );
  } else {
    plotContent = <p>Unknown plot format: {plotData.format}</p>;
  }

  return (
    <div className="plot-container" style={{ position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255, 255, 255, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}>
          <div className="plot-loading">
            <div className="spinner" />
            <p>Updating plot...</p>
          </div>
        </div>
      )}
      <div style={{ width: '100%' }}>
        {plotContent}
      </div>
    </div>
  );
}

export default PlotDisplay;
