import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { drag } from 'd3-drag';
const TYPE_NAMES = { client: 'Customer', portfolio: 'Portfolio', fund: 'Fund or ETF', company: 'Company security', instrument: 'Instrument', note: 'Customer note', issue: 'Recorded review point', news: 'News', sector: 'Industry', country: 'Country', region: 'Fund region', 'house-view': 'Public house-view sample', proposal: 'Proposal', metric: 'Calculation' };
import { createGraphLayout } from './graph-layout.js';

import { COLORS } from '../lib/colors';
export { COLORS };
export function nodeColor(node, by) {
  return (node.materialEvent ? COLORS.issue : COLORS[node.type]) || '#75818a';
}

export default forwardRef(function Graph({ nodes, edges, layoutKey = '', selectedId, selectedEdgeId, colorBy = 'type', onSelect, onEdgeSelect }, ref) {
  const svgRef = useRef(null), container = useRef(null), scene = useRef(null);
  const previousLayout = useRef(null);
  const current = useRef();
  current.current = { onSelect, onEdgeSelect, selectedId, selectedEdgeId, colorBy };
  useImperativeHandle(ref, () => ({
    fit: () => scene.current?.fit(),
    zoom: amount => scene.current?.svg.call(scene.current.behavior.scaleBy, amount),
  }), []);

  useEffect(() => {
    const svg = select(svgRef.current);
    const focusedNode = svg.select('.graph-node:focus').node()?.getAttribute('data-node-id');
    svg.selectAll('*').remove();
    const width = container.current.clientWidth || 900, height = container.current.clientHeight || 650;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const { data, simulation, neighbors } = createGraphLayout(nodes, edges, width / height);
    const byId = new Map(data.map(n => [n.id, n]));
    const previous = previousLayout.current?.key === layoutKey ? previousLayout.current : null;
    let viewportReady = previous?.viewportReady || false;
    // Opening a profile reveals its affiliations without moving the existing map.
    if (previous) {
      for (const node of data) {
        const point = previous.positions.get(node.id);
        if (point) { node.x = node.fx = point.x; node.y = node.fy = point.y; }
        else {
          const anchor = [...(neighbors.get(node.id) || [])].map(id => previous.positions.get(id)).find(Boolean);
          if (anchor) { node.x = anchor.x + 55; node.y = anchor.y; }
        }
      }
      if (data.some(node => !previous.positions.has(node.id))) simulation.alpha(.4).tick(90);
      for (const node of data) { node.fx = null; node.fy = null; }
      simulation.alpha(0).stop();
    }
    const links = edges.filter(e => byId.has(e.source) && byId.has(e.target))
      .map(e => ({ ...e, source: byId.get(e.source), target: byId.get(e.target) }));
    const pairs = new Map();
    for (const edge of links) {
      const key = JSON.stringify([edge.source.id, edge.target.id].sort());
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(edge);
    }
    for (const pair of pairs.values()) pair.forEach((edge, index) => {
      edge.curve = (index - (pair.length - 1) / 2) * 22 * (edge.source.id < edge.target.id ? 1 : -1);
    });
    const defs = svg.append('defs');
    data.filter(n => n.image).forEach(n => defs.append('clipPath').attr('id', `clip-${n.id}`).append('circle').attr('r', n.r - .7));
    const group = svg.append('g').attr('class', 'graph-world');
    let transform = zoomIdentity, hoveredId = null, focusedId = null;
    const behavior = zoom().scaleExtent([.12, 5]).on('zoom', event => {
      transform = event.transform;
      group.attr('transform', transform);
      renderLabels();
      appearance();
    });
    svg.call(behavior).on('dblclick.zoom', null)
      .on('click.clear', event => { if (event.target === svgRef.current) { current.current.onSelect(null); } });
    const link = group.append('g').selectAll('path').data(links).join('path')
      .attr('class', 'graph-line').attr('stroke-dasharray', d => d.inferred ? '4 4' : null).attr('fill', 'none').attr('vector-effect', 'non-scaling-stroke');
    const linkHit = group.append('g').selectAll('path').data(links).join('path')
      .attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 10).attr('vector-effect', 'non-scaling-stroke').attr('class', 'graph-link-hit')
      .attr('role', 'button').attr('aria-label', d => `${d.source.name} → ${d.target.name}: ${d.labels.join(', ')}`)
      .on('click', (event, d) => { event.stopPropagation(); current.current.onEdgeSelect?.(d.id); });
    linkHit.append('title').text(d => `${d.source.name} → ${d.target.name}\n${d.labels.join(' · ')}`);

    const node = group.append('g').selectAll('g').data(data).join('g')
      .attr('class', 'graph-node').attr('data-node-id', d => d.id).attr('data-community', d => d.community)
      .attr('tabindex', (_, index) => index === 0 ? 0 : -1)
      .attr('role', 'button').attr('aria-label', d => `${d.name}, ${TYPE_NAMES[d.type]}`)
      .on('click', (event, d) => { event.stopPropagation(); current.current.onSelect(d.id); })
      .on('mouseenter', (_, d) => { hoveredId = d.id; highlight(); })
      .on('mouseleave', () => { hoveredId = null; highlight(); })
      .on('focus', (_, d) => { focusedId = d.id; highlight(); })
      .on('blur', () => { focusedId = null; highlight(); })
      .on('keydown', (event, d) => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); current.current.onSelect(d.id); }
        if (event.key === 'Escape') { current.current.onSelect(null); }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          let next = event.key === 'Home' ? data[0] : event.key === 'End' ? data.at(-1) : null;
          if (!next) {
            const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key), sign = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
            next = data.filter(n => n.id !== d.id && (horizontal ? n.x - d.x : n.y - d.y) * sign > 0)
              .sort((a, b) => {
                const score = n => Math.hypot(n.x - d.x, n.y - d.y) + Math.abs(horizontal ? n.y - d.y : n.x - d.x) * 2;
                return score(a) - score(b);
              })[0];
          }
          if (next) {
            node.attr('tabindex', n => n === next ? 0 : -1);
            const [x, y] = transform.apply([next.x, next.y]);
            const w = container.current.clientWidth, h = container.current.clientHeight;
            if (x < 35 || x > w - 35 || y < 35 || y > h - 50) {
              svg.call(behavior.transform, zoomIdentity.translate(w / 2 - next.x * transform.k, h / 2 - next.y * transform.k).scale(transform.k));
            }
            node.filter(n => n === next).node().focus({ preventScroll: true });
          }
        }
      });
    node.append('circle').attr('class', 'node-hit').attr('fill', 'transparent');
    node.append('circle').attr('class', 'selection-ring').attr('r', d => d.r + 4).attr('fill', 'none')
      .attr('stroke', '#344e6a').attr('stroke-width', 1.5).attr('vector-effect', 'non-scaling-stroke');
    node.append('circle').attr('class', 'node-disc').attr('r', d => d.r)
      .attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke').attr('stroke-dasharray', d => d.unresolved ? '2 2' : null);
    const imageRadius = d => d.type === 'org' ? d.r * .7 : d.r - .7;
    node.filter(d => d.image).append('image').attr('href', d => d.image).attr('x', d => -imageRadius(d)).attr('y', d => -imageRadius(d))
      .attr('width', d => 2 * imageRadius(d)).attr('height', d => 2 * imageRadius(d))
      .attr('preserveAspectRatio', d => d.type === 'org' ? 'xMidYMid meet' : 'xMidYMid slice').attr('clip-path', d => `url(#clip-${d.id})`);
    node.append('title').text(d => `${d.name}\n${d.degree} connection${d.degree === 1 ? '' : 's'}`);

    // Names are drawn at a fixed readable size, close to their node, and never on top of one another.
    const labels = svg.append('g').attr('class', 'graph-labels').attr('aria-hidden', 'true')
      .selectAll('g').data(data).join('g').attr('class', 'graph-label');
    labels.append('text').attr('class', 'node-label').attr('text-anchor', 'middle');
    const unconnected = data.filter(d => !d.degree);
    const unconnectedLabel = svg.append('text').attr('class', 'graph-unconnected-label').attr('text-anchor', 'middle')
      .attr('aria-hidden', 'true').text(unconnected.length ? 'No visible links' : '');
    const textElements = new Map();
    labels.select('text').each(function(d) { textElements.set(d.id, this); });
    const textWidths = new Map();
    const leaders = new Set(data.filter(n => n.degree >= 8).map(n => n.id));
    for (const community of new Set(data.map(n => n.community))) {
      if (community === 'unconnected') continue;
      const members = data.filter(n => n.community === community);
      const leader = members.sort((a, b) => (b.type === 'org') - (a.type === 'org') || b.degree - a.degree)[0];
      leaders.add(leader.id);
    }
    function emphasis() {
      const edge = links.find(e => e.id === current.current.selectedEdgeId);
      const id = byId.has(current.current.selectedId) ? current.current.selectedId : edge ? null : focusedId || hoveredId;
      const important = new Set([...(id ? [id] : edge ? [edge.source.id, edge.target.id] : []), hoveredId, focusedId].filter(Boolean));
      const nearby = new Set(important);
      if (id) for (const neighbor of neighbors.get(id) || []) nearby.add(neighbor);
      return { id, edge, important, nearby, active: !!(id || edge) };
    }
    function appearance() {
      const portraits = transform.k >= 1.65;
      node.select('image').attr('display', portraits ? null : 'none');
      node.select('.node-disc').attr('fill', d => portraits && d.image || d.unresolved ? '#fff' : nodeColor(d, current.current.colorBy))
        .attr('stroke', d => nodeColor(d, current.current.colorBy));
      node.select('.node-hit').attr('r', d => Math.max(d.r, 13 / transform.k));
    }
    function renderLabels() {
      const scale = transform.k, w = container.current.clientWidth, h = container.current.clientHeight;
      const { important, nearby, active } = emphasis();
      labels.attr('display', null);
      const circles = data.map(d => { const [x, y] = transform.apply([d.x, d.y]); return { id: d.id, x, y, r: d.r * scale + 3 }; });
      const placed = [];
      const rank = d => important.has(d.id) ? 3 : nearby.has(d.id) ? 2 : leaders.has(d.id) ? 1 : 0;
      const ordered = [...data].sort((a, b) => rank(b) - rank(a) || b.degree - a.degree);
      for (const d of ordered) {
        d.label = null;
        const [x, y] = transform.apply([d.x, d.y]), r = d.r * scale;
        if (x + r < 0 || x - r > w || y + r < 0 || y - r > h - 32) continue;
        if (active ? !nearby.has(d.id) : !leaders.has(d.id) && !(d.degree >= 4) && scale < 1.05) continue;
        const element = textElements.get(d.id), weight = important.has(d.id) || leaders.has(d.id) ? '500' : '400';
        element.style.fontWeight = weight;
        const shortName = d.name;
        let text = important.has(d.id) ? d.name : shortName.length <= 32 ? shortName : shortName.slice(0, 29) + '…';
        element.textContent = text;
        const measure = () => {
          const key = `${weight}:${text}`;
          if (!textWidths.has(key)) textWidths.set(key, element.getComputedTextLength());
          return textWidths.get(key);
        };
        while (measure() > Math.min(310, w - 24) && text.length > 2) {
          text = text.replace(/…$/, '').slice(0, -1) + '…'; element.textContent = text;
        }
        const width = measure() + 8, height = 19, gap = r + 7;
        const candidates = (leaders.has(d.id) || important.has(d.id) ? [0, 10, 20] : [0]).flatMap(extra =>
          [[x, y + gap + extra + height / 2], [x, y - gap - extra - height / 2], [x + gap + extra + width / 2, y], [x - gap - extra - width / 2, y]]);
        for (const [cx, cy] of candidates) {
          const box = { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2 };
          if (box.left < 8 || box.right > w - 8 || box.top < 8 || box.bottom > h - 34) continue;
          if (placed.some(b => box.left < b.right + 5 && box.right > b.left - 5 && box.top < b.bottom + 3 && box.bottom > b.top - 3)) continue;
          if (circles.some(c => Math.hypot(c.x - Math.max(box.left, Math.min(box.right, c.x)), c.y - Math.max(box.top, Math.min(box.bottom, c.y))) < c.r)) continue;
          d.label = { x: cx, y: cy }; placed.push(box); break;
        }
        // A focused name must remain visible even in a dense cluster; its halo keeps it readable.
        if (!d.label && important.has(d.id)) d.label = { x: Math.max(width / 2 + 8, Math.min(w - width / 2 - 8, x)), y: Math.max(18, Math.min(h - 46, y - gap - 10)) };
      }
      labels.attr('display', d => d.label ? null : 'none').attr('transform', d => d.label ? `translate(${d.label.x},${d.label.y})` : null);
      labels.select('text').attr('y', 4).attr('fill', d => important.has(d.id) ? '#202c35' : '#535c63');
      if (unconnected.length) {
        const points = unconnected.map(d => transform.apply([d.x, d.y]));
        unconnectedLabel.attr('x', (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2)
          .attr('y', Math.max(...points.map(p => p[1])) + 23).attr('display', active || scale >= 1.05 ? 'none' : null);
      }
    }
    function path(d) {
      const { source: a, target: b } = d;
      if (a === b) return `M${a.x},${a.y - a.r} C${a.x + 35},${a.y - 40} ${a.x + 35},${a.y + 40} ${a.x},${a.y + a.r}`;
      const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const mx = (a.x + b.x) / 2 - (b.y - a.y) / distance * d.curve;
      const my = (a.y + b.y) / 2 + (b.x - a.x) / distance * d.curve;
      if (distance <= a.r + b.r + 2) return '';
      const startLength = Math.hypot(mx - a.x, my - a.y) || 1, endLength = Math.hypot(b.x - mx, b.y - my) || 1;
      return `M${a.x + (mx - a.x) / startLength * (a.r + 1)},${a.y + (my - a.y) / startLength * (a.r + 1)} Q${mx},${my} ${b.x - (b.x - mx) / endLength * (b.r + 1)},${b.y - (b.y - my) / endLength * (b.r + 1)}`;
    }
    function positions() { link.attr('d', path); linkHit.attr('d', path); node.attr('transform', d => `translate(${d.x},${d.y})`); renderLabels(); }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    simulation.on('tick', positions);
    node.call(drag().clickDistance(4)
      .on('start', (event, d) => {
        event.sourceEvent.stopPropagation();
        d.fx = d.x; d.fy = d.y;
        if (!event.active && !reducedMotion) simulation.alphaTarget(.12).restart();
      })
      .on('drag', (event, d) => { d.x = d.fx = event.x; d.y = d.fy = event.y; positions(); })
      .on('end', (event, d) => {
        d.fx = null; d.fy = null;
        if (!event.active) simulation.alphaTarget(0);
      }));
    function highlight() {
      const { id, edge, nearby, active } = emphasis();
      node.attr('opacity', d => !active || nearby.has(d.id) ? 1 : .24);
      node.select('.selection-ring').attr('opacity', d => d.id === current.current.selectedId || d.id === focusedId ? 1 : 0);
      link.attr('stroke', '#7e8d98').attr('opacity', d => !active ? .38 : d.id === edge?.id || d.source.id === id || d.target.id === id ? .9 : .07)
        .attr('stroke-width', d => d.id === edge?.id ? 2.2 : active && (d.source.id === id || d.target.id === id) ? 1.35 : .8);
      renderLabels(); appearance();
    }
    const fit = () => {
      const w = container.current.clientWidth, h = container.current.clientHeight;
      if (!data.length || !w || !h) return;
      svg.attr('viewBox', `0 0 ${w} ${h}`);
      const x0 = Math.min(...data.map(n => n.x - n.r)), x1 = Math.max(...data.map(n => n.x + n.r));
      const y0 = Math.min(...data.map(n => n.y - n.r)), y1 = Math.max(...data.map(n => n.y + n.r));
      const scale = Math.max(.12, Math.min((w - 100) / Math.max(1, x1 - x0), (h - 100) / Math.max(1, y1 - y0), 1.6));
      svg.call(behavior.transform, zoomIdentity.translate(w / 2 - scale * (x0 + x1) / 2, (h - 25) / 2 - scale * (y0 + y1) / 2).scale(scale));
      viewportReady = true;
    };
    scene.current = { svg, behavior, fit, highlight };
    positions();
    if (previous && viewportReady) svg.call(behavior.transform, previous.transform); else fit();
    highlight();
    if (focusedNode && byId.has(focusedNode)) {
      node.attr('tabindex', d => d.id === focusedNode ? 0 : -1);
      node.filter(d => d.id === focusedNode).node().focus({ preventScroll: true });
    }
    // Layout fallback dimensions are not a visible viewport. A mounted graph can
    // start inside a closed dialog, so always fit after its first real reveal.
    let observedWidth = container.current.clientWidth, observedHeight = container.current.clientHeight, resizeFrame = 0;
    let wasVisible = observedWidth > 0 && observedHeight > 0;
    let needsRevealFit = !wasVisible;
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = container.current;
      const visible = w > 0 && h > 0;
      const revealed = visible && !wasVisible;
      const resized = w !== observedWidth || h !== observedHeight;
      wasVisible = visible; observedWidth = w; observedHeight = h;
      if (!visible) { needsRevealFit = true; cancelAnimationFrame(resizeFrame); return; }
      if (revealed) needsRevealFit = true;
      if (revealed || resized) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          const { clientWidth: nextWidth, clientHeight: nextHeight } = container.current;
          if (!nextWidth || !nextHeight) { needsRevealFit = true; return; }
          if (needsRevealFit) { textWidths.clear(); fit(); needsRevealFit = false; }
          else {
            // A visible resize changes the viewport, not the adviser's zoom.
            svg.attr('viewBox', `0 0 ${nextWidth} ${nextHeight}`);
            renderLabels();
          }
        });
      }
    });
    observer.observe(container.current);
    return () => {
      previousLayout.current = { key: layoutKey, positions: new Map(data.map(n => [n.id, { x: n.x, y: n.y }])), transform, viewportReady: viewportReady && wasVisible };
      observer.disconnect(); cancelAnimationFrame(resizeFrame); simulation.stop(); svg.on('.zoom', null).on('.clear', null); scene.current = null;
    };
  }, [nodes, edges, layoutKey]);
  useEffect(() => { scene.current?.highlight(); }, [selectedId, selectedEdgeId, colorBy]);
  return <div className="graph-canvas" ref={container}>
    <svg ref={svgRef} role="group" aria-label="Interactive relationship network" aria-describedby="graph-keyboard-help"/>
    <span id="graph-keyboard-help" className="visually-hidden">Use arrow keys to move to nearby nodes and Enter to inspect a source. Escape clears the selection. Select an edge to inspect its relationship.</span>
    <div className="graph-hint">Drag to explore <span>·</span> Scroll to zoom <span>·</span> Hover to trace connections</div>
    {!nodes.length && <div className="graph-empty">No records match these filters.</div>}
  </div>;
});
