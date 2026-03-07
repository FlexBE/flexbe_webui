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

"""API-level security regression tests."""

import argparse
import asyncio
import json

from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import FileRequest, OpenFileEditorRequest
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


async def _request_app_json(app, path, method='POST', json_body=None, headers=None):
    """Execute an ASGI request directly against the app and decode the JSON response."""
    body = b''
    header_items = []
    if json_body is not None:
        body = json.dumps(json_body).encode('utf-8')
        header_items.append((b'content-type', b'application/json'))
        header_items.append((b'content-length', str(len(body)).encode('utf-8')))

    for key, value in (headers or {}).items():
        header_items.append((key.lower().encode('utf-8'), value.encode('utf-8')))

    scope = {
        'type': 'http',
        'asgi': {'version': '3.0'},
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

    messages = [{'type': 'http.request', 'body': body, 'more_body': False}]
    response = {'status': None, 'body': b''}

    async def receive():
        if messages:
            return messages.pop(0)
        return {'type': 'http.disconnect'}

    async def send(message):
        if message['type'] == 'http.response.start':
            response['status'] = message['status']
        elif message['type'] == 'http.response.body':
            response['body'] += message.get('body', b'')

    await app(scope, receive, send)
    return response['status'], json.loads(response['body'].decode('utf-8'))


@pytest.fixture
def server_with_package(tmp_path, monkeypatch):
    """Create a WebuiServer with one editable package rooted in tmp_path/pkg."""
    monkeypatch.delenv('FLEXBE_WEBUI_API_TOKEN', raising=False)

    package_root = tmp_path / 'pkg'
    package_root.mkdir()
    (package_root / 'inside.py').write_text('print("inside")\n', encoding='utf-8')
    (tmp_path / 'outside.py').write_text('print("outside")\n', encoding='utf-8')

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
def token_protected_server(tmp_path, monkeypatch):
    """Create a server with token auth enabled and one editable package."""
    monkeypatch.setenv('FLEXBE_WEBUI_API_TOKEN', 'secret-token')

    package_root = tmp_path / 'pkg'
    package_root.mkdir()
    (package_root / 'inside.py').write_text('print(\"inside\")\n', encoding='utf-8')

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


def test_view_file_source_enforces_package_path_boundary(server_with_package):
    """Reject file paths that escape the package Python root."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/view_file_source', 'POST')

    result = _decode_response(asyncio.run(endpoint(json_file_dict=FileRequest(package='test_pkg', file='../outside.py'))))

    assert result['success'] is False
    assert result['data']['text']
    assert 'outside package Python path' in result['error']


def test_open_file_editor_enforces_package_path_boundary(server_with_package):
    """Reject editor open requests that escape the package Python root."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/open_file_editor', 'POST')
    request = _build_request('/api/v1/open_file_editor')

    result = _decode_response(asyncio.run(
        endpoint(
            request=request,
            json_file_dict=OpenFileEditorRequest(package='test_pkg', file='../outside.py', line='1'),
        )
    ))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_open_file_editor_enforces_editor_allowlist(server_with_package):
    """Reject configured editor executables not present in allow_editors."""
    server_with_package._settings['editor_command'] = 'vim $FILE +$LINE'
    server_with_package._settings['allow_editors'] = ['gedit']

    endpoint = _find_endpoint(server_with_package._app, '/api/v1/open_file_editor', 'POST')
    request = _build_request('/api/v1/open_file_editor')
    result = _decode_response(asyncio.run(
        endpoint(
            request=request,
            json_file_dict=OpenFileEditorRequest(package='test_pkg', file='inside.py', line='1'),
        )
    ))

    assert result['success'] is False
    assert result['data']['ok'] is False


def test_view_file_source_handles_malformed_payload(server_with_package):
    """Malformed payloads are rejected by request-model validation."""
    with pytest.raises(ValidationError):
        FileRequest.parse_obj([])


def test_open_file_editor_handles_malformed_payload(server_with_package):
    """Malformed payloads are rejected by request-model validation."""
    with pytest.raises(ValidationError):
        OpenFileEditorRequest.parse_obj([])


@pytest.mark.parametrize(
    ('path', 'body'),
    [
        ('/api/v1/save_config_settings', {'configuration': {'pkg_cache_enabled': True}}),
        ('/api/v1/open_file_editor', {'package': 'test_pkg', 'file': 'inside.py', 'line': '1'}),
        (
            '/api/v1/behavior/code_generator',
            {
                'ws': '    ',
                'package_name': 'test_pkg',
                'file_name': 'demo_behavior.py',
                'save_as': True,
                'explicit_package': False,
                'behavior_names': [],
                'behavior': {},
            },
        ),
    ],
)
def test_protected_mutation_routes_return_normalized_unauthorized_envelope(token_protected_server, path, body):
    """Protected mutation routes should return a normalized unauthorized API envelope."""
    status, result = asyncio.run(_request_app_json(token_protected_server._app, path, json_body=body))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'
    assert 'data' in result
