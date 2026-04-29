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

from concurrent.futures import ThreadPoolExecutor

from flexbe_core import EventState

from flexbe_webui.io.state_parser import parse_state, parse_state_folder

import pytest


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


def test_parse_state_serializes_eventstate_init_patch(monkeypatch, tmp_path):
    """Concurrent parses should not cross-wire the temporary EventState patch."""
    for module_name, outcome in (('demo_state_one', 'one'), ('demo_state_two', 'two')):
        module_path = tmp_path / f'{module_name}.py'
        module_path.write_text(
            f"""
import time

from flexbe_core import EventState


class DemoState(EventState):
    def __init__(self):
        time.sleep(0.05)
        super().__init__(outcomes=['{outcome}'], input_keys=['request'], output_keys=['result'])
""".strip(),
            encoding='utf-8',
        )
    monkeypatch.syspath_prepend(str(tmp_path))

    original_event_init = EventState.__init__

    def parse(module_name):
        state_defs = parse_state(module_name, str(tmp_path / f'{module_name}.py'))
        return state_defs[0].state_outcomes

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(parse, ['demo_state_one', 'demo_state_two']))

    assert outcomes == [['one'], ['two']]
    assert EventState.__init__ is original_event_init


def test_parse_state_folder_follows_symlinks_without_cycles(monkeypatch, tmp_path):
    """Folder parsing should follow symlink-install paths without recursing forever."""
    package_path = tmp_path / 'test_pkg'
    package_path.mkdir()
    (package_path / '__init__.py').write_text('', encoding='utf-8')
    (package_path / 'demo_state.py').write_text(
        """
from flexbe_core import EventState


class DemoState(EventState):
    def __init__(self):
        super().__init__(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )
    try:
        (package_path / 'loop').symlink_to(package_path, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f'Symlink creation unavailable: {exc}')

    monkeypatch.syspath_prepend(str(tmp_path))

    state_defs = parse_state_folder(str(package_path))

    assert [state_def.state_class for state_def in state_defs] == ['DemoState']
