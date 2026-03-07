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

from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import BehaviorCodeGeneratorRequest
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
