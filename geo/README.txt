Map files for the two globes on index.html.

Each file is the TopoJSON map wrapped in one line of JavaScript
(window.GL_GEO.<name> = {...};), so the page also works when index.html is
opened straight from the disk, where browsers refuse to load .json files.

highseas-mid.js   the high seas (object "highseas"), for the title globe.
                  Source: Flanders Marine Institute (2024). Maritime Boundaries
                  Geodatabase: High Seas, version 2. https://www.marineregions.org/
                  https://doi.org/10.14284/696 (CC BY 4.0). The original
                  High_Seas_v2.gpkg stays in data cleaning/raw/marine_regions/
                  (Marine Regions asks that it is not passed on); only these
                  simplified copies are here. Made 2026-11-02 with mapshaper
                  0.6.102 from the gpkg (converted to GeoJSON with geopandas):
                    -explode -filter-islands min-area=1000km2 remove-empty
                    -filter-slivers min-area=1000km2
                    -simplify interval=6km keep-shapes -clean -dissolve2
                    -rename-layers highseas -o format=topojson quantization=1e5
                  Pieces under 1,000 km2 are dropped (smaller than a pixel on
                  the globe). The Southern Ocean
                  around Antarctica counts as high seas, as in the source.
land-mid.js       world-atlas 2.0.2 land-50m (Natural Earth, ISC licence).
countries-mid.js  world-atlas 2.0.2 countries-50m, for the Actors globe (ids are
                  ISO 3166-1 numeric codes; Somaliland, Kosovo, N. Cyprus and
                  Siachen have none and stay grey).
                  land-mid and countries-mid are topojson-simplify copies of the full
                  files (about a quarter of the points) so a globe turns smoothly.
*-low.js          the -mid files simplified once more (land and countries:
                  topojson-simplify 3.0.3, about a third of their points;
                  high seas: the same mapshaper steps with interval=20km). Only drawn
                  while a globe turns on a slow computer (js/glance.js, QUALITY).

The full-detail originals were in the archived Shiny app (shiny/www/geo/), and in
admin/backups/261022/ (glance assets).
