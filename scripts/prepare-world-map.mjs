// Natural Earth public-domain boundaries, distributed by world-atlas (ISC).
import fs from 'node:fs';
import { feature } from 'topojson-client';
import countries from 'i18n-iso-countries';
const topology=JSON.parse(fs.readFileSync(new URL('../node_modules/world-atlas/countries-110m.json',import.meta.url),'utf8'));
const geojson=feature(topology,topology.objects.countries);
for(const country of geojson.features)country.properties={name:country.properties.name,iso:countries.numericToAlpha2(country.id)||''};
const directory=new URL('../public/geo/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(new URL('countries.json',directory),JSON.stringify(geojson));
console.log(`${geojson.features.length} country shapes prepared.`);
