// src/types/kml-to-geojson.d.ts
declare module 'kml-to-geojson' {
  export function kml(xml: Document): any; // 回傳 GeoJSON FeatureCollection
}
