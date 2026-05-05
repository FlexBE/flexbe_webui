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

"""Tests for explicit command endpoint payload shapes."""

import argparse
import asyncio
import json
import os
from pathlib import Path

from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import (ActionClientRequest, BehaviorCodeGeneratorRequest,
                                         ClosePublisherRequest, CreatePublisherRequest,
                                         ManifestGeneratorRequest, OpenFileEditorRequest,
                                         PublishRequest, SendActionGoalRequest)
from flexbe_webui.ros import PackageData
from flexbe_webui.webui_server import WebuiServer

from pydantic import ValidationError

import pytest

from starlette.requests import Request
from starlette.responses import Response


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


def _valid_behavior_dict(manifest_path=None):
    """Build a minimal valid behavior payload."""
    behavior_dict = {
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
    }
    if manifest_path is not None:
        behavior_dict['manifest_path'] = str(manifest_path)
    return behavior_dict


@pytest.fixture
def server_with_package(tmp_path, monkeypatch):
    """Create a server with one editable package rooted in tmp_path/pkg."""
    monkeypatch.delenv('FLEXBE_WEBUI_API_TOKEN', raising=False)

    package_root = tmp_path / 'pkg'
    package_root.mkdir()
    (package_root / 'inside.py').write_text('print("inside")\n', encoding='utf-8')
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


def test_save_package_cache_supports_pydantic_v1_models(server_with_package, tmp_path):
    """Package cache saving should support the Pydantic v1 model API used by ROS distros."""
    server_with_package.save_package_cache()

    cache_path = tmp_path / 'flexbe_packages.cache'
    cached_packages = json.loads(cache_path.read_text(encoding='utf-8'))

    assert cached_packages['test_pkg']['name'] == 'test_pkg'
    assert cached_packages['test_pkg']['python_path'] == str(tmp_path / 'pkg')


def test_save_config_settings_returns_data_ok_on_success(server_with_package):
    """Saving configuration should return explicit command success."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/save_config_settings', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/save_config_settings'),
        json_dict={'configuration': server_with_package._settings.copy()},
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True


def test_save_config_settings_returns_data_ok_on_failure(server_with_package):
    """Saving configuration failure should return explicit command failure."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/save_config_settings', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/save_config_settings'),
        json_dict={},
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_save_config_settings_failed_file_save_preserves_live_settings(server_with_package, tmp_path):
    """A failed config file save should not mutate the server's active settings."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/save_config_settings', 'POST')
    original_settings = server_with_package._settings.copy()
    outside_file = tmp_path.parent / f'{tmp_path.name}_outside.json'

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/save_config_settings'),
        json_dict={
            'configuration': {'editor_command': 'vim $FILE'},
            'folder_path': str(outside_file.parent),
            'file_name': outside_file.name,
        },
    )))

    assert result['success'] is False
    assert 'outside the config folder' in result['error']
    assert server_with_package._settings == original_settings
    assert not outside_file.exists()


def test_open_file_editor_returns_data_ok_on_success(server_with_package, monkeypatch):
    """Editor open success should return explicit command success."""
    server_with_package._settings['editor_command'] = 'gedit $FILE'
    server_with_package._settings['allow_editors'] = ['gedit']
    monkeypatch.setattr('flexbe_webui.webui_server.shutil.which', lambda _cmd: '/usr/bin/gedit')

    popen_calls = []

    class _DummyProcess:
        pass

    def _fake_popen(*args, **kwargs):
        popen_calls.append({'args': args, 'kwargs': kwargs})
        return _DummyProcess()

    monkeypatch.setattr('flexbe_webui.webui_server.Popen', _fake_popen)

    endpoint = _find_endpoint(server_with_package._app, '/api/v1/open_file_editor', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/open_file_editor'),
        json_file_dict=OpenFileEditorRequest(package='test_pkg', file='inside.py', line='1'),
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True
    assert len(popen_calls) == 1
    expected_file = f"{server_with_package.packages['test_pkg'].python_path}/inside.py"
    assert popen_calls[0]['args'][0] == ['gedit', expected_file]
    assert popen_calls[0]['kwargs']['start_new_session'] is True


def test_open_file_editor_returns_data_ok_on_failure(server_with_package):
    """Editor open failure should return explicit command failure."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/open_file_editor', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/open_file_editor'),
        json_file_dict=OpenFileEditorRequest(package='test_pkg', file='../outside.py', line='1'),
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_manifest_generator_returns_data_ok_on_success(server_with_package):
    """Manifest generation success should return explicit command success."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/behavior/manifest_generator', 'POST')
    server_with_package._behaviors_cache['test_pkg'] = ['stale']

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/behavior/manifest_generator'),
        json_manifest_dict=ManifestGeneratorRequest(behavior=_valid_behavior_dict(), behavior_names=[]),
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True
    assert 'test_pkg' not in server_with_package._behaviors_cache


def test_manifest_generator_uses_existing_manifest_root_for_new_manifest(server_with_package):
    """Manifest generation should choose an existing share manifest root for new manifests."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/behavior/manifest_generator', 'POST')
    lib_manifest_dir = Path(server_with_package.packages['test_pkg'].path) / 'lib' / 'test_pkg' / 'manifest'
    share_manifest_dir = Path(server_with_package.packages['test_pkg'].path) / 'share' / 'test_pkg' / 'manifest'
    lib_manifest_dir.rmdir()
    share_manifest_dir.mkdir(parents=True)

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/behavior/manifest_generator'),
        json_manifest_dict=ManifestGeneratorRequest(behavior=_valid_behavior_dict(), behavior_names=[]),
    )))

    assert result['success'] is True
    assert result['data']['ok'] is True
    assert (share_manifest_dir / 'demo_behavior.xml').exists()


def test_manifest_generator_rejects_manifest_path_outside_manifest_root(server_with_package, tmp_path):
    """Manifest generation must not write XML outside accepted manifest roots."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/behavior/manifest_generator', 'POST')
    outside_manifest = tmp_path / 'outside.xml'

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/behavior/manifest_generator'),
        json_manifest_dict=ManifestGeneratorRequest(
            behavior=_valid_behavior_dict(manifest_path=outside_manifest),
            behavior_names=[],
        ),
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False
    assert 'outside package manifest path' in result['error']
    assert not outside_manifest.exists()


def test_manifest_generator_returns_data_ok_on_failure(server_with_package):
    """Manifest generation failure should return explicit command failure."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/behavior/manifest_generator', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/behavior/manifest_generator'),
        json_manifest_dict=ManifestGeneratorRequest(behavior={}, behavior_names=[]),
    )))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_generator_requests_reject_non_whitespace_indentation():
    """Generated-source indentation should not accept executable content."""
    with pytest.raises(ValidationError):
        BehaviorCodeGeneratorRequest(
            ws="\n__import__('os').system('cmd')\n    ",
            package_name='test_pkg',
            file_name='demo_behavior.py',
            explicit_package=False,
            behavior_names=[],
            behavior={},
        )

    with pytest.raises(ValidationError):
        ManifestGeneratorRequest(
            ws='    # injected',
            behavior_names=[],
            behavior={},
        )


def test_create_publisher_request_rejects_invalid_topic():
    """Publisher creation should reject malformed ROS topic strings."""
    with pytest.raises(ValidationError):
        CreatePublisherRequest(topic='../demo', msg_type='demo_msgs/Demo', latched=False)


def test_ros_command_requests_reject_invalid_topics():
    """ROS command request models should consistently reject malformed topic strings."""
    invalid_topic = '../demo'
    with pytest.raises(ValidationError):
        PublishRequest(topic=invalid_topic, req={})
    with pytest.raises(ValidationError):
        ClosePublisherRequest(topic=invalid_topic)
    with pytest.raises(ValidationError):
        ActionClientRequest(topic=invalid_topic, action_type='demo_msgs/Demo')
    with pytest.raises(ValidationError):
        SendActionGoalRequest(topic=invalid_topic, goal={})


@pytest.mark.skipif(not hasattr(os, 'symlink'), reason='symlink support required')
def test_config_save_rejects_symlink_escape(server_with_package, tmp_path):
    """Configuration saves must not follow symlinks outside the config folder."""
    outside_file = tmp_path.parent / f'{tmp_path.name}_outside.json'
    symlink_path = tmp_path / 'linked_config.json'
    symlink_path.symlink_to(outside_file)

    endpoint = _find_endpoint(server_with_package._app, '/api/v1/save_config_settings', 'POST')
    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/save_config_settings'),
        json_dict={
            'configuration': server_with_package._settings.copy(),
            'folder_path': str(tmp_path),
            'file_name': symlink_path.name,
        },
    )))

    assert result['success'] is False
    assert 'outside the config folder' in result['error']
    assert not outside_file.exists()


@pytest.mark.skipif(not hasattr(os, 'symlink'), reason='symlink support required')
def test_python_write_resolver_rejects_symlink_escape(server_with_package, tmp_path):
    """Behavior code writes must not follow package-root symlinks outside the package."""
    outside_file = tmp_path.parent / f'{tmp_path.name}_outside.py'
    symlink_path = tmp_path / 'pkg' / 'linked_behavior.py'
    symlink_path.symlink_to(outside_file)
    server_with_package.packages['test_pkg'].editable = False

    with pytest.raises(ValueError, match='outside package Python path'):
        server_with_package._resolve_package_python_write_file(
            'test_pkg',
            server_with_package.packages['test_pkg'],
            'linked_behavior.py',
        )

    assert not outside_file.exists()


def test_python_write_resolver_allows_new_file_inside_python_root(server_with_package):
    """Behavior code writes should allow creating a new file directly under the package root."""
    file_path, relative_name = server_with_package._resolve_package_python_write_file(
        'test_pkg',
        server_with_package.packages['test_pkg'],
        'new_behavior.py',
    )

    assert file_path.endswith(os.path.join('pkg', 'new_behavior.py'))
    assert relative_name == 'new_behavior.py'


@pytest.mark.skipif(not hasattr(os, 'symlink'), reason='symlink support required')
def test_python_write_resolver_allows_editable_existing_symlink_install_file(server_with_package, tmp_path):
    """Editable package writes may overwrite files exposed through symlink-install."""
    source_file = tmp_path / 'source_behavior.py'
    source_file.write_text('print("source")\n', encoding='utf-8')
    symlink_path = tmp_path / 'pkg' / 'linked_behavior.py'
    symlink_path.symlink_to(source_file)

    file_path, relative_name = server_with_package._resolve_package_python_write_file(
        'test_pkg',
        server_with_package.packages['test_pkg'],
        'linked_behavior.py',
    )

    assert file_path == str(symlink_path)
    assert relative_name == 'linked_behavior.py'


@pytest.mark.skipif(not hasattr(os, 'symlink'), reason='symlink support required')
def test_python_write_resolver_rejects_new_file_under_symlink_escape(server_with_package, tmp_path):
    """Behavior code writes must not create new files through package-root symlinked folders."""
    outside_dir = tmp_path.parent / f'{tmp_path.name}_outside_dir'
    outside_dir.mkdir()
    symlink_dir = tmp_path / 'pkg' / 'linked_folder'
    symlink_dir.symlink_to(outside_dir, target_is_directory=True)

    with pytest.raises(ValueError, match='outside package Python path'):
        server_with_package._resolve_package_python_write_file(
            'test_pkg',
            server_with_package.packages['test_pkg'],
            'linked_folder/new_behavior.py',
        )

    assert not (outside_dir / 'new_behavior.py').exists()


def test_manifest_write_resolver_uses_existing_manifest_root_for_new_file(server_with_package):
    """Save As manifest writes should use an existing accepted manifest root."""
    lib_manifest_dir = Path(server_with_package.packages['test_pkg'].path) / 'lib' / 'test_pkg' / 'manifest'
    share_manifest_dir = Path(server_with_package.packages['test_pkg'].path) / 'share' / 'test_pkg' / 'manifest'
    lib_manifest_dir.rmdir()
    share_manifest_dir.mkdir(parents=True)

    manifest_path = server_with_package._resolve_package_manifest_write_file(
        'test_pkg',
        server_with_package.packages['test_pkg'],
        'new_behavior.xml',
    )

    assert manifest_path == str(share_manifest_dir / 'new_behavior.xml')


@pytest.mark.skipif(not hasattr(os, 'symlink'), reason='symlink support required')
def test_manifest_write_resolver_rejects_symlink_escape(server_with_package, tmp_path):
    """Manifest writes must not follow manifest-root symlinks outside the package."""
    outside_file = tmp_path.parent / f'{tmp_path.name}_outside.xml'
    manifest_dir = tmp_path / 'lib' / 'test_pkg' / 'manifest'
    symlink_path = manifest_dir / 'linked_manifest.xml'
    symlink_path.symlink_to(outside_file)
    server_with_package.packages['test_pkg'].editable = False

    with pytest.raises(ValueError, match='outside package manifest path'):
        server_with_package._resolve_package_manifest_write_file(
            'test_pkg',
            server_with_package.packages['test_pkg'],
            'linked_manifest.xml',
        )

    assert not outside_file.exists()
