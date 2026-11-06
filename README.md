# Cortes de la vaca

Vaca en 3D con los cortes de carne y sus nombres por región (Argentina, Tucumán/NOA, Brasil, Chile, EE.UU.).

- Página estática: `index.html` + `src/` (Three.js desde jsDelivr). Servir con cualquier servidor estático, p. ej. `python3 -m http.server`.
- `src/cow.js`: la vaca es un campo de distancia (SDF) convertido en malla con surface nets al cargar.
- `src/map.js`: cada corte es un polígono en la vista lateral, con los límites óseos del manual de SENASA (Delprato, 1971). Se rasteriza a una textura que el shader lee por fragmento.
- `src/data.js`: descripción de cada corte y nombres por región. Para sumar una región, agregar un objeto a `REGIONS`.
- `tools/`: `silhouette.mjs` + `grid.py` dibujan la silueta lateral con los polígonos (para calibrar); `shot.mjs` saca capturas con Chromium headless.

## Modelo en volumen

- `src/anatomy.js`: esqueleto (columna, 13 pares de costillas, esternón, pelvis, escápula y huesos de las patas), cavidad del tórax y del abdomen (la res está eviscerada), lomo y entraña, y la regla que asigna cada punto de carne a su corte (en el muslo, por sector alrededor del fémur).
- `src/build.js`: grilla de vóxeles de 1 cm → clasificación → una malla cerrada por corte y por media res (surface nets). Corre en `src/worker.js` al cargar (~3 s).
- `tools/slices.mjs`: dibuja planos sagitales y transversales coloreados por corte, para revisar la clasificación. `tools/bench.mjs`: mide el armado en Node.
