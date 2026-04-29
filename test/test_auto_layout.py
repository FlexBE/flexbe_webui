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

"""Tests for server-side statemachine auto-layout."""

from flexbe_webui.io.auto_layout import compute_auto_layout
from flexbe_webui.io.base_models import AutoLayoutRequest, LayoutNode, LayoutTransition


def test_compute_auto_layout_places_outcomes_after_states():
    """Sequential states should flow left-to-right with outcomes in the final column."""
    request = AutoLayoutRequest(
        container_name='root',
        initial_state_name='Inspect',
        states=[
            LayoutNode(state_name='Inspect', state_class='InspectState', position_x=0, position_y=0),
            LayoutNode(state_name='Move', state_class='MoveState', position_x=0, position_y=150),
        ],
        outcomes=[
            LayoutNode(state_name='failed', state_class=':OUTCOME', position_x=200, position_y=0),
            LayoutNode(state_name='finished', state_class=':OUTCOME', position_x=200, position_y=80),
        ],
        transitions=[
            LayoutTransition(from_state_name='Inspect', to_state_name='Move', outcome='continue'),
            LayoutTransition(from_state_name='Inspect', to_state_name='failed', outcome='error'),
            LayoutTransition(from_state_name='Move', to_state_name='finished', outcome='done'),
        ],
    )

    result = compute_auto_layout(request)
    states = {entry['state_name']: entry for entry in result['states']}
    outcomes = {entry['state_name']: entry for entry in result['outcomes']}

    assert states['Inspect']['position_x'] < states['Move']['position_x']
    assert states['Move']['position_x'] < outcomes['finished']['position_x']
    assert outcomes['finished']['position_x'] == outcomes['failed']['position_x']


def test_compute_auto_layout_keeps_disconnected_states_unique():
    """Disconnected states should still receive distinct non-overlapping placements."""
    request = AutoLayoutRequest(
        container_name='root',
        states=[
            LayoutNode(state_name='Alpha', state_class='AlphaState', position_x=0, position_y=0),
            LayoutNode(state_name='Beta', state_class='BetaState', position_x=0, position_y=120),
        ],
        outcomes=[],
        transitions=[],
    )

    result = compute_auto_layout(request)
    states = {entry['state_name']: entry for entry in result['states']}

    assert states['Alpha']['position_x'] == states['Beta']['position_x']
    assert states['Alpha']['position_y'] != states['Beta']['position_y']


def test_compute_auto_layout_orders_outcomes_by_predecessor_flow():
    """Outcome placement should respect the left-to-right flow of their predecessors."""
    request = AutoLayoutRequest(
        container_name='root',
        initial_state_name='Inspect',
        states=[
            LayoutNode(state_name='Inspect', state_class='InspectState', position_x=0, position_y=0),
            LayoutNode(state_name='Navigate', state_class='NavigateState', position_x=180, position_y=0),
            LayoutNode(state_name='Recover', state_class='RecoverState', position_x=180, position_y=120),
        ],
        outcomes=[
            LayoutNode(state_name='finished', state_class=':OUTCOME', position_x=320, position_y=0),
            LayoutNode(state_name='failed', state_class=':OUTCOME', position_x=320, position_y=80),
        ],
        transitions=[
            LayoutTransition(from_state_name='Inspect', to_state_name='Navigate', outcome='go'),
            LayoutTransition(from_state_name='Inspect', to_state_name='Recover', outcome='retry'),
            LayoutTransition(from_state_name='Navigate', to_state_name='finished', outcome='done'),
            LayoutTransition(from_state_name='Recover', to_state_name='failed', outcome='abort'),
        ],
    )

    result = compute_auto_layout(request)
    outcomes = {entry['state_name']: entry for entry in result['outcomes']}

    assert outcomes['finished']['position_y'] < outcomes['failed']['position_y']


def test_initial_state_placed_at_top_of_its_rank():
    """Initial state must be topmost within its rank regardless of prior y-position."""
    request = AutoLayoutRequest(
        container_name='root',
        initial_state_name='Start',
        states=[
            LayoutNode(state_name='Start', state_class='StartState', position_x=0, position_y=500),
            LayoutNode(state_name='Other', state_class='OtherState', position_x=0, position_y=0),
        ],
        outcomes=[],
        transitions=[],
    )

    result = compute_auto_layout(request)
    states = {entry['state_name']: entry for entry in result['states']}

    assert states['Start']['position_y'] < states['Other']['position_y']


def test_initial_state_topmost_when_disconnected_peers_at_same_rank():
    """Initial state stays topmost even when non-initial states also have no predecessors."""
    request = AutoLayoutRequest(
        container_name='root',
        initial_state_name='Entry',
        states=[
            LayoutNode(state_name='Entry', state_class='EntryState', position_x=0, position_y=200),
            LayoutNode(state_name='AlphaIsland', state_class='AlphaState', position_x=0, position_y=0),
            LayoutNode(state_name='BetaIsland', state_class='BetaState', position_x=0, position_y=100),
        ],
        outcomes=[
            LayoutNode(state_name='done', state_class=':OUTCOME', position_x=200, position_y=0),
        ],
        transitions=[
            LayoutTransition(from_state_name='Entry', to_state_name='done', outcome='ok'),
        ],
    )

    result = compute_auto_layout(request)
    states = {entry['state_name']: entry for entry in result['states']}

    assert states['Entry']['position_y'] < states['AlphaIsland']['position_y']
    assert states['Entry']['position_y'] < states['BetaIsland']['position_y']


def test_tarjan_scc_does_not_overflow_on_deep_chain():
    """Iterative SCC must not raise RecursionError on a chain longer than Python's stack."""
    n = 1500
    states = [
        LayoutNode(state_name=f'S{i}', state_class='SomeState', position_x=0, position_y=i * 10)
        for i in range(n)
    ]
    transitions = [
        LayoutTransition(from_state_name=f'S{i}', to_state_name=f'S{i + 1}', outcome='next')
        for i in range(n - 1)
    ]
    request = AutoLayoutRequest(
        container_name='root',
        initial_state_name='S0',
        states=states,
        outcomes=[],
        transitions=transitions,
    )

    result = compute_auto_layout(request)
    assert len(result['states']) == n
