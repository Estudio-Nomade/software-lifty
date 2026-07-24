export interface HeatmapBounds {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
}

export interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

export interface HeatmapDriverRow {
  lat: number;
  lng: number;
}

interface GridCell {
  latMin: number;
  lngMin: number;
  latMax: number;
  lngMax: number;
  centroidLat: number;
  centroidLng: number;
}

function buildGrid(bounds: HeatmapBounds, gridSize: number): GridCell[] {
  const latStep = (bounds.ne_lat - bounds.sw_lat) / gridSize;
  const lngStep = (bounds.ne_lng - bounds.sw_lng) / gridSize;
  const cells: GridCell[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const latMin = bounds.sw_lat + row * latStep;
      const lngMin = bounds.sw_lng + col * lngStep;
      const latMax = latMin + latStep;
      const lngMax = lngMin + lngStep;
      cells.push({
        latMin,
        lngMin,
        latMax,
        lngMax,
        centroidLat: (latMin + latMax) / 2,
        centroidLng: (lngMin + lngMax) / 2,
      });
    }
  }

  return cells;
}

function countDriversPerCell(drivers: HeatmapDriverRow[], cells: GridCell[]): number[] {
  const counts = new Array<number>(cells.length).fill(0);

  for (const driver of drivers) {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (
        driver.lat >= cell.latMin &&
        driver.lat <= cell.latMax &&
        driver.lng >= cell.lngMin &&
        driver.lng <= cell.lngMax
      ) {
        counts[i]++;
        break;
      }
    }
  }

  return counts;
}

function nonLinearScale(ratio: number): number {
  return ratio ** 2;
}

export function computeHeatmap(
  bounds: HeatmapBounds,
  gridSize: number,
  drivers: HeatmapDriverRow[],
): HeatmapPoint[] {
  const cells = buildGrid(bounds, gridSize);
  const counts = countDriversPerCell(drivers, cells);
  const maxCount = Math.max(...counts, 0);

  const points: HeatmapPoint[] = [];

  for (let i = 0; i < cells.length; i++) {
    let weight: number;
    if (maxCount === 0) {
      weight = 1.0;
    } else {
      const ratio = 1 - counts[i] / maxCount;
      weight = nonLinearScale(ratio);
    }

    if (weight > 0) {
      points.push({
        coordinate: [cells[i].centroidLng, cells[i].centroidLat],
        weight: Math.round(weight * 100) / 100,
      });
    }
  }

  return points;
}
