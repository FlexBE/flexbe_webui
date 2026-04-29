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

"""Unit tests for lightweight behavior interface parsing."""

import os

from flexbe_webui.io.behavior_parser import parse_behavior_interface, parse_behavior_manifest_xml


def test_parse_behavior_interface_supports_concurrency_container():
    """The lightweight parser should understand concurrency-rooted behaviors."""
    code = """
from flexbe_core import Behavior, ConcurrencyContainer


class DemoBehaviorSM(Behavior):
    def create(self):
        _sm = ConcurrencyContainer(outcomes=['done', 'failed'], input_keys=['input_a'], output_keys=['output_a'])
        return _sm
"""

    result = parse_behavior_interface(code)

    assert result == {
        'smi_outcomes': ['done', 'failed'],
        'smi_input': ['input_a'],
        'smi_output': ['output_a'],
    }


def test_parse_behavior_interface_resolves_named_lists_and_direct_return():
    """The lightweight parser should resolve simple name indirection for interface lists."""
    code = """
from flexbe_core import Behavior, PriorityContainer

OUTCOMES = ['finished', 'failed']
INPUT_KEYS = ['request']


class DemoBehaviorSM(Behavior):
    def create(self):
        output_keys = ['result']
        return PriorityContainer(outcomes=OUTCOMES, input_keys=INPUT_KEYS, output_keys=output_keys)
"""

    result = parse_behavior_interface(code)

    assert result == {
        'smi_outcomes': ['finished', 'failed'],
        'smi_input': ['request'],
        'smi_output': ['result'],
    }


def test_parse_behavior_manifest_xml_extracts_interface_but_omits_full_code(tmp_path):
    """Manifest parsing should populate lightweight interface fields without embedding the source."""
    manifest_path = tmp_path / 'demo_behavior.xml'
    code_path = tmp_path / 'demo_behavior_sm.py'

    manifest_path.write_text(
        """
<behavior name="Demo Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-03-30</date>
    <executable package_path="test_pkg.demo_behavior_sm" class="DemoBehaviorSM" />
</behavior>
""".strip(),
        encoding='utf-8',
    )
    code_path.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine

OUTCOMES = ['done']


class DemoBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=OUTCOMES, input_keys=['input_key'], output_keys=['output_key'])
""".strip(),
        encoding='utf-8',
    )

    behavior = parse_behavior_manifest_xml(str(manifest_path), str(tmp_path), True, 'utf-8')

    assert behavior is not None
    assert behavior.codefile_content == ''
    assert behavior.smi_outcomes == ['done']
    assert behavior.smi_input == ['input_key']
    assert behavior.smi_output == ['output_key']


def test_parse_behavior_manifest_xml_preserves_nested_module_paths(tmp_path):
    """Manifest parsing should resolve code files stored under behavior subpackages."""
    nested_dir = tmp_path / 'nested'
    nested_dir.mkdir()
    manifest_path = tmp_path / 'demo_nested_behavior.xml'
    code_path = nested_dir / 'demo_nested_behavior_sm.py'

    manifest_path.write_text(
        """
<behavior name="Nested Demo Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-03-30</date>
    <executable package_path="test_pkg.nested.demo_nested_behavior_sm" class="NestedDemoBehaviorSM" />
</behavior>
""".strip(),
        encoding='utf-8',
    )
    code_path.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class NestedDemoBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )

    behavior = parse_behavior_manifest_xml(str(manifest_path), str(tmp_path), True, 'utf-8')

    assert behavior is not None
    assert behavior.codefile_name == 'demo_nested_behavior_sm'
    assert behavior.codefile_path == str(nested_dir)
    assert behavior.codefile_relpath == os.path.join('nested', 'demo_nested_behavior_sm')
    assert behavior.smi_outcomes == ['done']
