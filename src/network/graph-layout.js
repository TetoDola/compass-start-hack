import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';

function connectionWeight(edge) {
  if (edge.labels?.some(label => /^(organization|education|role)$/i.test(label))) return 2;
  if (edge.labels?.every(label => /^mention$/i.test(label))) return .45;
  return 1;
}

// Greedy modularity groups densely connected neighborhoods without inventing links.
// Counting expected connections discounts popular hubs that would otherwise absorb everyone.
function communities(nodes, springs) {
  const membership = new Map(nodes.map(n => [n.id, n.id]));
  const degree = new Map(nodes.map(n => [n.id, 0]));
  for (const edge of springs) {
    degree.set(edge.source, degree.get(edge.source) + edge.weight);
    degree.set(edge.target, degree.get(edge.target) + edge.weight);
  }
  const total = [...degree.values()].reduce((sum, value) => sum + value, 0);
  while (total) {
    const between = new Map();
    for (const edge of springs) {
      const [a, b] = [membership.get(edge.source), membership.get(edge.target)].sort();
      if (a === b) continue;
      const key = JSON.stringify([a, b]);
      const pair = between.get(key) || { a, b, weight: 0 };
      pair.weight += edge.weight;
      between.set(key, pair);
    }
    let best, gain = 1e-8;
    for (const pair of between.values()) {
      const next = pair.weight - 1.15 * degree.get(pair.a) * degree.get(pair.b) / total;
      if (next > gain) { best = pair; gain = next; }
    }
    if (!best) break;
    for (const [id, group] of membership) if (group === best.b) membership.set(id, best.a);
    degree.set(best.a, degree.get(best.a) + degree.get(best.b));
    degree.delete(best.b);
  }
  return membership;
}

export function createGraphLayout(nodes, edges, aspect = 1.6) {
  // Stable ordering keeps a reload from shuffling the map; never mutate CRM records.
  const data = nodes.map(n => ({ ...n })).sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(data.map(n => [n.id, n]));
  const neighbors = new Map(data.map(n => [n.id, new Set()]));
  const pairs = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target) || edge.source === edge.target) continue;
    neighbors.get(edge.source).add(edge.target);
    neighbors.get(edge.target).add(edge.source);
    const [source, target] = [edge.source, edge.target].sort();
    const key = JSON.stringify([source, target]);
    const weight = Math.max(connectionWeight(edge), pairs.get(key)?.weight || 0);
    pairs.set(key, { source, target, weight });
  }
  const springs = [...pairs.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const membership = communities(data, springs);
  const groups = new Map();
  for (const node of data) {
    node.degree = neighbors.get(node.id).size;
    node.r = node.type === 'news' ? 4 : Math.min(16, 5.5 + Math.sqrt(node.degree) * 1.8 + (node.type === 'portfolio' ? 1 : 0));
    node.community = node.degree ? membership.get(node.id) : 'unconnected';
    if (!groups.has(node.community)) groups.set(node.community, { id: node.community, members: [] });
    groups.get(node.community).members.push(node);
  }
  const centers = [...groups.values()];
  for (const group of centers) group.r = 30 + Math.sqrt(group.members.length) * 32;
  const bridges = new Map();
  for (const edge of springs) {
    const [source, target] = [byId.get(edge.source).community, byId.get(edge.target).community].sort();
    if (source !== target) bridges.set(JSON.stringify([source, target]), { source, target });
  }
  const groupSimulation = forceSimulation(centers)
    .force('link', forceLink([...bridges.values()]).id(d => d.id).distance(d => d.source.r + d.target.r + 55).strength(.12))
    .force('charge', forceManyBody().strength(-250))
    .force('collision', forceCollide(d => d.r + 22).iterations(3))
    .force('x', forceX(0).strength(.035 / aspect)).force('y', forceY(0).strength(.035 * aspect)).stop();
  groupSimulation.tick(250);
  for (const group of centers) group.members.forEach((node, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = 22 * Math.sqrt(index);
    node.x = group.x + Math.cos(angle) * radius;
    node.y = group.y + Math.sin(angle) * radius;
  });
  const simulation = forceSimulation(data)
    .force('link', forceLink(springs).id(d => d.id)
      .distance(d => d.source.community === d.target.community ? 52 + d.source.r + d.target.r : 155)
      .strength(d => (d.source.community === d.target.community ? .32 : .045) * d.weight / Math.sqrt(Math.min(d.source.degree, d.target.degree))))
    .force('charge', forceManyBody().strength(d => -75 - d.degree * 7))
    .force('collision', forceCollide(d => d.r + 15).iterations(3))
    .force('x', forceX(d => groups.get(d.community).x).strength(.12))
    .force('y', forceY(d => groups.get(d.community).y).strength(.12))
    .velocityDecay(.45).stop();
  simulation.tick(280);
  return { data, simulation, neighbors };
}
