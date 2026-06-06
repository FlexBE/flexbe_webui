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

"""Regression tests for action-goal cancellation bookkeeping."""

import argparse
import asyncio
from collections import deque
import threading

from fastapi import FastAPI
from fastapi.routing import APIRoute

from flexbe_webui.io.base_models import CloseSubscriberRequest, CreateSubscriberRequest, SendActionGoalRequest
import flexbe_webui.webui_node as webui_node
from flexbe_webui.webui_node import _RosWebsocketBridge, WebuiNode

from pydantic import ValidationError

import pytest

from starlette.requests import Request
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


def _build_request(path, method='POST'):
    """Construct a minimal Starlette request object."""
    scope = {
        'type': 'http',
        'http_version': '1.1',
        'method': method,
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode('utf-8'),
        'query_string': b'',
        'headers': [],
        'client': ('testclient', 12345),
        'server': ('localhost', 8000),
    }
    return Request(scope)


class _FakeCommandServer:
    """Minimal server facade for direct node endpoint tests."""

    def authorize_request(self, _request):
        """Allow all direct test requests."""
        return None

    async def authorize_websocket(self, _websocket):
        """Allow all direct test websocket requests."""
        return True

    @staticmethod
    def api_command_success(key: str = 'ok', status_code: int = 200):
        """Return the command success envelope."""
        return {'success': True, 'data': {key: True}, 'error': None, 'status': status_code}

    @staticmethod
    def api_success(data=None, status_code: int = 200):
        """Return the generic success envelope."""
        return {'success': True, 'data': data, 'error': None, 'status': status_code}

    @staticmethod
    def api_command_failure(error, key: str = 'ok', status_code: int = 200):
        """Return the command failure envelope."""
        return {'success': False, 'data': {key: False}, 'error': str(error), 'status': status_code}


class _FakeWebsocket:
    """Minimal websocket object that captures close calls."""

    headers = {}
    query_params = {}

    def __init__(self):
        """Initialize captured close details."""
        self.closed_code = None
        self.closed_reason = None

    async def close(self, code=1000, reason=None):
        """Capture close data from websocket routes."""
        self.closed_code = code
        self.closed_reason = reason


class _DoneFuture:
    """Simple future stub with a preset result."""

    def __init__(self, result):
        self._result = result

    def done(self):
        """Act as an already-finished future."""
        return True

    def result(self):
        """Return the preset result."""
        return self._result


class _PendingFuture:
    """Future stub that never completes."""

    def done(self):
        """Act as a pending future."""
        return False


class _GoalHandle:
    """Minimal accepted goal handle stub."""

    def __init__(self, cancel_response, accepted=True):
        self.accepted = accepted
        self._cancel_response = cancel_response

    def cancel_goal_async(self):
        """Return a finished future for cancellation."""
        return _DoneFuture(self._cancel_response)


class _LegacyRequest:
    """Legacy synthesis-like request message."""

    __slots__ = ['name', 'system', 'goal', 'initial_condition', 'sm_outcomes']

    def __init__(self):
        self.name = ''
        self.system = ''
        self.goal = ''
        self.initial_condition = ''
        self.sm_outcomes = []

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {
            'name': 'string',
            'system': 'string',
            'goal': 'string',
            'initial_condition': 'string',
            'sm_outcomes': 'sequence<string>',
        }


class _ModernRequest:
    """Updated synthesis-like request message."""

    __slots__ = ['spec_name', 'system_name', 'goals', 'initial_conditions', 'sm_outcomes']

    def __init__(self):
        self.spec_name = ''
        self.system_name = ''
        self.goals = []
        self.initial_conditions = []
        self.sm_outcomes = []

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {
            'spec_name': 'string',
            'system_name': 'string',
            'goals': 'sequence<string>',
            'initial_conditions': 'sequence<string>',
            'sm_outcomes': 'sequence<string>',
        }


class _ModernRequestWithSpec:
    """Updated synthesis-like request message with specification file support."""

    __slots__ = [
        'spec_name',
        'system_name',
        'goals',
        'initial_conditions',
        'sm_outcomes',
        'specification_file_name',
        'synthesis_timeout_s',
    ]

    def __init__(self):
        self.spec_name = ''
        self.system_name = ''
        self.goals = []
        self.initial_conditions = []
        self.sm_outcomes = []
        self.specification_file_name = ''
        self.synthesis_timeout_s = 0.0

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {
            'spec_name': 'string',
            'system_name': 'string',
            'goals': 'sequence<string>',
            'initial_conditions': 'sequence<string>',
            'sm_outcomes': 'sequence<string>',
            'specification_file_name': 'string',
            'synthesis_timeout_s': 'float64',
        }


class _FloatSequenceRequest:
    """Message with a floating-point sequence field."""

    __slots__ = ['weights']

    def __init__(self):
        self.weights = []

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {
            'weights': 'sequence<double>',
        }


class _GoalMessage:
    """Top-level goal wrapper used by the population helper tests."""

    __slots__ = ['request']

    def __init__(self, request):
        self.request = request

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {'request': 'nested'}


class _GoalMessageWithOptions:
    """Top-level goal wrapper with modern synthesis options field."""

    __slots__ = ['request', 'synthesis_options']

    def __init__(self, request):
        self.request = request
        self.synthesis_options = ''

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {'request': 'nested', 'synthesis_options': 'string'}


@pytest.fixture
def node_stub(monkeypatch, tmp_path):
    """Create a lightweight WebuiNode instance without spinning ROS."""
    monkeypatch.setattr(webui_node.rclpy, 'ok', lambda: True)

    args = argparse.Namespace(
        config_folder=str(tmp_path),
        config_file='',
        clear_cache=True,
        port='8000',
        host='127.0.0.1',
        logging_level='warning',
    )

    node = WebuiNode.__new__(WebuiNode)
    node._action_clients = {}
    node._pub_data = {}
    node._sub_data = {}
    node._sub_lock = threading.Lock()
    node._destroy_subscription_queue = deque()
    node._destroy_subscription_lock = threading.Lock()
    node._running = True
    node._ws_bridge = None
    node._server = None
    node._args = args
    return node


def test_get_server_timeout_uses_server_settings(node_stub):
    """The action wait timeout should come from server settings when available."""
    node_stub._server = type('Server', (), {'_settings': {'server_timeout': 0.75}})()

    assert node_stub._get_server_timeout() == 0.75


def test_get_server_timeout_falls_back_when_server_settings_missing(node_stub):
    """The action wait timeout should fall back safely when settings are unavailable."""
    node_stub._server = None

    assert node_stub._get_server_timeout() == 0.25


def test_expected_shutdown_exception_matches_destroy_requested_invalid_handle():
    """Destroy-requested rclpy handles are normal during executor shutdown."""
    exc = webui_node.rclpy._rclpy_pybind11.InvalidHandle(
        'cannot use Destroyable because destruction was requested'
    )

    assert webui_node._is_expected_shutdown_exception(exc) is True


def test_cancel_active_goal_clears_state_on_success(node_stub):
    """Canceling an active goal should acknowledge and clear stored handles."""
    cancel_response = type('CancelResponse', (), {'goals_canceling': [object()]})()
    goal_handle = _GoalHandle(cancel_response)
    node_stub._action_clients['/demo'] = {
        'future': _DoneFuture(goal_handle),
        'goal_handle': None,
        'result_future': object(),
    }

    canceled = asyncio.run(node_stub._cancel_active_goal('/demo'))

    assert canceled is True
    assert node_stub._action_clients['/demo']['future'] is None
    assert node_stub._action_clients['/demo']['goal_handle'] is None
    assert node_stub._action_clients['/demo']['result_future'] is None


def test_cancel_active_goal_clears_state_when_cancel_not_acknowledged(node_stub):
    """A failed cancel should still clear stale local goal bookkeeping."""
    cancel_response = type('CancelResponse', (), {'goals_canceling': []})()
    goal_handle = _GoalHandle(cancel_response)
    node_stub._action_clients['/demo'] = {
        'future': None,
        'goal_handle': goal_handle,
        'result_future': object(),
    }

    canceled = asyncio.run(node_stub._cancel_active_goal('/demo'))

    assert canceled is False
    assert node_stub._action_clients['/demo']['future'] is None
    assert node_stub._action_clients['/demo']['goal_handle'] is None
    assert node_stub._action_clients['/demo']['result_future'] is None


def test_cancel_active_goal_clears_state_when_goal_handle_future_times_out(node_stub):
    """A stuck goal-handle future should not block cancellation bookkeeping forever."""
    node_stub._action_clients['/demo'] = {
        'future': _PendingFuture(),
        'goal_handle': None,
        'result_future': object(),
    }

    canceled = asyncio.run(node_stub._cancel_active_goal('/demo'))

    assert canceled is False
    assert node_stub._action_clients['/demo']['future'] is None
    assert node_stub._action_clients['/demo']['goal_handle'] is None
    assert node_stub._action_clients['/demo']['result_future'] is None


def test_wait_for_ros_future_times_out(node_stub):
    """Waiting for a pending ROS future should respect an explicit timeout."""
    completed = asyncio.run(node_stub._wait_for_ros_future(_PendingFuture(), timeout_sec=0.01))

    assert completed is False


def test_wait_for_ros_future_uses_default_timeout_when_missing(node_stub, monkeypatch):
    """Waiting for a pending ROS future should not be unbounded when timeout is omitted."""
    monkeypatch.setattr(webui_node, '_DEFAULT_ROS_FUTURE_TIMEOUT_SEC', 0.01)

    completed = asyncio.run(node_stub._wait_for_ros_future(_PendingFuture(), timeout_sec=None))

    assert completed is False


def test_send_action_goal_route_serializes_same_topic_requests(node_stub):
    """Concurrent goal requests for one topic should not enter dispatch together."""
    node_stub._server = _FakeCommandServer()
    node_stub._action_clients['/demo'] = {
        'client': object(),
        'class': object(),
        'future': None,
        'goal_handle': None,
        'result_future': None,
    }

    active = 0
    max_active = 0

    async def fake_send_action_goal_locked(_goal, _topic, _timeout_sec=None):
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        await asyncio.sleep(0)
        active -= 1
        return node_stub._server.api_success({'goal_succeeded': True})

    node_stub._send_action_goal_locked = fake_send_action_goal_locked

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_endpoint(app, '/api/v1/send_action_goal', 'POST')
    request = _build_request('/api/v1/send_action_goal')
    goal_request = SendActionGoalRequest(goal={}, topic='/demo', timeout_sec=0.1)

    async def run_case():
        return await asyncio.gather(
            endpoint(request=request, goal_request=goal_request),
            endpoint(request=request, goal_request=goal_request),
        )

    results = asyncio.run(run_case())

    assert max_active == 1
    assert [result['data']['goal_succeeded'] for result in results] == [True, True]


def test_websocket_bridge_broadcasts_to_all_topic_clients(monkeypatch):
    """Multiple UI clients subscribed to one topic should all receive forwarded messages."""
    bridge = _RosWebsocketBridge()
    sent = []

    class FakeWebsocket:
        """Websocket stub that records sent messages."""

        def __init__(self, name):
            self.name = name

        def send_text(self, msg):
            sent.append((self.name, msg))
            return f'coroutine-{self.name}'

    class FakeFuture:
        """Future stub that immediately reports callback success."""

        def add_done_callback(self, callback):
            callback(self)

        def result(self):
            return None

    monkeypatch.setattr(
        webui_node.rosidl_runtime_py.convert,
        'message_to_yaml',
        lambda _msg: 'value: 3\n',
    )
    monkeypatch.setattr(
        webui_node.asyncio,
        'run_coroutine_threadsafe',
        lambda _coro, _loop: FakeFuture(),
    )

    loop = object()
    bridge._websockets['/demo'] = [
        (FakeWebsocket('one'), loop),
        (FakeWebsocket('two'), loop),
    ]

    bridge.publish_msg('/demo', object())

    assert sent == [('one', '{"value": 3}'), ('two', '{"value": 3}')]
    snapshot = bridge.get_diagnostics_snapshot()
    assert snapshot['ws_send_successes'] == 2


def test_ros_subscriber_lifecycle_refcounts_shared_topic(node_stub, monkeypatch):
    """Closing one UI client should not remove a shared ROS topic subscription."""
    created = []
    destroyed = []

    class DemoMsg:
        """Minimal message class for subscriber creation."""

    class DemoMsgModule:
        """Minimal imported message module."""

        Demo = DemoMsg

    def create_subscription(msg_class, topic, callback, depth):
        subscription = {
            'callback': callback,
            'depth': depth,
            'msg_class': msg_class,
            'topic': topic,
        }
        created.append(subscription)
        return subscription

    monkeypatch.setattr(webui_node.importlib, 'import_module', lambda _name: DemoMsgModule)
    node_stub.create_subscription = create_subscription
    node_stub.destroy_subscription = lambda subscription: destroyed.append(subscription)

    _first, first_count, first_created = node_stub._create_subscriber('/demo', 'demo_msgs/Demo')
    _second, second_count, second_created = node_stub._create_subscriber('/demo', 'demo_msgs/Demo')

    assert first_created is True
    assert first_count == 1
    assert second_created is False
    assert second_count == 2
    assert len(created) == 1
    assert created[0]['depth'] == 20
    assert node_stub._sub_data['/demo']['ref_count'] == 2

    remaining, removed = node_stub._close_subscriber('/demo')

    assert removed is False
    assert remaining == 1
    assert destroyed == []
    assert node_stub._sub_data['/demo']['ref_count'] == 1

    remaining, removed = node_stub._close_subscriber('/demo')

    assert removed is True
    assert remaining == 0
    assert '/demo' not in node_stub._sub_data
    assert destroyed == []

    node_stub._destroy_queued_subscriptions()

    assert destroyed == [created[0]]


def test_ros_status_subscriber_uses_transient_local_qos(node_stub, monkeypatch):
    """Status subscription should request latched QoS."""
    created = []

    class DemoMsg:
        """Minimal message class for subscriber creation."""

    class DemoMsgModule:
        """Minimal imported message module."""

        BEStatus = DemoMsg

    def create_subscription(msg_class, topic, callback, qos_profile):
        subscription = {
            'callback': callback,
            'msg_class': msg_class,
            'qos_profile': qos_profile,
            'topic': topic,
        }
        created.append(subscription)
        return subscription

    monkeypatch.setattr(webui_node.importlib, 'import_module', lambda _name: DemoMsgModule)
    node_stub.create_subscription = create_subscription

    _subscription, _count, created_new = node_stub._create_subscriber(
        '/flexbe/status',
        'flexbe_msgs/BEStatus',
    )

    assert created_new is True
    assert len(created) == 1
    assert created[0]['qos_profile'].depth == 20
    assert created[0]['qos_profile'].durability == webui_node.QoSDurabilityPolicy.TRANSIENT_LOCAL


def test_ros_state_map_subscriber_uses_transient_local_qos(node_stub, monkeypatch):
    """State map subscription should request latched QoS."""
    created = []

    class DemoMsg:
        """Minimal message class for subscriber creation."""

    class DemoMsgModule:
        """Minimal imported message module."""

        StateMapMsg = DemoMsg

    def create_subscription(msg_class, topic, callback, qos_profile):
        subscription = {
            'callback': callback,
            'msg_class': msg_class,
            'qos_profile': qos_profile,
            'topic': topic,
        }
        created.append(subscription)
        return subscription

    monkeypatch.setattr(webui_node.importlib, 'import_module', lambda _name: DemoMsgModule)
    node_stub.create_subscription = create_subscription

    _subscription, _count, created_new = node_stub._create_subscriber(
        '/flexbe/mirror/state_map',
        'flexbe_msgs/StateMapMsg',
    )

    assert created_new is True
    assert len(created) == 1
    assert created[0]['qos_profile'].depth == 20
    assert created[0]['qos_profile'].durability == webui_node.QoSDurabilityPolicy.TRANSIENT_LOCAL


def test_ros_subscriber_lifecycle_is_idempotent_per_client(node_stub, monkeypatch):
    """Explicit close and websocket cleanup for one client should release only once."""
    created = []
    destroyed = []

    class DemoMsg:
        """Minimal message class for subscriber creation."""

    class DemoMsgModule:
        """Minimal imported message module."""

        Demo = DemoMsg

    def create_subscription(msg_class, topic, callback, depth):
        subscription = {
            'callback': callback,
            'depth': depth,
            'msg_class': msg_class,
            'topic': topic,
        }
        created.append(subscription)
        return subscription

    monkeypatch.setattr(webui_node.importlib, 'import_module', lambda _name: DemoMsgModule)
    node_stub.create_subscription = create_subscription
    node_stub.destroy_subscription = lambda subscription: destroyed.append(subscription)

    node_stub._create_subscriber('/demo', 'demo_msgs/Demo', client_id='one')
    _subscription, ref_count, created_new = node_stub._create_subscriber(
        '/demo',
        'demo_msgs/Demo',
        client_id='two',
    )

    assert created_new is False
    assert ref_count == 2

    remaining, removed = node_stub._close_subscriber('/demo', client_id='one')

    assert removed is False
    assert remaining == 1
    assert destroyed == []

    remaining, removed = node_stub._close_subscriber('/demo', client_id='one')

    assert removed is False
    assert remaining == 1
    assert destroyed == []

    remaining, removed = node_stub._close_subscriber('/demo', client_id='two')

    assert removed is True
    assert remaining == 0
    assert destroyed == []

    node_stub._destroy_queued_subscriptions()

    assert destroyed == [created[0]]


def test_close_subscriber_migration_does_not_create_phantom_ref(node_stub):
    """Closing a migrated zero-ref subscriber should not synthesize one anonymous ref."""
    subscription = object()
    node_stub._sub_data['/demo'] = {
        'clients': set(),
        'msg_type': 'demo_msgs/Demo',
        'ref_count': 0,
        'subscription': subscription,
    }

    remaining, removed = node_stub._close_subscriber('/demo', client_id='stale-client')

    assert remaining == 0
    assert removed is False
    assert node_stub._sub_data['/demo']['anonymous_ref_count'] == 0


def test_close_subscriber_request_rejects_raw_string_body():
    """Close subscriber should require the structured request shape."""
    with pytest.raises(ValidationError):
        CloseSubscriberRequest.model_validate('/demo')


def test_close_subscriber_request_rejects_invalid_topic():
    """Close subscriber should reject malformed topic strings before node cleanup."""
    with pytest.raises(ValidationError):
        CloseSubscriberRequest(topic='../demo', client_id='client-one')


def test_close_subscriber_route_uses_validated_request_model(node_stub):
    """Close subscriber route should consume the Pydantic model directly."""
    node_stub._server = _FakeCommandServer()
    closed = []

    def close_subscriber(topic, client_id=None):
        closed.append((topic, client_id))
        return 0, True

    node_stub._close_subscriber = close_subscriber

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_endpoint(app, '/api/v1/close_subscriber', 'POST')

    result = asyncio.run(endpoint(
        request=_build_request('/api/v1/close_subscriber'),
        close_request=CloseSubscriberRequest(topic='/demo', client_id='client-one'),
    ))

    assert result['success'] is True
    assert closed == [('/demo', 'client-one')]


def test_websocket_disconnect_releases_owned_subscriber():
    """Websocket cleanup should notify the subscriber owner for crash/drop cases."""
    bridge = _RosWebsocketBridge()
    released = []

    class FakeWebsocket:
        """Websocket stub that immediately disconnects after accept."""

        async def accept(self):
            return None

        async def receive(self):
            assert bridge.has_client('/demo', 'client-one') is True
            return {'type': 'websocket.disconnect'}

    asyncio.run(bridge.handle_websocket(
        FakeWebsocket(),
        '-demo',
        lambda: True,
        client_id='client-one',
        disconnect_callback=lambda topic, client_id: released.append((topic, client_id)),
    ))

    assert released == [('/demo', 'client-one')]
    assert bridge.has_client('/demo', 'client-one') is False
    assert bridge.get_diagnostics_snapshot()['active_websocket_topics'] == []


def test_websocket_client_is_registered_before_accept_completes():
    """Subscriber creation should be able to see client ownership during handshake."""
    bridge = _RosWebsocketBridge()
    released = []

    async def run_case():
        accept_started = asyncio.Event()
        allow_accept = asyncio.Event()

        class FakeWebsocket:
            """Websocket stub with a controllable accept point."""

            async def accept(self):
                accept_started.set()
                await allow_accept.wait()

            async def receive(self):
                return {'type': 'websocket.disconnect'}

        task = asyncio.create_task(bridge.handle_websocket(
            FakeWebsocket(),
            '-demo',
            lambda: True,
            client_id='client-one',
            disconnect_callback=lambda topic, client_id: released.append((topic, client_id)),
        ))

        await accept_started.wait()
        assert bridge.has_client('/demo', 'client-one') is True
        assert bridge.get_diagnostics_snapshot()['active_websocket_topics'] == []
        allow_accept.set()
        await task

    asyncio.run(run_case())

    assert released == [('/demo', 'client-one')]
    assert bridge.has_client('/demo', 'client-one') is False
    assert bridge.get_diagnostics_snapshot()['active_websocket_topics'] == []


def test_websocket_topic_path_decodes_only_safe_absolute_topics():
    """Websocket topic path validation should match browser-encoded ROS topics."""
    assert _RosWebsocketBridge.decode_topic_path('-demo-topic') == '/demo/topic'

    with pytest.raises(ValueError):
        _RosWebsocketBridge.decode_topic_path('demo/topic')


def test_websocket_client_id_validation_rejects_path_separators():
    """Websocket client IDs should not accept path separators or unbounded text."""
    assert _RosWebsocketBridge.validate_client_id('client-1234:abcd') == 'client-1234:abcd'

    with pytest.raises(ValueError):
        _RosWebsocketBridge.validate_client_id('../client')


def test_bound_disconnect_callback_runs_in_executor(monkeypatch):
    """Production websocket cleanup callbacks should be scheduled off the event loop."""
    calls = []

    class Recorder:
        """Bound-method callback recorder."""

        def record(self, topic, client_id):
            calls.append((topic, client_id))

    async def run_case():
        actual_loop = asyncio.get_running_loop()

        class FakeLoop:
            """Loop facade that records executor usage without starting threads."""

            def __init__(self):
                self.executor_calls = []

            def run_in_executor(self, executor, func, *args):
                self.executor_calls.append((executor, func, args))
                func(*args)
                future = actual_loop.create_future()
                future.set_result(None)
                return future

        fake_loop = FakeLoop()
        monkeypatch.setattr(webui_node.asyncio, 'get_running_loop', lambda: fake_loop)

        await _RosWebsocketBridge._run_disconnect_callback(Recorder().record, '/demo', 'client-one')

        assert len(fake_loop.executor_calls) == 1

    asyncio.run(run_case())

    assert calls == [('/demo', 'client-one')]


def test_create_subscriber_route_rejects_inactive_websocket_client(node_stub):
    """Late creates for disconnected websocket clients should not create ROS subscriptions."""
    node_stub._server = _FakeCommandServer()
    node_stub._ws_bridge = _RosWebsocketBridge()

    def fail_create_subscriber(*_args, **_kwargs):
        raise AssertionError('subscriber creation should not run for inactive clients')

    node_stub._create_subscriber = fail_create_subscriber

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_endpoint(app, '/api/v1/create_subscriber', 'POST')

    result = asyncio.run(endpoint(
        request=_build_request('/api/v1/create_subscriber'),
        sub_request=CreateSubscriberRequest(
            topic='/demo',
            msg_type='demo_msgs/Demo',
            client_id='client-one',
        ),
    ))

    assert result['success'] is False
    assert result['data']['ok'] is False
    assert "No active websocket for subscriber client 'client-one'" in result['error']
    assert node_stub._sub_data == {}


def test_create_subscriber_route_rejects_missing_client_id(node_stub):
    """Subscriber creates should require a websocket-owned client ID."""
    node_stub._server = _FakeCommandServer()
    node_stub._ws_bridge = _RosWebsocketBridge()

    def fail_create_subscriber(*_args, **_kwargs):
        raise AssertionError('subscriber creation should not run without a client ID')

    node_stub._create_subscriber = fail_create_subscriber

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_endpoint(app, '/api/v1/create_subscriber', 'POST')

    result = asyncio.run(endpoint(
        request=_build_request('/api/v1/create_subscriber'),
        sub_request=CreateSubscriberRequest(
            topic='/demo',
            msg_type='demo_msgs/Demo',
        ),
    ))

    assert result['success'] is False
    assert result['data']['ok'] is False
    assert 'requires a websocket client_id' in result['error']
    assert node_stub._sub_data == {}


def test_legacy_subscriber_websocket_route_requires_client_id(node_stub):
    """The anonymous websocket route should not register leak-prone subscribers."""
    node_stub._server = _FakeCommandServer()
    node_stub._ws_bridge = _RosWebsocketBridge()

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_websocket_endpoint(app, '/ws/{topic}')
    websocket = _FakeWebsocket()

    asyncio.run(endpoint(websocket=websocket, topic='-demo'))

    assert websocket.closed_code == 1008
    assert websocket.closed_reason == 'client_id required'
    assert node_stub._ws_bridge.get_diagnostics_snapshot()['active_websocket_topics'] == []


def test_subscriber_websocket_route_rejects_invalid_client_id(node_stub):
    """Client-scoped websocket routes should validate client IDs before registering."""
    node_stub._server = _FakeCommandServer()
    node_stub._ws_bridge = _RosWebsocketBridge()

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_websocket_endpoint(app, '/ws/{topic}/{client_id}')
    websocket = _FakeWebsocket()

    asyncio.run(endpoint(websocket=websocket, topic='-demo', client_id='../client'))

    assert websocket.closed_code == 1008
    assert 'Invalid websocket client_id' in websocket.closed_reason
    assert node_stub._ws_bridge.get_diagnostics_snapshot()['active_websocket_topics'] == []


def test_subscriber_websocket_route_rejects_invalid_topic(node_stub):
    """Client-scoped websocket routes should validate encoded topic path segments."""
    node_stub._server = _FakeCommandServer()
    node_stub._ws_bridge = _RosWebsocketBridge()

    app = FastAPI()
    node_stub.register(app)
    endpoint = _find_websocket_endpoint(app, '/ws/{topic}/{client_id}')
    websocket = _FakeWebsocket()

    asyncio.run(endpoint(websocket=websocket, topic='demo/topic', client_id='client-one'))

    assert websocket.closed_code == 1008
    assert 'Invalid websocket topic path' in websocket.closed_reason
    assert node_stub._ws_bridge.get_diagnostics_snapshot()['active_websocket_topics'] == []


def test_resolve_message_field_name_uses_present_aliases():
    """Semantic synthesis aliases should resolve against actual request fields."""
    modern_request = _ModernRequest()

    assert WebuiNode._resolve_message_field_name(modern_request, 'name') == 'spec_name'
    assert WebuiNode._resolve_message_field_name(modern_request, 'system') == 'system_name'
    assert WebuiNode._resolve_message_field_name(modern_request, 'goal') == 'goals'
    assert WebuiNode._resolve_message_field_name(modern_request, 'initial_condition') == 'initial_conditions'


def test_coerce_value_for_message_field_wraps_sequence_scalars():
    """Scalar values should be wrapped when the target ROS field is a sequence."""
    modern_request = _ModernRequest()

    assert WebuiNode._coerce_value_for_message_field(modern_request, 'goals', 'reach_goal') == ['reach_goal']
    assert WebuiNode._coerce_value_for_message_field(
        modern_request, 'initial_conditions', 'ready'
    ) == ['ready']


def test_coerce_value_for_message_field_converts_float_fields():
    """Integer JSON values should be converted for ROS float/double fields."""
    modern_request = _ModernRequestWithSpec()

    timeout = WebuiNode._coerce_value_for_message_field(
        modern_request, 'synthesis_timeout_s', 300
    )

    assert timeout == 300.0
    assert isinstance(timeout, float)


def test_coerce_value_for_message_field_rejects_bool_float_fields():
    """Booleans should not be accepted for ROS float/double fields."""
    modern_request = _ModernRequestWithSpec()

    with pytest.raises(ValueError, match='expects a floating-point value, got boolean'):
        WebuiNode._coerce_value_for_message_field(
            modern_request, 'synthesis_timeout_s', True
        )


def test_coerce_value_for_message_field_rejects_bool_float_sequences():
    """Boolean sequence elements should not be accepted for ROS float/double sequences."""
    request = _FloatSequenceRequest()

    with pytest.raises(ValueError, match='expects a floating-point value, got boolean'):
        WebuiNode._coerce_value_for_message_field(request, 'weights', [1.0, True])


def test_dynamic_goal_population_matches_legacy_request_shape(node_stub):
    """Canonical synthesis payload should populate legacy request fields directly."""
    goal_msg = _GoalMessage(_LegacyRequest())
    payload = {
        'request': {
            'name': 'root_sm',
            'system': 'demo_system',
            'goal': 'reach_goal',
            'initial_condition': 'ready',
            'sm_outcomes': ['finished', 'failed'],
        }
    }

    def recursive_set_msg_attr(msg, values):
        for key, value in values.items():
            field_name = node_stub._resolve_message_field_name(msg, key)
            if isinstance(value, dict):
                recursive_set_msg_attr(getattr(msg, field_name), value)
            else:
                setattr(msg, field_name, node_stub._coerce_value_for_message_field(msg, field_name, value))

    recursive_set_msg_attr(goal_msg, payload)

    assert goal_msg.request.name == 'root_sm'
    assert goal_msg.request.system == 'demo_system'
    assert goal_msg.request.goal == 'reach_goal'
    assert goal_msg.request.initial_condition == 'ready'
    assert goal_msg.request.sm_outcomes == ['finished', 'failed']


def test_dynamic_goal_population_matches_modern_request_shape(node_stub):
    """Canonical synthesis payload should adapt to renamed and sequence-based fields."""
    goal_msg = _GoalMessage(_ModernRequest())
    payload = {
        'request': {
            'name': 'root_sm',
            'system': 'demo_system',
            'goal': 'reach_goal',
            'initial_condition': 'ready',
            'sm_outcomes': ['finished', 'failed'],
        }
    }

    def recursive_set_msg_attr(msg, values):
        for key, value in values.items():
            field_name = node_stub._resolve_message_field_name(msg, key)
            if isinstance(value, dict):
                recursive_set_msg_attr(getattr(msg, field_name), value)
            else:
                setattr(msg, field_name, node_stub._coerce_value_for_message_field(msg, field_name, value))

    recursive_set_msg_attr(goal_msg, payload)

    assert goal_msg.request.spec_name == 'root_sm'
    assert goal_msg.request.system_name == 'demo_system'
    assert goal_msg.request.goals == ['reach_goal']
    assert goal_msg.request.initial_conditions == ['ready']
    assert goal_msg.request.sm_outcomes == ['finished', 'failed']


def test_dynamic_goal_population_ignores_unknown_fields_and_uses_modern_option_fields(node_stub):
    """Population should skip missing fields while applying modern ones that exist."""
    goal_msg = _GoalMessageWithOptions(_ModernRequest())
    payload = {
        'request': {
            'name': 'root_sm',
            'spec_name': 'root_sm',
            'system': 'demo_system',
            'system_name': 'demo_system',
            'goal': 'reach_goal',
            'goals': 'reach_goal',
            'initial_condition': 'ready',
            'initial_conditions': 'ready',
            'sm_outcomes': ['finished', 'failed'],
            'specification_file_name': 'spec.yaml',
        },
        'synthesis_options': 'fast',
    }

    def recursive_set_msg_attr(msg, values):
        for key, value in values.items():
            field_name = node_stub._resolve_message_field_name(msg, key)
            if not node_stub._message_has_field(msg, field_name):
                continue
            if isinstance(value, dict):
                recursive_set_msg_attr(getattr(msg, field_name), value)
            else:
                setattr(msg, field_name, node_stub._coerce_value_for_message_field(msg, field_name, value))

    recursive_set_msg_attr(goal_msg, payload)

    assert goal_msg.request.spec_name == 'root_sm'
    assert goal_msg.request.system_name == 'demo_system'
    assert goal_msg.request.goals == ['reach_goal']
    assert goal_msg.request.initial_conditions == ['ready']
    assert goal_msg.request.sm_outcomes == ['finished', 'failed']
    assert goal_msg.synthesis_options == 'fast'


def test_build_message_schema_recurses_nested_goal_fields():
    """The action schema helper should expose nested message and primitive field kinds."""
    schema = WebuiNode._build_message_schema(_GoalMessageWithOptions(_ModernRequestWithSpec()))

    assert schema == [
        {
            'name': 'request',
            'type': 'nested',
            'kind': 'message',
            'fields': [
                {'name': 'spec_name', 'type': 'string', 'kind': 'string'},
                {'name': 'system_name', 'type': 'string', 'kind': 'string'},
                {
                    'name': 'goals',
                    'type': 'sequence<string>',
                    'kind': 'sequence',
                    'element_kind': 'string',
                    'element_type': 'string',
                },
                {
                    'name': 'initial_conditions',
                    'type': 'sequence<string>',
                    'kind': 'sequence',
                    'element_kind': 'string',
                    'element_type': 'string',
                },
                {
                    'name': 'sm_outcomes',
                    'type': 'sequence<string>',
                    'kind': 'sequence',
                    'element_kind': 'string',
                    'element_type': 'string',
                },
                {'name': 'specification_file_name', 'type': 'string', 'kind': 'string'},
                {'name': 'synthesis_timeout_s', 'type': 'float64', 'kind': 'number'},
            ],
        },
        {
            'name': 'synthesis_options',
            'type': 'string',
            'kind': 'string',
        },
    ]
