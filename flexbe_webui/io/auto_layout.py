# Copyright 2026 Christopher Newport University
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Server-side statemachine auto-layout helpers.

This module implements a deterministic, dependency-light layout pass for the
active FlexBE container.  The goal is not to produce mathematically optimal
drawings, but to generate a readable editor layout without introducing a hard
runtime dependency on Graphviz or another native layout tool.

At a high level the algorithm works in four stages:

1. Build a directed graph from the active container's states, outcomes, and
   transitions.  The initial state is seeded at order 0 within its rank and
   pinned there after all barycenter passes, so it always appears upper-left
   in the rendered layout regardless of prior visual position.
2. Collapse strongly connected components (Tarjan SCC) so cycles and feedback
   loops can be ranked as one logical unit.  The condensed graph is a DAG, which
   gives us a stable left-to-right layer assignment.
3. Refine node order within each rank using barycenter-style sweeps.  We first
   preserve the current visual order as a stable seed (with the initial state
   forced to position 0), then do forward and backward passes that try to align
   nodes with neighboring ranks.
4. Place outcomes in a dedicated final column and stack each column vertically
   with coarse node-size estimates and fixed gaps.  Sequential outcome copies
   stay grouped by base outcome name, while concurrent outcomes are ordered from
   their predecessors directly.

The result is intentionally simple and predictable: repeated requests on the
same structure should return the same layout, and small graph edits should not
cause the entire container to reshuffle unpredictably.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, Iterable, Iterator, List, Optional, Tuple

from .base_models import AutoLayoutRequest, LayoutNode, LayoutTransition


INIT_NODE = '__flexbe_init__'
STATE_GAP_X = 130
STATE_GAP_Y = 80
MARGIN_X = 80
MARGIN_Y = 60
EDGE_OFFSET = 0


def _node_size(node: LayoutNode) -> Tuple[int, int]:
    """
    Return a coarse node size estimate in editor canvas pixels.

    The server does not have access to browser-rendered bounding boxes, so the
    layout pass uses conservative width/height estimates by node category.  The
    exact values are heuristic, but keeping them stable matters more than being
    pixel-perfect because they determine rank spacing and vertical stacking.
    """
    if node.state_class in {':OUTCOME', ':CONDITION'}:
        return (90, 50)
    if node.state_class == ':STATEMACHINE':
        return (190, 110)
    return (170, 95)


def _stable_sort_key(node: LayoutNode) -> Tuple[float, float, str]:
    """
    Prefer the current visual ordering before falling back to name.

    We use the existing ``y``/``x`` placement as the initial ordering signal so
    relayout behaves more like refinement than random reflow.  The state name is
    included as a final deterministic tie-breaker.
    """
    return (node.position_y, node.position_x, node.state_name)


def _base_outcome_name(name: str) -> str:
    """
    Collapse duplicate outcome copies into their shared base name.

    Sequential containers may duplicate outcome nodes as ``name#N``.  During
    layout we often want all of those copies to move as one conceptual outcome
    group, so this helper strips the copy suffix.
    """
    return name.split('#', 1)[0]


def _copy_index(name: str) -> int:
    """
    Return the duplicate outcome copy index, defaulting to zero.

    The base outcome (without ``#N``) is treated as copy ``0`` so sequential
    outcomes can be ordered in a predictable group-first, copy-second fashion.
    """
    parts = name.split('#', 1)
    if len(parts) == 1:
        return 0
    try:
        return int(parts[1])
    except ValueError:
        return 0


def _tarjan_scc(nodes: Iterable[str], adjacency: Dict[str, List[str]]) -> List[List[str]]:
    """
    Return strongly-connected components for the node set.

    We collapse SCCs before assigning ranks so feedback loops do not force
    unstable or contradictory layer assignments.  Each SCC becomes one node in
    the condensed DAG used by the rest of the algorithm.

    The implementation is iterative (explicit work stack) to avoid hitting
    Python's default recursion limit on large state machines.
    """
    node_list = list(nodes)
    index_counter = 0
    stack: List[str] = []
    on_stack: set[str] = set()
    indices: Dict[str, int] = {}
    lowlinks: Dict[str, int] = {}
    components: List[List[str]] = []

    for root in node_list:
        if root in indices:
            continue
        indices[root] = index_counter
        lowlinks[root] = index_counter
        index_counter += 1
        stack.append(root)
        on_stack.add(root)
        work: List[Tuple[str, Iterator[str]]] = [(root, iter(adjacency.get(root, [])))]

        while work:
            node, nbrs = work[-1]
            try:
                neighbor = next(nbrs)
            except StopIteration:
                work.pop()
                if work:
                    parent = work[-1][0]
                    lowlinks[parent] = min(lowlinks[parent], lowlinks[node])
                if lowlinks[node] == indices[node]:
                    component: List[str] = []
                    while stack:
                        member = stack.pop()
                        on_stack.remove(member)
                        component.append(member)
                        if member == node:
                            break
                    components.append(component)
                continue

            if neighbor not in indices:
                indices[neighbor] = index_counter
                lowlinks[neighbor] = index_counter
                index_counter += 1
                stack.append(neighbor)
                on_stack.add(neighbor)
                work.append((neighbor, iter(adjacency.get(neighbor, []))))
            elif neighbor in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[neighbor])

    return components


def _neighbor_barycenter(
    node_name: str,
    neighbors: Dict[str, List[str]],
    rank_lookup: Dict[str, int],
    order_lookup: Dict[str, int],
    target_rank: int,
) -> Optional[float]:
    """
    Average neighbor order for one adjacent rank.

    This is the core barycenter signal: if a node mostly connects to neighbors
    near the top of the adjacent rank, it should also drift upward within its
    own rank, and likewise for lower neighbors.
    """
    relevant = [
        order_lookup[neighbor]
        for neighbor in neighbors.get(node_name, [])
        if neighbor in order_lookup and rank_lookup.get(neighbor) == target_rank
    ]
    if not relevant:
        return None
    return sum(relevant) / len(relevant)


def _rank_sort_key(
    node: LayoutNode,
    neighbors: Dict[str, List[str]],
    rank_lookup: Dict[str, int],
    order_lookup: Dict[str, int],
    target_rank: int,
) -> Tuple[bool, float, float, float, str]:
    """
    Build a stable sort key that tolerates missing barycenters.

    Nodes with no usable neighbor barycenter should not crash sorting or jump to
    arbitrary positions, so we sort them after nodes with a real barycenter and
    fall back to their prior visual order.
    """
    barycenter = _neighbor_barycenter(
        node.state_name,
        neighbors,
        rank_lookup,
        order_lookup,
        target_rank,
    )
    stable = _stable_sort_key(node)
    return (
        barycenter is None,
        0.0 if barycenter is None else barycenter,
        stable[0],
        stable[1],
        stable[2],
    )


def _average_predecessor_order(
    node_names: Iterable[str],
    reverse_adjacency: Dict[str, List[str]],
    order_lookup: Dict[str, int],
) -> Optional[float]:
    """
    Average predecessor order for one node or node group.

    Outcomes live in a dedicated final column, so we cannot position them using
    normal inter-rank sweeps alone.  Instead, we order them from the average
    order of their incoming predecessors to preserve the left-to-right flow that
    led into the outcome column.
    """
    relevant: List[int] = []
    for node_name in node_names:
        relevant.extend(
            order_lookup[predecessor]
            for predecessor in reverse_adjacency.get(node_name, [])
            if predecessor in order_lookup and predecessor != INIT_NODE
        )
    if not relevant:
        return None
    return sum(relevant) / len(relevant)


def _transition_key(from_state_name: str, outcome: str) -> str:
    """Return the client-side transition key used for geometry snapshots."""
    return f'{from_state_name}::{outcome}'


def _side_axis(side: str) -> str:
    """Return the sorting axis for a side port group."""
    return 'x' if side in {'top', 'bottom'} else 'y'


def _side_coordinate(
    box: Dict[str, float],
    side: str,
    index: int,
    count: int,
) -> Dict[str, float]:
    """
    Return a deterministic point on one side of a laid-out node.

    Ports are evenly spread along the selected side.  High fan-in/fan-out nodes
    therefore get separate attachment points instead of forcing all arrows
    through the side midpoint.
    """
    count = max(count, 1)
    fraction = (index + 1) / (count + 1)
    if side == 'left':
        return {
            'x': box['x'] - EDGE_OFFSET,
            'y': box['y'] + box['height'] * fraction,
        }
    if side == 'right':
        return {
            'x': box['x'] + box['width'] + EDGE_OFFSET,
            'y': box['y'] + box['height'] * fraction,
        }
    if side == 'top':
        return {
            'x': box['x'] + box['width'] * fraction,
            'y': box['y'] - EDGE_OFFSET,
        }
    return {
        'x': box['x'] + box['width'] * fraction,
        'y': box['y'] + box['height'] + EDGE_OFFSET,
    }


def _edge_sides(source: Dict[str, float], target: Dict[str, float]) -> Tuple[str, str]:
    """
    Pick source and target sides based on relative center positions.

    Auto-layout is left-to-right, so edges between different columns should
    prefer left/right ports even when the vertical separation is large.  Vertical
    ports are reserved for nodes that are effectively stacked in the same
    column.
    """
    dx = target['cx'] - source['cx']
    dy = target['cy'] - source['cy']
    same_column_threshold = (source['width'] + target['width']) / 4
    if abs(dx) > same_column_threshold:
        if dx > 0:
            return 'right', 'left'
        return 'left', 'right'
    if dy >= 0:
        return 'bottom', 'top'
    return 'top', 'bottom'


def _rounded_point(point: Dict[str, float]) -> Dict[str, float]:
    """Round transition geometry for stable serialized results."""
    return {
        'x': round(point['x'], 3),
        'y': round(point['y'], 3),
    }


def _compute_transition_geometry(
    valid_transitions: List[LayoutTransition],
    node_boxes: Dict[str, Dict[str, float]],
) -> List[Dict[str, object]]:
    """Compute side-port endpoint and waypoint geometry for valid transitions."""
    edge_entries = []
    outgoing_groups: Dict[Tuple[str, str], List[Dict[str, object]]] = defaultdict(list)
    incoming_groups: Dict[Tuple[str, str], List[Dict[str, object]]] = defaultdict(list)

    for order, transition in enumerate(valid_transitions):
        source = node_boxes[transition.from_state_name]
        target = node_boxes[transition.to_state_name]
        source_side, target_side = _edge_sides(source, target)
        entry = {
            'transition': transition,
            'order': order,
            'source_side': source_side,
            'target_side': target_side,
        }
        edge_entries.append(entry)
        outgoing_groups[(transition.from_state_name, source_side)].append(entry)
        incoming_groups[(transition.to_state_name, target_side)].append(entry)

    for (node_name, side), entries in outgoing_groups.items():
        axis = _side_axis(side)
        entries.sort(key=lambda entry: (
            node_boxes[entry['transition'].to_state_name][f'c{axis}'],
            entry['transition'].to_state_name,
            entry['transition'].outcome,
            entry['order'],
        ))
        box = node_boxes[node_name]
        for index, entry in enumerate(entries):
            entry['beginning'] = _side_coordinate(box, side, index, len(entries))

    for (node_name, side), entries in incoming_groups.items():
        axis = _side_axis(side)
        entries.sort(key=lambda entry: (
            node_boxes[entry['transition'].from_state_name][f'c{axis}'],
            entry['transition'].from_state_name,
            entry['transition'].outcome,
            entry['order'],
        ))
        box = node_boxes[node_name]
        for index, entry in enumerate(entries):
            entry['end'] = _side_coordinate(box, side, index, len(entries))

    transition_geometry = []
    for entry in sorted(edge_entries, key=lambda item: item['order']):
        transition = entry['transition']
        beginning = entry['beginning']
        end = entry['end']
        waypoint = {
            'x': (beginning['x'] + end['x']) / 2,
            'y': (beginning['y'] + end['y']) / 2,
        }
        transition_geometry.append({
            'key': _transition_key(transition.from_state_name, transition.outcome),
            'from_state_name': transition.from_state_name,
            'to_state_name': transition.to_state_name,
            'outcome': transition.outcome,
            'x': round(waypoint['x'], 3),
            'y': round(waypoint['y'], 3),
            'beginning': _rounded_point(beginning),
            'end': _rounded_point(end),
        })

    return transition_geometry


def compute_auto_layout(layout_request: AutoLayoutRequest) -> Dict[str, object]:
    """
    Compute a deterministic layered layout for one active container.

    The returned structure contains node positions plus transition endpoint and
    waypoint geometry.  The transition hints distribute high fan-in/fan-out
    edges across side ports so the client does not redraw every default curve
    through the same midpoint.

    The layout strategy is:

    - Build adjacency from valid in-container transitions.
    - Collapse cycles into SCCs and rank the condensed DAG left-to-right.
    - Force container outcomes into a final rank after all regular states.
    - Seed intra-rank order from the current visual layout.
    - Run forward and backward barycenter passes to refine the order.
    - Apply special outcome ordering so terminal nodes match predecessor flow.
    - Convert ranks and within-rank order into concrete editor-space positions.

    This keeps the implementation portable and predictable while still producing
    a readable layered layout for typical FlexBE state machines.
    """
    state_nodes = list(layout_request.states)
    outcome_nodes = list(layout_request.outcomes)
    all_nodes = state_nodes + outcome_nodes
    all_names = {node.state_name for node in all_nodes}

    adjacency: Dict[str, List[str]] = defaultdict(list)
    reverse_adjacency: Dict[str, List[str]] = defaultdict(list)
    valid_edges: List[Tuple[str, str]] = []
    valid_transitions: List[LayoutTransition] = []

    if layout_request.initial_state_name and layout_request.initial_state_name in all_names:
        adjacency[INIT_NODE].append(layout_request.initial_state_name)
        reverse_adjacency[layout_request.initial_state_name].append(INIT_NODE)

    for transition in layout_request.transitions:
        if transition.to_state_name is None:
            continue
        if transition.from_state_name not in all_names or transition.to_state_name not in all_names:
            continue
        adjacency[transition.from_state_name].append(transition.to_state_name)
        reverse_adjacency[transition.to_state_name].append(transition.from_state_name)
        valid_edges.append((transition.from_state_name, transition.to_state_name))
        valid_transitions.append(transition)

    for node in all_names:
        adjacency.setdefault(node, [])
        reverse_adjacency.setdefault(node, [])

    components = _tarjan_scc(all_names, adjacency)
    component_by_node: Dict[str, int] = {}
    for index, component in enumerate(components):
        for node in component:
            component_by_node[node] = index

    component_graph: Dict[int, set[int]] = defaultdict(set)
    reverse_component_graph: Dict[int, set[int]] = defaultdict(set)
    indegree: Dict[int, int] = {index: 0 for index in range(len(components))}
    for source, target in valid_edges:
        src_component = component_by_node[source]
        dst_component = component_by_node[target]
        if src_component == dst_component or dst_component in component_graph[src_component]:
            continue
        component_graph[src_component].add(dst_component)
        reverse_component_graph[dst_component].add(src_component)
        indegree[dst_component] += 1

    queue = deque(sorted([index for index, value in indegree.items() if value == 0]))
    topo_order: List[int] = []
    indegree_work = indegree.copy()
    while queue:
        component_index = queue.popleft()
        topo_order.append(component_index)
        for neighbor in sorted(component_graph.get(component_index, [])):
            indegree_work[neighbor] -= 1
            if indegree_work[neighbor] == 0:
                queue.append(neighbor)

    if len(topo_order) != len(components):
        topo_order = list(range(len(components)))

    component_rank: Dict[int, int] = {}
    for component_index in topo_order:
        predecessor_ranks = [
            component_rank[predecessor]
            for predecessor in reverse_component_graph.get(component_index, set())
            if predecessor in component_rank
        ]
        if predecessor_ranks:
            component_rank[component_index] = max(predecessor_ranks) + 1
        else:
            component_rank[component_index] = 0

    node_rank = {
        node_name: component_rank[component_by_node[node_name]]
        for node_name in all_names
    }

    if outcome_nodes:
        max_state_rank = max(
            [node_rank[node.state_name] for node in state_nodes],
            default=0,
        )
        outcome_rank = max_state_rank + 1
        for node in outcome_nodes:
            node_rank[node.state_name] = outcome_rank

    ranked_nodes: Dict[int, List[LayoutNode]] = defaultdict(list)
    for node in all_nodes:
        ranked_nodes[node_rank[node.state_name]].append(node)

    init_name = layout_request.initial_state_name or ''

    order_lookup: Dict[str, int] = {}
    for _rank, nodes in ranked_nodes.items():
        nodes.sort(key=lambda n: (n.state_name != init_name, *_stable_sort_key(n)))
        for order, node in enumerate(nodes):
            order_lookup[node.state_name] = order

    sorted_ranks = sorted(ranked_nodes.keys())
    for rank in sorted_ranks[1:]:
        nodes = ranked_nodes[rank]
        previous_rank = rank - 1
        nodes.sort(key=lambda node: _rank_sort_key(node, reverse_adjacency, node_rank, order_lookup, previous_rank))
        for order, node in enumerate(nodes):
            order_lookup[node.state_name] = order

    for rank in reversed(sorted_ranks[:-1]):
        nodes = ranked_nodes[rank]
        next_rank_value = rank + 1
        nodes.sort(key=lambda node: _rank_sort_key(node, adjacency, node_rank, order_lookup, next_rank_value))
        for order, node in enumerate(nodes):
            order_lookup[node.state_name] = order

    if init_name and init_name in node_rank:
        init_rank = node_rank[init_name]
        rank_list = ranked_nodes[init_rank]
        idx = next((i for i, n in enumerate(rank_list) if n.state_name == init_name), None)
        if idx is not None and idx > 0:
            rank_list.insert(0, rank_list.pop(idx))
            for order, node in enumerate(rank_list):
                order_lookup[node.state_name] = order

    if outcome_nodes:
        outcome_rank = node_rank[outcome_nodes[0].state_name]
        if layout_request.concurrent:
            def _concurrent_sort_key(node):
                avg = _average_predecessor_order([node.state_name], reverse_adjacency, order_lookup)
                return (avg is None, 0.0 if avg is None else avg, *_stable_sort_key(node))
            ranked_nodes[outcome_rank].sort(key=_concurrent_sort_key)
        else:
            base_barycenters = {
                base_name: _average_predecessor_order(
                    [node.state_name for node in outcome_nodes if _base_outcome_name(node.state_name) == base_name],
                    reverse_adjacency,
                    order_lookup,
                )
                for base_name in {_base_outcome_name(node.state_name) for node in outcome_nodes}
            }
            ranked_nodes[outcome_rank].sort(
                key=lambda node: (
                    base_barycenters[_base_outcome_name(node.state_name)] is None,
                    0.0 if base_barycenters[_base_outcome_name(node.state_name)] is None
                    else base_barycenters[_base_outcome_name(node.state_name)],
                    _base_outcome_name(node.state_name),
                    _copy_index(node.state_name),
                    *_stable_sort_key(node),
                )
            )
        for order, node in enumerate(ranked_nodes[outcome_rank]):
            order_lookup[node.state_name] = order

    rank_widths: Dict[int, int] = {}
    for rank, nodes in ranked_nodes.items():
        rank_widths[rank] = max((_node_size(node)[0] for node in nodes), default=0)

    x_offsets: Dict[int, float] = {}
    cursor_x = float(MARGIN_X)
    for rank in sorted_ranks:
        x_offsets[rank] = cursor_x
        cursor_x += rank_widths[rank] + STATE_GAP_X

    state_positions = []
    outcome_positions = []
    node_boxes: Dict[str, Dict[str, float]] = {}
    for rank in sorted_ranks:
        cursor_y = float(MARGIN_Y)
        for node in ranked_nodes[rank]:
            width, height = _node_size(node)
            entry = {
                'state_name': node.state_name,
                'position_x': x_offsets[rank],
                'position_y': cursor_y,
            }
            node_boxes[node.state_name] = {
                'x': x_offsets[rank],
                'y': cursor_y,
                'width': width,
                'height': height,
                'cx': x_offsets[rank] + width / 2,
                'cy': cursor_y + height / 2,
            }
            if node.state_class in {':OUTCOME', ':CONDITION'}:
                outcome_positions.append(entry)
            else:
                state_positions.append(entry)
            cursor_y += height + STATE_GAP_Y

    return {
        'container_name': layout_request.container_name,
        'states': state_positions,
        'outcomes': outcome_positions,
        'transitions': _compute_transition_geometry(valid_transitions, node_boxes),
    }
