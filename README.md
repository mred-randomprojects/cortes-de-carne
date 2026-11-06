# Cortes de la vaca

Vaca en 3D con los cortes de carne y sus nombres por región (Argentina, Tucumán/NOA, Brasil, Chile, EE.UU.).

- Página estática: `index.html` + `src/` (Three.js desde jsDelivr). Servir con cualquier servidor estático, p. ej. `python3 -m http.server`.
- `src/cow.js`: la vaca es un campo de distancia (SDF) convertido en malla con surface nets al cargar.
- `src/map.js`: cada corte es un polígono en la vista lateral, con los límites óseos del manual de SENASA (Delprato, 1971). Se rasteriza a una textura que el shader lee por fragmento.
- `src/data.js`: descripción de cada corte y nombres por región. Para sumar una región, agregar un objeto a `REGIONS`.
- `tools/`: `silhouette.mjs` + `grid.py` dibujan la silueta lateral con los polígonos (para calibrar); `shot.mjs` saca capturas con Chromium headless.
