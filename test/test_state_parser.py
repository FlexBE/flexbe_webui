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

"""Unit tests for state parser safety behaviors."""

from flexbe_core import EventState

from flexbe_webui.io.state_parser import parse_state


def test_parse_state_restores_eventstate_init(monkeypatch, tmp_path):
    """Parsing a state should not leave EventState.__init__ monkeypatched."""
    module_path = tmp_path / 'demo_state.py'
    module_path.write_text(
        """
from flexbe_core import EventState


class DemoState(EventState):
    def __init__(self):
        super().__init__(outcomes=['done'], input_keys=['request'], output_keys=['result'])
""".strip(),
        encoding='utf-8',
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    original_event_init = EventState.__init__

    state_defs = parse_state('demo_state', str(module_path))

    assert state_defs is not None
    assert len(state_defs) == 1
    assert state_defs[0].state_class == 'DemoState'
    assert EventState.__init__ is original_event_init
