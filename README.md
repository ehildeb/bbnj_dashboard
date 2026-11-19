# BBNJ negotiations at a glance

A static web page about the BBNJ Agreement negotiations, from the field notes of
the MARIPOLDATA and TwinPolitics projects. Plain HTML, CSS and JavaScript: no
server, no build step, nothing loaded from the internet.

This folder is the part that can go on GitHub. It only holds counts and the
literature list, never statement text or raw data. The data, the cleaning script
and anything private live one folder up (`../data cleaning/`).

## Look at it

Double-click `index.html` (or `literature.html`). Both work offline.

## Update the numbers

Run `../data cleaning/data_cleaning.R` (Source in RStudio). At the end it
writes:

- `data/glance_data.js`: every number and chart on the main page
- `data/literature_data.js`: the list on `literature.html`

Both hold only what the page reads: counts and the literature list, no
statement text.

Then reload the page. Never edit those two files by hand.

## Change the text

All sentences are in `index.html` and `literature.html`. Numbers inside them
are filled in from the data. Placeholders still to fill are in square brackets.

## Put it online

Upload the folder to any static host (GitHub Pages, Netlify, the university
web space). Nothing else is needed. On GitHub Pages: Settings, Pages, deploy
from the `main` branch, root folder.

## What is in this folder

```
index.html             the main page (all text is here)
literature.html        the literature list
css/glance.css         layout and animations of both pages
css/literature.css     extra styles for the literature page
css/fonts.css          the two fonts (files in fonts/)
js/build.js            builds the data parts of the main page
js/glance.js           globes, scroll animations, pinned sections
js/literature.js       list, sorting and pages of the literature page
data/                  made by data_cleaning.R, do not edit
geo/                   map shapes for the two globes (see geo/README.txt)
flags/                 country flags (flag-icons, MIT licence)
img/                   logos, photos (IISD/ENB, credited on the page), the
                       bids map and the literature preview
vendor/                d3-array, d3-geo, topojson-client (ISC licence)
fonts/                 Inter and Open Sans (SIL Open Font Licence)
```

## Not done yet

- Phones: nothing breaks, but the pinned sections are cramped.
- When the page is public, tell Marine Regions (info@marineregions.org) that
  their High Seas layer is used, as they ask.
