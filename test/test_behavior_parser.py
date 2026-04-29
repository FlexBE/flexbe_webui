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

from flexbe_webui.io.behavior_parser import (
    parse_behavior_folder,
    parse_behavior_interface,
    parse_behavior_manifest_xml,
)

import pytest


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


def test_parse_behavior_interface_uses_requested_class_name():
    """The lightweight parser should honor the manifest-selected behavior class."""
    code = """
from flexbe_core import Behavior, OperatableStateMachine


class HelperBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['helper'], input_keys=['helper_in'], output_keys=['helper_out'])


class RealBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'], input_keys=['request'], output_keys=['result'])
"""

    result = parse_behavior_interface(code, 'RealBehaviorSM')

    assert result == {
        'smi_outcomes': ['done'],
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
    <contains name="Child Behavior" package="child_pkg" />
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
    assert len(behavior.contains) == 1
    assert behavior.contains[0].name == 'Child Behavior'
    assert behavior.contains[0].package == 'child_pkg'


def test_parse_behavior_manifest_xml_extracts_manifest_class_interface(tmp_path):
    """Manifest parsing should extract the executable class, not the first Behavior class in the file."""
    manifest_path = tmp_path / 'demo_behavior.xml'
    code_path = tmp_path / 'demo_behavior_sm.py'

    manifest_path.write_text(
        """
<behavior name="Demo Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-03-30</date>
    <executable package_path="test_pkg.demo_behavior_sm" class="RealBehaviorSM" />
</behavior>
""".strip(),
        encoding='utf-8',
    )
    code_path.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class HelperBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['helper'], input_keys=['helper_in'], output_keys=['helper_out'])


class RealBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'], input_keys=['request'], output_keys=['result'])
""".strip(),
        encoding='utf-8',
    )

    behavior = parse_behavior_manifest_xml(str(manifest_path), str(tmp_path), True, 'utf-8')

    assert behavior is not None
    assert behavior.class_name == 'RealBehaviorSM'
    assert behavior.smi_outcomes == ['done']
    assert behavior.smi_input == ['request']
    assert behavior.smi_output == ['result']


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


def test_parse_behavior_manifest_xml_preserves_enum_and_yaml_parameter_metadata(tmp_path):
    """Manifest parsing should preserve enum options and YAML key metadata."""
    manifest_path = tmp_path / 'param_behavior.xml'
    code_path = tmp_path / 'param_behavior_sm.py'

    manifest_path.write_text(
        """
<behavior name="Parameterized Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-04-04</date>
    <executable package_path="test_pkg.param_behavior_sm" class="ParameterizedBehaviorSM" />
    <params>
        <param type="enum" name="mode" default="fast" label="Mode" hint="Execution mode">
            <option value="fast" />
            <option value="safe" />
        </param>
        <param type="yaml" name="config" default="" label="Config" hint="YAML config">
            <key name="root" />
        </param>
    </params>
</behavior>
""".strip(),
        encoding='utf-8',
    )
    code_path.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class ParameterizedBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )

    behavior = parse_behavior_manifest_xml(str(manifest_path), str(tmp_path), True, 'utf-8')

    assert behavior is not None
    assert behavior.params[0].name == 'mode'
    assert behavior.params[0].additional == ['fast', 'safe']
    assert behavior.params[1].name == 'config'
    assert behavior.params[1].additional == {'key': 'root'}


def test_parse_behavior_manifest_xml_raises_for_invalid_numeric_metadata(tmp_path):
    """Manifest parsing should fail fast when numeric parameter bounds are incomplete."""
    manifest_path = tmp_path / 'invalid_numeric_behavior.xml'
    code_path = tmp_path / 'invalid_numeric_behavior_sm.py'

    manifest_path.write_text(
        """
<behavior name="Invalid Numeric Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-04-04</date>
    <executable package_path="test_pkg.invalid_numeric_behavior_sm" class="InvalidNumericBehaviorSM" />
    <params>
        <param type="numeric" name="threshold" default="1" label="Threshold" hint="Threshold value">
            <min value="0" />
        </param>
    </params>
</behavior>
""".strip(),
        encoding='utf-8',
    )
    code_path.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class InvalidNumericBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )

    with pytest.raises(ValueError, match="missing required 'min'/'max' metadata"):
        parse_behavior_manifest_xml(str(manifest_path), str(tmp_path), True, 'utf-8')


def test_parse_behavior_folder_drops_invalid_manifest_and_reports_error(tmp_path):
    """Folder parsing should keep valid behaviors and report invalid manifests via the errors list."""
    valid_manifest = tmp_path / 'valid_behavior.xml'
    valid_code = tmp_path / 'valid_behavior_sm.py'
    invalid_manifest = tmp_path / 'invalid_behavior.xml'
    invalid_code = tmp_path / 'invalid_behavior_sm.py'

    valid_manifest.write_text(
        """
<behavior name="Valid Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-04-04</date>
    <executable package_path="test_pkg.valid_behavior_sm" class="ValidBehaviorSM" />
    <params>
        <param type="numeric" name="threshold" default="1" label="Threshold" hint="Threshold value">
            <min value="0" />
            <max value="10" />
        </param>
    </params>
</behavior>
""".strip(),
        encoding='utf-8',
    )
    valid_code.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class ValidBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )

    invalid_manifest.write_text(
        """
<behavior name="Invalid Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-04-04</date>
    <executable package_path="test_pkg.invalid_behavior_sm" class="InvalidBehaviorSM" />
    <params>
        <param type="numeric" name="threshold" default="1" label="Threshold" hint="Threshold value">
            <max value="10" />
        </param>
    </params>
</behavior>
""".strip(),
        encoding='utf-8',
    )
    invalid_code.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class InvalidBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['failed'])
""".strip(),
        encoding='utf-8',
    )

    errors = []
    behaviors = parse_behavior_folder(str(tmp_path), str(tmp_path), True, 'utf-8', errors=errors)

    assert [behavior.name for behavior in behaviors] == ['Valid Behavior']
    assert len(errors) == 1
    assert "Skipped behavior 'invalid_behavior'" in errors[0]
    assert "missing required 'min'/'max' metadata" in errors[0]


def test_parse_behavior_folder_follows_symlinks_without_cycles(tmp_path):
    """Folder parsing should follow symlink-install paths without recursing forever."""
    valid_manifest = tmp_path / 'valid_behavior.xml'
    valid_code = tmp_path / 'valid_behavior_sm.py'

    valid_manifest.write_text(
        """
<behavior name="Valid Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-04-04</date>
    <executable package_path="test_pkg.valid_behavior_sm" class="ValidBehaviorSM" />
</behavior>
""".strip(),
        encoding='utf-8',
    )
    valid_code.write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class ValidBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )
    try:
        (tmp_path / 'loop').symlink_to(tmp_path, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f'Symlink creation unavailable: {exc}')

    errors = []
    behaviors = parse_behavior_folder(str(tmp_path), str(tmp_path), True, 'utf-8', errors=errors)

    assert [behavior.name for behavior in behaviors] == ['Valid Behavior']
    assert errors == []
