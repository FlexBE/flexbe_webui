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
import os

from fastapi import FastAPI
from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import FileRequest, OpenFileEditorRequest
from flexbe_webui.ros import PackageData
from flexbe_webui.webui_node import WebuiNode
from flexbe_webui.webui_server import WebuiServer


from pydantic import ValidationError

import pytest

from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import WebSocketRoute


def _find_endpoint(app, path, method):
    """Return endpoint function for path and HTTP method."""
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path == path and method in route.methods:
            return route.endpoint
    raise AssertionError(f'No endpoint for {method} {path}')


def _find_websocket_endpoint(app, path):
    """Return websocket endpoint function for a path."""
    for route in app.routes:
        if isinstance(route, WebSocketRoute) and route.path == path:
            return route.endpoint
    raise AssertionError(f'No websocket endpoint for {path}')


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


class _FakeWebsocket:
    """Minimal websocket object for websocket authorization tests."""

    def __init__(self, headers=None, query_params=None):
        """Initialize headers/query params and capture close calls."""
        self.headers = headers or {}
        self.query_params = query_params or {}
        self.closed_code = None
        self.closed_reason = None

    async def close(self, code=1000, reason=None):
        """Capture close data from authorize_websocket."""
        self.closed_code = code
        self.closed_reason = reason


class _ShutdownWebsocket:
    """Minimal active shutdown websocket for broadcast tests."""

    def __init__(self, fail=False):
        """Initialize sent message capture and optional failure mode."""
        self.fail = fail
        self.messages = []

    async def send_text(self, message):
        """Capture or reject a shutdown message."""
        if self.fail:
            raise RuntimeError('stale websocket')
        self.messages.append(message)


async def _request_app_json(app, path, method='POST', json_body=None, headers=None,
                            client=('testclient', 12345)):
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
        'client': client,
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

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/view_file_source'),
        json_file_dict=FileRequest(package='test_pkg', file='../outside.py'),
    )))

    assert result['success'] is False
    assert result['data']['text']
    assert 'outside package Python path' in result['error']


def test_view_file_source_returns_package_relative_path(server_with_package):
    """Source viewer responses should not expose absolute server paths."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/view_file_source', 'POST')

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/view_file_source'),
        json_file_dict=FileRequest(package='test_pkg', file='inside.py'),
    )))

    assert result['success'] is True
    assert result['data']['file_path'] == 'inside.py'
    assert not os.path.isabs(result['data']['file_path'])


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


def test_view_file_source_requires_token_when_auth_enabled(token_protected_server):
    """Full source viewing should be protected by token auth when enabled."""
    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/view_file_source',
        json_body={'package': 'test_pkg', 'file': 'inside.py'},
    ))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


def test_open_file_editor_handles_malformed_payload(server_with_package):
    """Malformed payloads are rejected by request-model validation."""
    with pytest.raises(ValidationError):
        OpenFileEditorRequest.parse_obj([])


def test_get_config_settings_reload_requires_token(token_protected_server, tmp_path):
    """Configuration reloads should be protected when token auth is enabled."""
    config_path = tmp_path / 'alternate.json'
    config_path.write_text(json.dumps({'pkg_cache_enabled': False}), encoding='utf-8')

    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/get_config_settings',
        json_body={'folder_path': str(tmp_path), 'file_name': config_path.name},
    ))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


def test_ui_connected_requires_token_when_auth_enabled(token_protected_server):
    """UI connection state should not be mutated by unauthenticated callers."""
    token_protected_server._shutdown_allowed = True

    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/ui_connected',
        json_body={},
    ))

    assert status == 401
    assert result['success'] is False
    assert token_protected_server._shutdown_allowed is True


def test_ui_connected_marks_shutdown_confirmation_required(token_protected_server):
    """Authenticated UI connections should require shutdown confirmation."""
    token_protected_server._shutdown_allowed = True

    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/ui_connected',
        json_body={},
        headers={'x-api-token': 'secret-token'},
    ))

    assert status == 200
    assert result['success'] is True
    assert result['data']['ok'] is True
    assert token_protected_server._shutdown_allowed is False


def test_ui_connected_returns_command_failure_for_runtime_error(server_with_package):
    """UI connection endpoint should use a command envelope for non-auth runtime errors."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/ui_connected', 'POST')

    def fail_success():
        raise RuntimeError('connection bookkeeping failed')

    server_with_package.api_command_success = fail_success

    result = _decode_response(asyncio.run(endpoint(request=_build_request('/api/v1/ui_connected'))))

    assert result['success'] is False
    assert result['data']['ok'] is False
    assert 'connection bookkeeping failed' in result['error']


def test_get_config_settings_current_requires_token(token_protected_server):
    """The active configuration should not be exposed without auth when tokens are enabled."""
    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/get_config_settings',
        json_body=None,
    ))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


def test_get_config_settings_reload_rejects_paths_outside_config_folder(token_protected_server, tmp_path):
    """Authenticated configuration reloads should stay inside the configured folder."""
    outside_path = tmp_path.parent / f'{tmp_path.name}_outside.json'
    outside_path.write_text(json.dumps({'pkg_cache_enabled': False}), encoding='utf-8')

    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/get_config_settings',
        json_body={'folder_path': str(outside_path.parent), 'file_name': outside_path.name},
        headers={'x-api-token': 'secret-token'},
    ))

    assert status == 200
    assert result['success'] is False
    assert 'outside the config folder' in result['error']


@pytest.mark.parametrize(
    'path',
    [
        '/api/v1/get_config_files',
        '/api/v1/session/loaded_behavior',
        '/api/v1/packages/behaviors',
        '/api/v1/packages/states',
    ],
)
def test_metadata_read_routes_require_token_when_auth_enabled(token_protected_server, path):
    """Read endpoints that reveal local paths/settings should require token auth."""
    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        path,
        method='GET',
    ))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


def test_io_behaviors_requires_token_before_parsing(token_protected_server, monkeypatch):
    """Behavior-library parsing should not be reachable without auth when tokens are enabled."""
    def fail_parse_behavior_folder(*_args, **_kwargs):
        raise AssertionError('parse_behavior_folder should not be called')

    monkeypatch.setattr('flexbe_webui.webui_server.parse_behavior_folder', fail_parse_behavior_folder)

    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/io/behaviors/test_pkg',
        method='GET',
    ))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


def test_packages_behaviors_returns_failure_envelope_on_query_error(server_with_package, monkeypatch):
    """Behavior package listing should not fall through to an unhandled 500."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/packages/behaviors', 'GET')

    def fail_has_behaviors(_package):
        raise ValueError('behavior package scan failed')

    monkeypatch.setattr('flexbe_webui.webui_server.has_behaviors', fail_has_behaviors)

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/packages/behaviors', method='GET'),
    )))

    assert result['success'] is False
    assert 'behavior package scan failed' in result['error']


def test_packages_states_returns_failure_envelope_on_query_error(server_with_package, monkeypatch):
    """State package listing should not fall through to an unhandled 500."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/packages/states', 'GET')

    def fail_has_states(_package):
        raise ValueError('state package scan failed')

    monkeypatch.setattr('flexbe_webui.webui_server.has_states', fail_has_states)

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/packages/states', method='GET'),
    )))

    assert result['success'] is False
    assert 'state package scan failed' in result['error']


def test_websocket_auth_rejects_missing_token(token_protected_server):
    """Token-protected websocket routes should reject unauthenticated handshakes."""
    websocket = _FakeWebsocket()

    authorized = asyncio.run(token_protected_server.authorize_websocket(websocket))

    assert authorized is False
    assert websocket.closed_code == 1008
    assert websocket.closed_reason == 'Unauthorized'


def test_websocket_auth_accepts_bearer_token(token_protected_server):
    """Websocket auth should accept tokens supplied by request interceptors."""
    websocket = _FakeWebsocket(headers={'authorization': 'Bearer secret-token'})

    authorized = asyncio.run(token_protected_server.authorize_websocket(websocket))

    assert authorized is True
    assert websocket.closed_code is None


def test_websocket_auth_accepts_query_token(token_protected_server):
    """Websocket auth should support browser clients that cannot set custom headers."""
    websocket = _FakeWebsocket(query_params={'token': 'secret-token'})

    authorized = asyncio.run(token_protected_server.authorize_websocket(websocket))

    assert authorized is True
    assert websocket.closed_code is None


def test_shutdown_websocket_requires_token_when_auth_enabled(token_protected_server):
    """Shutdown notification websocket should be protected with token auth."""
    endpoint = _find_websocket_endpoint(token_protected_server._app, '/ws/check_shutdown')
    websocket = _FakeWebsocket()

    asyncio.run(endpoint(websocket))

    assert websocket.closed_code == 1008
    assert websocket.closed_reason == 'Unauthorized'
    assert token_protected_server._active_connections == []


def test_confirm_shutdown_continues_past_stale_websocket(server_with_package):
    """A stale shutdown websocket should not block delivery to remaining clients."""
    endpoint = _find_endpoint(server_with_package._app, '/api/v1/confirm_shutdown', 'POST')
    stale = _ShutdownWebsocket(fail=True)
    active = _ShutdownWebsocket()
    server_with_package._active_connections = [stale, active]

    result = _decode_response(asyncio.run(endpoint(
        request=_build_request('/api/v1/confirm_shutdown'),
        allow_shutdown=True,
    )))

    assert result['success'] is True
    assert result['data']['confirm'] is True
    assert active.messages == ['Shutdown is allowed.']
    assert stale not in server_with_package._active_connections
    assert active in server_with_package._active_connections


def test_io_states_requires_token_before_parsing(token_protected_server, monkeypatch):
    """State-library parsing should not be reachable without auth when tokens are enabled."""
    def fail_parse_state_folder(*_args, **_kwargs):
        raise AssertionError('parse_state_folder should not be called')

    monkeypatch.setattr('flexbe_webui.webui_server.parse_state_folder', fail_parse_state_folder)

    status, result = asyncio.run(_request_app_json(
        token_protected_server._app,
        '/api/v1/io/states/test_pkg',
        method='GET',
    ))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


@pytest.mark.parametrize(
    ('path', 'body'),
    [
        ('/api/v1/save_config_settings', {'configuration': {'pkg_cache_enabled': True}}),
        ('/api/v1/open_file_editor', {'package': 'test_pkg', 'file': 'inside.py', 'line': '1'}),
        (
            '/api/v1/statemachine/auto_layout',
            {
                'container_name': 'root',
                'states': [],
                'outcomes': [],
                'transitions': [],
            },
        ),
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


class _FakeWsBridge:
    """Minimal websocket-bridge stub for loopback-guard diagnostics tests."""

    def get_diagnostics_snapshot(self):
        """Return empty diagnostics snapshot."""
        return {}


@pytest.fixture
def node_stub_with_server(tmp_path):
    """Create a WebuiNode stub with a real WebuiServer wired in for loopback-guard tests."""
    args = argparse.Namespace(
        config_folder=str(tmp_path),
        config_file='',
        clear_cache=True,
    )
    server = WebuiServer(args)

    node = WebuiNode.__new__(WebuiNode)
    node._action_clients = {}
    node._pub_data = {}
    node._sub_data = {}
    node._running = True
    node._ws_bridge = _FakeWsBridge()
    node._server = server
    return node


def test_node_diagnostics_rejects_non_loopback(node_stub_with_server):
    """GET /api/v1/dev/diagnostics/node must reject non-loopback clients with 403."""
    app = FastAPI()
    node_stub_with_server.register(app)

    status, result = asyncio.run(
        _request_app_json(app, '/api/v1/dev/diagnostics/node', method='GET',
                          client=('10.0.0.1', 12345))
    )

    assert status == 403


def test_node_diagnostics_allows_loopback(node_stub_with_server):
    """GET /api/v1/dev/diagnostics/node succeeds from a loopback address."""
    app = FastAPI()
    node_stub_with_server.register(app)

    status, result = asyncio.run(
        _request_app_json(app, '/api/v1/dev/diagnostics/node', method='GET',
                          client=('127.0.0.1', 12345))
    )

    assert status == 200
    assert result['success'] is True


def test_node_diagnostics_rejects_unresolved_localhost(node_stub_with_server):
    """Loopback guard accepts resolved loopback addresses, not hostnames."""
    app = FastAPI()
    node_stub_with_server.register(app)

    status, result = asyncio.run(
        _request_app_json(app, '/api/v1/dev/diagnostics/node', method='GET',
                          client=('localhost', 12345))
    )

    assert status == 403


def test_action_schema_import_failure_returns_http_400(node_stub_with_server, monkeypatch):
    """Action schema lookup failures should use the intended HTTP 400 status."""
    app = FastAPI()
    node_stub_with_server.register(app)
    monkeypatch.setattr(
        node_stub_with_server,
        '_load_action_class',
        lambda _action_type: (_ for _ in ()).throw(ImportError('missing action')),
    )

    status, result = asyncio.run(
        _request_app_json(
            app,
            '/api/v1/action_schema',
            json_body={'action_type': 'missing_pkg/Demo'},
        )
    )

    assert status == 400
    assert result['success'] is False
    assert result['status'] == 400
    assert result['error'] == 'missing action'


@pytest.mark.parametrize('path', ['/api/v1/ros/namespace', '/api/v1/ros/params/demo'])
def test_ros_metadata_routes_require_token_when_auth_enabled(node_stub_with_server, path):
    """ROS metadata routes should not bypass token auth."""
    node_stub_with_server._server._api_token = 'secret-token'
    app = node_stub_with_server._server._app
    node_stub_with_server.register(app)

    status, result = asyncio.run(_request_app_json(app, path, method='GET'))

    assert status == 401
    assert result['success'] is False
    assert result['status'] == 401
    assert result['error'] == 'Unauthorized'


def test_ros_namespace_allows_authenticated_request(node_stub_with_server):
    """Authenticated ROS namespace requests should continue to work."""
    node_stub_with_server._server._api_token = 'secret-token'
    node_stub_with_server.get_namespace = lambda: '/demo'
    app = node_stub_with_server._server._app
    node_stub_with_server.register(app)

    status, result = asyncio.run(_request_app_json(
        app,
        '/api/v1/ros/namespace',
        method='GET',
        headers={'x-api-token': 'secret-token'},
    ))

    assert status == 200
    assert result['success'] is True
    assert result['data'] == '/demo'
