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

"""Tests for behavior code generation result handling."""

import argparse
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import BehaviorCodeGeneratorRequest
from flexbe_webui.io.code_generator import CodeGenerator
from flexbe_webui.ros import PackageData
from flexbe_webui.webui_server import WebuiServer

import pytest

from starlette.requests import Request
from starlette.responses import Response


class _DummyCodeGenerator:
    """Minimal code generator stub for endpoint-focused tests."""

    def __init__(self, *args, **kwargs):
        """Accept the production constructor signature."""

    def set_explicit_package(self, _explicit_package):
        """Ignore explicit package toggles in tests."""

    def generate_behavior_code(self, _behavior, _license_text):
        """Return syntactically valid Python code."""
        return 'class Dummy:\n    pass\n'


@pytest.fixture
def server_with_package(tmp_path, monkeypatch):
    """Create a server with one editable package rooted in tmp_path/pkg."""
    monkeypatch.delenv('FLEXBE_WEBUI_API_TOKEN', raising=False)

    package_root = tmp_path / 'pkg'
    package_root.mkdir()
    manifest_dir = tmp_path / 'lib' / 'test_pkg' / 'manifest'
    manifest_dir.mkdir(parents=True)

    args = argparse.Namespace(
        config_folder=str(tmp_path),
        config_file='',
        clear_cache=True,
    )
    server = WebuiServer(args)
    server._packages = {
        'test_pkg': PackageData(
            name='test_pkg',
            path=str(tmp_path),
            python_path=str(package_root),
            editable=True,
        )
    }
    return server


@pytest.fixture
def valid_behavior_request():
    """Build a minimal valid behavior code-generation request."""
    return BehaviorCodeGeneratorRequest(
        ws='    ',
        package_name='test_pkg',
        file_name='demo_behavior.py',
        save_as=True,
        explicit_package=False,
        behavior_names=[],
        behavior={
            'behavior_name': 'Demo Behavior',
            'behavior_package': 'test_pkg',
            'behavior_description': 'desc',
            'tags': '',
            'author': 'tester',
            'creation_date': '2026-03-06',
            'private_variables': [],
            'default_userdata': [],
            'private_functions': [],
            'behavior_parameters': [],
            'interface_outcomes': [],
            'interface_input_keys': [],
            'interface_output_keys': [],
            'comment_notes': [],
            'root_sm': {
                'state_name': 'root',
                'state_class': ':STATEMACHINE',
                'state_import': '',
                'state_pkg': 'test_pkg',
                'state_path': '',
                'parameters': [],
                'parameter_values': [],
                'outcomes': [],
                'autonomy': [],
                'meta_outcomes': [],
                'outcomes_unc': [],
                'outcomes_con': [],
                'input_keys': [],
                'output_keys': [],
                'meta_input': [],
                'meta_output': [],
                'input_mapping': [],
                'output_mapping': [],
                'position_x': 0,
                'position_y': 0,
                'behavior_state': False,
                'state_machine': True,
                'states': [],
                'transitions': [],
                'dataflow': [],
                'sm_outcomes': [],
            },
            'readonly': False,
            'manual_code_import': [],
            'manual_code_init': '',
            'manual_code_create': '',
            'manual_code_func': '',
        },
    )


def _find_endpoint(app, path, method):
    """Return endpoint function for path and HTTP method."""
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path == path and method in route.methods:
            return route.endpoint
    raise AssertionError(f'No endpoint for {method} {path}')


def _build_request(path, method='POST', headers=None):
    """Construct a minimal Starlette request object."""
    header_items = []
    for key, value in (headers or {}).items():
        header_items.append((key.lower().encode('utf-8'), value.encode('utf-8')))

    scope = {
        'type': 'http',
        'http_version': '1.1',
        'method': method,
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode('utf-8'),
        'query_string': b'',
        'headers': header_items,
        'client': ('testclient', 12345),
        'server': ('localhost', 8000),
    }
    return Request(scope)


def _decode_response(result):
    """Return decoded JSON payload from either a Response or plain object."""
    if isinstance(result, Response):
        return json.loads(result.body.decode('utf-8'))
    return result


@pytest.fixture
def code_generator_endpoint(server_with_package):
    """Return the behavior code generator endpoint for the test server."""
    return _find_endpoint(server_with_package._app, '/api/v1/behavior/code_generator', 'POST')


def test_behavior_code_generator_reports_install_and_source_success(
    server_with_package, valid_behavior_request, code_generator_endpoint, monkeypatch, tmp_path
):
    """Code generation should report both install and source saves when both succeed."""
    source_root = tmp_path / 'srcroot'
    package_folder = source_root / 'workspace' / 'test_pkg'
    (package_folder / 'manifest').mkdir(parents=True)
    (package_folder / 'test_pkg').mkdir(parents=True)

    server_with_package._settings['save_in_source'] = True
    server_with_package._settings['source_code_root'] = str(source_root)

    monkeypatch.setattr('flexbe_webui.webui_server.CodeGenerator', _DummyCodeGenerator)
    monkeypatch.setattr('flexbe_webui.webui_server.validate_path_consistency', lambda *_args: True)

    result = _decode_response(asyncio.run(code_generator_endpoint(
        request=_build_request('/api/v1/behavior/code_generator'),
        json_dict=valid_behavior_request,
    )))

    assert result['success'] is True
    assert result['data']['install_success'] is True
    assert result['data']['src_save_success'] is True
    assert result['data']['error_msg'] == ''
    assert result['data']['src_error_msg'] == ''


def test_behavior_code_generator_reports_source_save_failure_after_install_success(
    server_with_package, valid_behavior_request, code_generator_endpoint, monkeypatch, tmp_path
):
    """Source save failure should preserve install success and expose source error details."""
    source_root = tmp_path / 'srcroot'
    source_root.mkdir()

    server_with_package._settings['save_in_source'] = True
    server_with_package._settings['source_code_root'] = str(source_root)

    monkeypatch.setattr('flexbe_webui.webui_server.CodeGenerator', _DummyCodeGenerator)
    monkeypatch.setattr('flexbe_webui.webui_server.validate_path_consistency', lambda *_args: True)

    result = _decode_response(asyncio.run(code_generator_endpoint(
        request=_build_request('/api/v1/behavior/code_generator'),
        json_dict=valid_behavior_request,
    )))

    assert result['success'] is True
    assert result['data']['install_success'] is True
    assert result['data']['src_save_success'] is False
    assert "Failed to find source code package 'test_pkg'" in result['data']['src_error_msg']


def test_behavior_code_generator_reports_behavior_extraction_failure(
    server_with_package, code_generator_endpoint
):
    """Malformed behavior payloads should be reported as handled extraction failures."""
    result = _decode_response(asyncio.run(code_generator_endpoint(
        request=_build_request('/api/v1/behavior/code_generator'),
        json_dict=BehaviorCodeGeneratorRequest(
            ws='    ',
            package_name='test_pkg',
            file_name='demo_behavior.py',
            save_as=True,
            explicit_package=False,
            behavior_names=[],
            behavior={},
        ),
    )))

    assert result['success'] is True
    assert result['data']['install_success'] is False
    assert result['data']['error_msg'] == 'Failed to extract behavior'


def test_behavior_code_generator_reports_inconsistent_package_paths(
    server_with_package, valid_behavior_request, code_generator_endpoint, monkeypatch
):
    """Inconsistent manifest and code paths should be reported without crashing."""
    monkeypatch.setattr('flexbe_webui.webui_server.CodeGenerator', _DummyCodeGenerator)
    monkeypatch.setattr('flexbe_webui.webui_server.validate_path_consistency', lambda *_args: False)

    result = _decode_response(asyncio.run(code_generator_endpoint(
        request=_build_request('/api/v1/behavior/code_generator'),
        json_dict=valid_behavior_request,
    )))

    assert result['success'] is True
    assert result['data']['install_success'] is False
    assert 'Inconsistent paths!' in result['data']['error_msg']


def test_behavior_code_generator_preserves_nested_relative_file_paths(
    server_with_package, valid_behavior_request, code_generator_endpoint, monkeypatch
):
    """Saving an existing nested behavior should keep both code and manifest module paths nested."""
    nested_dir = Path(server_with_package.packages['test_pkg'].python_path) / 'nested'
    nested_dir.mkdir()
    manifest_path = Path(server_with_package.packages['test_pkg'].path) / 'lib' / 'test_pkg' / 'manifest' / 'demo_behavior.xml'

    request_payload = valid_behavior_request.copy(deep=True)
    request_payload.save_as = False
    request_payload.file_name = 'nested/demo_behavior'
    request_payload.behavior['file_name'] = 'nested/demo_behavior'
    request_payload.behavior['manifest_path'] = str(manifest_path)

    server_with_package._settings['save_in_source'] = False
    monkeypatch.setattr('flexbe_webui.webui_server.CodeGenerator', _DummyCodeGenerator)
    monkeypatch.setattr('flexbe_webui.webui_server.validate_path_consistency', lambda *_args: True)

    result = _decode_response(asyncio.run(code_generator_endpoint(
        request=_build_request('/api/v1/behavior/code_generator'),
        json_dict=request_payload,
    )))

    assert result['success'] is True
    assert result['data']['install_success'] is True
    assert result['data']['python_file_name'] == 'nested/demo_behavior'
    assert (nested_dir / 'demo_behavior.py').exists()
    manifest_text = manifest_path.read_text(encoding='utf-8')
    assert 'package_path="test_pkg.nested.demo_behavior"' in manifest_text


def test_io_behavior_full_accepts_nested_relative_paths(server_with_package):
    """Full behavior fetch should use the relative module path, not just the basename."""
    package_root = Path(server_with_package.packages['test_pkg'].python_path)
    nested_dir = package_root / 'nested'
    nested_dir.mkdir()
    manifest_path = Path(server_with_package.packages['test_pkg'].path) / 'lib' / 'test_pkg' / 'manifest' / 'demo_behavior.xml'
    manifest_path.write_text(
        """
<behavior name="Demo Behavior">
    <description>demo</description>
    <tagstring>tag</tagstring>
    <author>tester</author>
    <date>2026-03-30</date>
    <executable package_path="test_pkg.nested.demo_behavior" class="DemoBehaviorSM" />
</behavior>
""".strip(),
        encoding='utf-8',
    )
    (nested_dir / 'demo_behavior.py').write_text(
        """
from flexbe_core import Behavior, OperatableStateMachine


class DemoBehaviorSM(Behavior):
    def create(self):
        return OperatableStateMachine(outcomes=['done'])
""".strip(),
        encoding='utf-8',
    )

    endpoint = _find_endpoint(server_with_package._app, '/api/v1/io/behavior/{package_name}/{codefile_name:path}', 'GET')
    result = _decode_response(asyncio.run(endpoint(package_name='test_pkg', codefile_name='nested/demo_behavior')))

    assert result['success'] is True
    assert result['data']['codefile_relpath'] == 'nested/demo_behavior'
    assert 'class DemoBehaviorSM(Behavior):' in result['data']['codefile_content']


def test_code_generator_aliases_colliding_behavior_imports_and_references():
    """Behavior class collisions across packages should use package-qualified aliases."""
    generator = CodeGenerator()

    state_a = SimpleNamespace(
        state_name='Behavior A',
        state_path='/Behavior A',
        state_class='SharedSM',
        state_pkg='pkg_a',
        state_import='pkg_a.foo_sm',
        state_machine=False,
        behavior_state=True,
        position_x=0,
        position_y=0,
        parameters=[],
        parameter_values=[],
        input_keys=[],
        input_mapping=[],
        outcomes=[],
        autonomy=[],
        output_keys=[],
        output_mapping=[],
    )
    state_b = SimpleNamespace(
        state_name='Behavior B',
        state_path='/Behavior B',
        state_class='SharedSM',
        state_pkg='pkg_b',
        state_import='pkg_b.bar_sm',
        state_machine=False,
        behavior_state=True,
        position_x=100,
        position_y=50,
        parameters=[],
        parameter_values=[],
        input_keys=[],
        input_mapping=[],
        outcomes=[],
        autonomy=[],
        output_keys=[],
        output_mapping=[],
    )
    init_transition = SimpleNamespace(from_state_name='INIT', to_state_name='Behavior A')
    root_sm = SimpleNamespace(
        state_name='',
        state_path='',
        states=[state_a, state_b],
        transitions=[init_transition],
        sm_outcomes=[],
        outcomes=[],
        input_keys=[],
        output_keys=[],
        concurrent=False,
        priority=False,
        conditions={},
    )
    behavior = SimpleNamespace(
        behavior_name='Demo Behavior',
        behavior_description='desc',
        author='tester',
        creation_date='2026-03-30',
        manual_code_import=[],
        manual_code_init='',
        manual_code_create='',
        manual_code_func='',
        comment_notes=[],
        behavior_parameters=[],
        private_variables=[],
        interface_input_keys=[],
        interface_output_keys=[],
        default_userdata=[],
        root_sm=root_sm,
    )

    code = generator.generate_behavior_code(behavior, 'dummy license\n')

    assert 'from pkg_a.foo_sm import SharedSM as pkg_a__SharedSM' in code
    assert 'from pkg_b.bar_sm import SharedSM as pkg_b__SharedSM' in code
    assert "self.use_behavior(pkg_a__SharedSM, 'Behavior A')" in code
    assert "self.use_behavior(pkg_b__SharedSM, 'Behavior B')" in code


def test_code_generator_encodes_multi_copy_outcome_comment_names():
    """Outcome copy metadata comments should encode names that are not identifier-safe."""
    generator = CodeGenerator()

    simple_state = SimpleNamespace(
        state_name='Alpha State',
        state_path='/Alpha State',
        state_class='SomeState',
        state_pkg='pkg_a',
        state_import='pkg_a.some_state',
        state_machine=False,
        behavior_state=False,
        position_x=0,
        position_y=0,
        parameters=[],
        parameter_values=[],
        input_keys=[],
        input_mapping=[],
        outcomes=['go now'],
        autonomy=[0],
        output_keys=[],
        output_mapping=[],
    )
    root_sm = SimpleNamespace(
        state_name='Container',
        state_path='/Container',
        states=[simple_state],
        transitions=[
            SimpleNamespace(from_state_name='INIT', to_state_name='Alpha State', to_state_class='pkg_a.SomeState'),
            SimpleNamespace(
                from_state_name='Alpha State',
                to_state_name='task done#1',
                to_state_class=':OUTCOME',
                outcome='go now',
                x=None,
                y=None,
                beg_x=None,
                beg_y=None,
                end_x=None,
                end_y=None,
            ),
        ],
        sm_outcomes=[
            SimpleNamespace(state_name='task done', position_x=10, position_y=20),
            SimpleNamespace(state_name='task done#1', position_x=30, position_y=40),
        ],
        outcomes=['task done'],
        input_keys=[],
        output_keys=[],
        concurrent=False,
        priority=False,
        conditions={},
    )

    code = generator.generate_state_machine(root_sm, True, [simple_state])

    assert '# task%20done:x:10 y:20, task%20done%231:x:30 y:40' in code
    assert '# route: Alpha%20State>go%20now --> task%20done%231' in code


def test_code_generator_keeps_root_outcome_copies_out_of_interface_outcomes():
    """Root copied outcomes should stay in metadata comments, not real behavior outcomes."""
    generator = CodeGenerator()

    simple_state = SimpleNamespace(
        state_name='Alpha State',
        state_path='/Alpha State',
        state_class='SomeState',
        state_pkg='pkg_a',
        state_import='pkg_a.some_state',
        state_machine=False,
        behavior_state=False,
        position_x=0,
        position_y=0,
        parameters=[],
        parameter_values=[],
        input_keys=[],
        input_mapping=[],
        outcomes=['go now'],
        autonomy=[0],
        output_keys=[],
        output_mapping=[],
    )
    root_sm = SimpleNamespace(
        state_name='',
        state_path='',
        states=[simple_state],
        transitions=[
            SimpleNamespace(from_state_name='INIT', to_state_name='Alpha State', to_state_class='pkg_a.SomeState'),
            SimpleNamespace(
                from_state_name='Alpha State',
                to_state_name='finished#1',
                to_state_class=':OUTCOME',
                outcome='go now',
                x=None,
                y=None,
                beg_x=None,
                beg_y=None,
                end_x=None,
                end_y=None,
            ),
        ],
        sm_outcomes=[
            SimpleNamespace(state_name='finished', position_x=10, position_y=20),
            SimpleNamespace(state_name='finished#1', position_x=30, position_y=40),
        ],
        outcomes=['finished'],
        input_keys=[],
        output_keys=[],
        concurrent=False,
        priority=False,
        conditions={},
    )
    behavior = SimpleNamespace(
        behavior_name='Demo Behavior',
        behavior_description='desc',
        author='tester',
        creation_date='2026-03-31',
        manual_code_import=[],
        manual_code_init='',
        manual_code_create='',
        manual_code_func='',
        comment_notes=[],
        behavior_parameters=[],
        private_variables=[],
        interface_input_keys=[],
        interface_output_keys=[],
        default_userdata=[],
        root_sm=root_sm,
    )

    code = generator.generate_behavior_code(behavior, 'dummy license\n')

    assert '# finished:x:10 y:20, finished%231:x:30 y:40' in code
    assert '# route: Alpha%20State>go%20now --> finished%231' in code
    assert '_state_machine = OperatableStateMachine(outcomes=' + repr(['finished']) + ')' in code
    assert 'finished#1' not in code.split('_state_machine = OperatableStateMachine(', 1)[1].split(')\n', 1)[0]
