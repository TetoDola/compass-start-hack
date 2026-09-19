import { useEffect, useMemo, useRef, useState } from 'react';
import { geoDistance, geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Globe2, Map as MapIcon, Minus, Plus, RotateCcw } from 'lucide-react';
import type { ContextItem } from './lib/briefing';
import type { Exposure } from './lib/portfolio';
import { countryKey, type WorldChokepoint } from './lib/world';
import { percent } from './lib/format';

type Country=Feature<Geometry,{name:string;iso:string}>;
// A country in a headline can be part of a company name, not an event location.
export function sourceLocatedItems(items:ContextItem[]):ContextItem[] {
  return items.map(item=>{
    const geo=item.geo;
    if(!geo)return item;
    const [lon,lat]=geo.coordinates;
    return geo.basis!=='country-mention'&&Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90?item:{...item,geo:undefined};
  });
}
export function WorldMap({items,selected,chokepoints,selectedChokepoint,exposures,showExposure,loading,onExploreLocations,onSelect,onChokepoint}:{items:ContextItem[];selected?:ContextItem;chokepoints:WorldChokepoint[];selectedChokepoint?:WorldChokepoint;exposures:Exposure[];showExposure:boolean;loading?:boolean;onExploreLocations?:()=>void;onSelect:(item:ContextItem)=>void;onChokepoint:(item:WorldChokepoint)=>void}) {
  const [geometry,setGeometry]=useState<Country[]>([]),[error,setError]=useState(false);
  const [flat,setFlat]=useState(true),[rotation,setRotation]=useState<[number,number]>([-12,-24]),[zoom,setZoom]=useState(1);
  const [cluster,setCluster]=useState<string[]>([]);
  const drag=useRef<{x:number;y:number;rotation:[number,number]}|null>(null);
  useEffect(()=>{const c=new AbortController();fetch('/geo/countries.json',{signal:c.signal}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then((g:FeatureCollection<Geometry,{name:string;iso:string}>)=>setGeometry(g.features)).catch(()=>{if(!c.signal.aborted)setError(true);});return()=>c.abort();},[]);
  const located=useMemo(()=>sourceLocatedItems(items),[items]);
  const locatedCount=located.filter(item=>!!item.geo).length;
  const active=selected&&sourceLocatedItems([selected])[0];
  const focus=selectedChokepoint?.coordinates||active?.geo?.coordinates;
  useEffect(()=>{if(focus)setRotation([-focus[0],-focus[1]]);setCluster([]);},[selected?.id,selectedChokepoint?.id,geometry]);
  const projection=useMemo(()=>flat?geoNaturalEarth1().translate([400,223]).scale(143*zoom):geoOrthographic().translate([400,223]).scale(195*zoom).rotate(rotation).clipAngle(90),[flat,zoom,rotation]);
  const path=geoPath(projection),exposure=new Map(exposures.map(e=>[countryKey(e.name),e]));
  const hasMappedExposure=showExposure&&geometry.some(feature=>exposure.has(countryKey(feature.properties.name)));
  const visible=(p:[number,number])=>flat||geoDistance(p,[-rotation[0],-rotation[1]])<Math.PI/2;
  const pins: {x:number;y:number;items:ContextItem[]}[]=[];
  for(const item of located){if(!item.geo||!visible(item.geo.coordinates))continue;const p=projection(item.geo.coordinates);if(!p)continue;const old=pins.find(pin=>Math.hypot(pin.x-p[0],pin.y-p[1])<22);if(old)old.items.push(item);else pins.push({x:p[0],y:p[1],items:[item]});}
  const colors={news:'var(--layer-news)',shipping:'var(--layer-shipping)',disaster:'var(--layer-disaster)'};
  return <div className="world-stage">
    <div className="world-map-toolbar"><span>EVENTS & INFRASTRUCTURE <small>{locatedCount} located / {items.length} records</small></span><div><button aria-pressed={flat} onClick={()=>{setFlat(true);setZoom(1);}}><MapIcon size={14}/>Map</button><button aria-pressed={!flat} onClick={()=>{setFlat(false);setZoom(1);}}><Globe2 size={14}/>Globe</button></div></div>
    <svg className={`world-map ${flat?'is-flat':''}`} viewBox="0 0 800 450" aria-label="Global events map; each event is also available in the event list"
      onPointerDown={e=>{if(flat||(e.target as Element).closest('[role=button]'))return;drag.current={x:e.clientX,y:e.clientY,rotation};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(d)setRotation([d.rotation[0]+(e.clientX-d.x)*.3/zoom,Math.max(-80,Math.min(80,d.rotation[1]-(e.clientY-d.y)*.3/zoom))]);}}
      onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
      <defs><radialGradient id="world-ocean"><stop offset="0%" stopColor="var(--stage-ocean-inner)"/><stop offset="100%" stopColor="var(--stage-ocean-outer)"/></radialGradient></defs>
      <path d={path({type:'Sphere'})||''} className="world-sphere"/><path d={path(geoGraticule10())||''} className="world-grid"/>
      {geometry.map(f=>{const e=showExposure&&exposure.get(countryKey(f.properties.name));return <path key={f.properties.name} d={path(f)||''} className="world-land" style={e?{fill:'var(--accent)',fillOpacity:.25+Math.min(e.weight*2,.55)}:undefined}><title>{f.properties.name}{e?` · ${percent(e.weight,1)} reference-country exposure`:''}</title></path>;})}
      {chokepoints.filter(c=>visible(c.coordinates)).map(c=>{const p=projection(c.coordinates)!;return <g key={c.id} role="button" tabIndex={0} aria-label={`${c.name} · ${c.status==='reference'?'reference location, live status unavailable':'reported transit data'}`} onClick={()=>onChokepoint(c)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onChokepoint(c);}}} className="world-infrastructure"><path d={`M${p[0]},${p[1]-7}l7,7 -7,7 -7,-7z`} fill={c.id===selectedChokepoint?.id?'var(--layer-shipping)':'var(--stage-panel)'} stroke="var(--layer-shipping)"/><title>{c.name} · {c.status==='reference'?'Reference infrastructure only':'Reported transit data'}</title></g>;})}
      {pins.map((pin,i)=>{const selectedPin=pin.items.some(item=>item.id===selected?.id);const primary=pin.items.find(item=>item.id===selected?.id)||pin.items[0];const color=colors[primary.layer||'news'];const choose=()=>pin.items.length===1?onSelect(primary):setCluster(pin.items.map(item=>item.id));return <g key={i} role="button" tabIndex={0} aria-label={pin.items.length>1?`${pin.items.length} events near ${primary.geo?.label}`:primary.title} onClick={choose} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}}} className="world-event-marker"><circle cx={pin.x} cy={pin.y} r={selectedPin?16:pin.items.length>1?12:7} fill={color} fillOpacity={.18} stroke={selectedPin?'var(--stage-ink)':color} strokeWidth={selectedPin?2:1}/>{pin.items.length>1?<text x={pin.x} y={pin.y+4} textAnchor="middle" fill={color}>{pin.items.length}</text>:<circle cx={pin.x} cy={pin.y} r="3" fill={color}/>}<title>{primary.title} · {primary.geo?.basis==='event-location'?'Source-reported event location':'Source article location; event location unverified'} · {primary.geo?.label}{pin.items.length>1?` + ${pin.items.length-1} more`:''}</title></g>;})}
    </svg>
    {!locatedCount&&!chokepoints.length&&!error&&(hasMappedExposure&&!loading?<div className="world-map-context" role="status">No verified story locations. Shading shows portfolio country classifications, not where the reported events happened.</div>:<div className="world-map-empty" role="status"><strong>{loading?'Loading located events…':items.length?'These stories have no map pins':'No located events in this view'}</strong><p>{loading?'Checking source locations.':items.length?'Their sources did not provide verified coordinates. The stories remain available in the event list.':'Try another time window or layer to see source located events.'}</p>{!loading&&onExploreLocations&&<button onClick={onExploreLocations}>Show located global events</button>}</div>)}
    {error&&<p className="world-map-error">Map unavailable. Events and evidence remain accessible below.</p>}
    {!!cluster.length&&<div className="world-cluster" aria-label="Map cluster events"><header><strong>{cluster.length} events</strong><button onClick={()=>setCluster([])} aria-label="Close map cluster">×</button></header>{located.filter(i=>cluster.includes(i.id)).map(i=><button key={i.id} onClick={()=>{onSelect(i);setCluster([]);}}>{i.title}<small>{i.source}</small></button>)}</div>}
    <div className="world-map-bottom"><div className="world-legend"><span><i style={{background:colors.news}}/>News</span><span><i style={{background:colors.disaster}}/>Natural events</span><span><i style={{background:colors.shipping}}/>Shipping / infrastructure</span>{showExposure&&<span><i style={{background:'var(--accent)'}}/>Country classification</span>}</div><div className="world-zoom"><button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(2,z+.2))}><Plus size={14}/></button><button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.75,z-.2))}><Minus size={14}/></button><button aria-label="Reset map" onClick={()=>{setRotation([-12,-24]);setZoom(1);}}><RotateCcw size={14}/></button></div></div>
    <p className="world-map-note">Pins use supplied coordinates only. Article locations may differ from event locations. Stories without coordinates remain in the list. Shading shows portfolio country classifications; infrastructure pins do not establish disruption.</p>
  </div>;
}
