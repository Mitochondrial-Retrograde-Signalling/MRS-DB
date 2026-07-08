"""Pydantic models for the plot API."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class PlotType(str, Enum):
    DOTPLOT = "dotplot"
    UMAP = "umap"


class Timepoint(str, Enum):
    H1 = "1h"
    H3 = "3h"
    H6 = "6h"


class PlotRequest(BaseModel):
    """Request body for POST /api/plot."""

    plotType: PlotType = Field(..., description="Type of plot to generate")
    genes: list[str] = Field(..., min_length=1, max_length=10, description="Gene symbols (max 10)")
    genotypes: list[str] = Field(..., min_length=1, description="Genotype/group values")
    cellTypes: list[str] = Field(..., min_length=1, description="Cell type values")
    timepoint: Timepoint = Field(..., description="Timepoint: 1h, 3h, or 6h")
    gene: Optional[str] = Field(None, description="Single gene for UMAP (required when plotType='umap')")
    geneLabels: Optional[dict[str, str]] = Field(
        None,
        description="Mapping from GeneName (key) → display label 'GeneID (GeneName)'. "
                    "Keys must match values in `genes` / `gene`.",
    )

    @field_validator("genes")
    @classmethod
    def genes_not_empty_strings(cls, v: list[str]) -> list[str]:
        stripped = [g.strip() for g in v]
        if any(not g for g in stripped):
            raise ValueError("Gene names cannot be empty strings")
        return stripped


class DotplotResponse(BaseModel):
    plotType: str = "dotplot"
    image: str = Field(..., description="Base64-encoded PNG image")
    format: str = "png"
    width: int
    height: int


class UmapResponse(BaseModel):
    plotType: str = "umap"
    image: str = Field(..., description="Base64-encoded PNG image")
    format: str = "png"
    width: int
    height: int
