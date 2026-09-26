import type { Row } from "./data";

/** Sector amplio de la fila (Nasdaq). Con datos viejos (sin sector_group) cae a la descripción SIC. */
export const sectorOf = (r: Row) => r.sector_group || r.sector || "Sin sector";
