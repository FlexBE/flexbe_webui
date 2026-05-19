# Copyright 2024 Philipp Schillinger and Christopher Newport University
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

"""ROS Node wrapping FlexBE WebUI web server."""

import asyncio
from collections import deque
from concurrent.futures import Future
from datetime import datetime
import importlib
import json
import re
import threading
from typing import Dict, List

from action_msgs.msg import GoalStatus

from fastapi import Body, FastAPI, Request, WebSocket, WebSocketDisconnect

import rclpy
import rclpy._rclpy_pybind11
from rclpy.action import ActionClient
from rclpy.executors import ExternalShutdownException, ShutdownException
from rclpy.node import Node
from rclpy.qos import QoSDurabilityPolicy, QoSProfile

import rosidl_runtime_py.convert
import rosidl_runtime_py.set_message

import yaml

from .io.base_models import (ActionClientRequest, ActionSchemaRequest, CancelActionGoalRequest,
                             ClosePublisherRequest,
                             CloseSubscriberRequest, CreatePublisherRequest, CreateSubscriberRequest,
                             PublishRequest, SendActionGoalRequest,
                             validate_ros_topic)
from .webui_server import parse_args, WebuiServer

_WEBSOCKET_CLIENT_ID_RE = re.compile(r'^[A-Za-z0-9_.:-]{1,128}$')
_WEBSOCKET_TOPIC_RE = re.compile(r'^-?(?:[A-Za-z0-9_]+-)*[A-Za-z0-9_]+$')
_DEFAULT_ROS_FUTURE_TIMEOUT_SEC = 10.0


def _is_expected_shutdown_exception(exc: BaseException) -> bool:
    """Return true for rclpy exceptions that can happen during normal shutdown."""
    if isinstance(exc, (KeyboardInterrupt, ExternalShutdownException, ShutdownException)):
        return True
    return (
        isinstance(exc, rclpy._rclpy_pybind11.InvalidHandle)
        and 'destruction was requested' in str(exc)
    )


class _RosWebsocketBridge:
    """Bridge ROS subscriber callbacks to websocket clients."""

    def __init__(self):
        """Initialize bridge state."""
        self._websockets = {}  # topic -> [(websocket, loop)]
        self._websocket_client_counts = {}  # topic -> {client_id: count}
        self._websocket_lock = threading.Lock()
        self._diag_lock = threading.Lock()
        self._send_failures = 0
        self._send_successes = 0
        self._recent_failures = deque(maxlen=100)

    def publish_msg(self, topic, msg):
        """Serialize and forward ROS messages to an active websocket topic."""
        with self._websocket_lock:
            entries = list(self._websockets.get(topic, []))

        if len(entries) == 0:
            print(f"\x1b[93mUI is offline (socket for '{topic}' does not exist)!\x1b[0m", flush=True)
            return

        try:
            msg_json = json.dumps(yaml.load(rosidl_runtime_py.convert.message_to_yaml(msg), Loader=yaml.SafeLoader))
        except (RuntimeError, OSError, ValueError, TypeError, KeyError, yaml.YAMLError) as exc:
            with self._diag_lock:
                self._send_failures += len(entries)
                self._recent_failures.append({
                    'ts': datetime.now().isoformat(timespec='seconds'),
                    'topic': topic,
                    'error': str(exc),
                })
            print(f"\x1b[93mFailed to serialize data for '{topic}' - {exc}\x1b[0m", flush=True)
            return

        for websocket, websocket_loop in entries:
            try:
                send_future = asyncio.run_coroutine_threadsafe(websocket.send_text(msg_json), websocket_loop)

                def _log_send_failure(future: Future, send_topic=topic):
                    try:
                        future.result()
                        with self._diag_lock:
                            self._send_successes += 1
                    except (RuntimeError, OSError, ValueError, TypeError) as exc:
                        with self._diag_lock:
                            self._send_failures += 1
                            self._recent_failures.append({
                                'ts': datetime.now().isoformat(timespec='seconds'),
                                'topic': send_topic,
                                'error': str(exc),
                            })
                        print(f"\x1b[93mFailed to send data for '{send_topic}' - {exc}\x1b[0m", flush=True)

                send_future.add_done_callback(_log_send_failure)
            except (RuntimeError, OSError, ValueError, TypeError) as exc:
                with self._diag_lock:
                    self._send_failures += 1
                    self._recent_failures.append({
                        'ts': datetime.now().isoformat(timespec='seconds'),
                        'topic': topic,
                        'error': str(exc),
                    })
                print(f"\x1b[93mFailed to send data for '{topic}' - {exc}\x1b[0m", flush=True)

    @staticmethod
    def decode_topic_path(raw_topic: str) -> str:
        """Decode and validate a websocket topic path segment."""
        if not isinstance(raw_topic, str) or not _WEBSOCKET_TOPIC_RE.match(raw_topic):
            raise ValueError(f'Invalid websocket topic path: {raw_topic!r}')
        topic = raw_topic.replace('-', '/')
        return validate_ros_topic(topic)

    @staticmethod
    def validate_client_id(client_id: str) -> str:
        """Validate a websocket client ID generated by the browser client."""
        if not isinstance(client_id, str) or not _WEBSOCKET_CLIENT_ID_RE.match(client_id):
            raise ValueError(f'Invalid websocket client_id: {client_id!r}')
        return client_id

    @staticmethod
    async def _run_disconnect_callback(disconnect_callback, topic: str, client_id: str):
        """Run production subscriber cleanup outside the event loop."""
        if getattr(disconnect_callback, '__self__', None) is None:
            disconnect_callback(topic, client_id)
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, disconnect_callback, topic, client_id)

    async def handle_websocket(self, websocket: WebSocket, raw_topic: str, running_check,
                               client_id=None, disconnect_callback=None):
        """Register websocket and keep receiving until disconnect/shutdown."""
        topic = self.decode_topic_path(raw_topic)
        if client_id is not None:
            client_id = self.validate_client_id(client_id)
        entry = (websocket, asyncio.get_running_loop())
        entry_registered = False
        client_registered = False
        with self._websocket_lock:
            if client_id is not None:
                client_counts = self._websocket_client_counts.setdefault(topic, {})
                client_counts[client_id] = client_counts.get(client_id, 0) + 1
                client_registered = True

        try:
            await websocket.accept()
            print(f"accepted websocket for '{raw_topic}'", flush=True)
            with self._websocket_lock:
                self._websockets.setdefault(topic, []).append(entry)
                entry_registered = True

            while running_check():
                data = await websocket.receive()
                if 'type' in data and data['type'] == 'websocket.disconnect':
                    break
        except WebSocketDisconnect as exc:
            print(f"flexbe_webui_node: '{topic}' - WebSocket disconnected! ({exc})", flush=True)
        except RuntimeError as exc:
            print(f"flexbe_webui_node: '{topic}' - {exc}", flush=True)
        finally:
            released_client = False
            with self._websocket_lock:
                if entry_registered:
                    entries = self._websockets.get(topic, [])
                    self._websockets[topic] = [current for current in entries if current != entry]
                    if topic in self._websockets and len(self._websockets[topic]) == 0:
                        del self._websockets[topic]
                if client_registered:
                    client_counts = self._websocket_client_counts.get(topic, {})
                    next_count = client_counts.get(client_id, 0) - 1
                    if next_count > 0:
                        client_counts[client_id] = next_count
                    else:
                        client_counts.pop(client_id, None)
                        released_client = True
                    if not client_counts and topic in self._websocket_client_counts:
                        del self._websocket_client_counts[topic]
            if released_client and disconnect_callback is not None and client_id is not None:
                await self._run_disconnect_callback(disconnect_callback, topic, client_id)

    def has_client(self, topic: str, client_id: str) -> bool:
        """Return whether a websocket client is currently registered for a topic."""
        with self._websocket_lock:
            return self._websocket_client_counts.get(topic, {}).get(client_id, 0) > 0

    def get_diagnostics_snapshot(self):
        """Return websocket bridge diagnostics for development troubleshooting."""
        with self._diag_lock:
            failures = self._send_failures
            successes = self._send_successes
            recent = list(self._recent_failures)
        with self._websocket_lock:
            active_topics = list(self._websockets.keys())

        return {
            'ws_send_successes': successes,
            'ws_send_failures': failures,
            'active_websocket_topics': active_topics,
            'recent_ws_send_failures': recent[-50:],
        }


class WebuiNode(Node):
    """
    ROS 2 Node for connecting to online FlexBE Behavior Engine.

    This creates an instance of the FlexBE WebUI
    interface, and connections to ROS nodes for
    FlexBE OCS nodes (mirror and launcher).
    """

    def __init__(self, args):
        """Initialize the WebuiNode."""
        super().__init__('flexbe_webui')
        self._server = WebuiServer(args, online_mode=True)
        self._pub_data = {}
        self._action_clients = {}
        self._sub_data = {}
        self._sub_lock = threading.Lock()
        self._destroy_subscription_queue = deque()
        self._destroy_subscription_lock = threading.Lock()
        self._destroy_subscription_timer = self.create_timer(0.05, self._destroy_queued_subscriptions)
        self._ws_bridge = _RosWebsocketBridge()
        self.register(self._server._app)
        self._running = True

    def _sub_callback(self, msg, topic):
        """Call on message receipt."""
        self._ws_bridge.publish_msg(topic, msg)

    @staticmethod
    def _subscriber_ref_count(subscriber_data):
        """Return the total references for a subscriber entry."""
        return subscriber_data.get('anonymous_ref_count', 0) + len(subscriber_data.get('clients', set()))

    @staticmethod
    def _subscriber_qos_for_topic(topic: str):
        """Return the ROS QoS profile for a WebUI-managed subscription."""
        latched_topics = (
            '/flexbe/status',
            '/flexbe/mirror/state_map',
        )
        if topic.endswith(latched_topics):
            return QoSProfile(depth=20, durability=QoSDurabilityPolicy.TRANSIENT_LOCAL)
        return 20

    def _require_active_subscriber_client(self, topic: str, client_id: str = None):
        """Reject client-scoped subscriber creation without a matching websocket."""
        if client_id is None:
            raise ValueError(f"Subscriber creation for '{topic}' requires a websocket client_id")
        if self._ws_bridge is None or not self._ws_bridge.has_client(topic, client_id):
            raise ValueError(f"No active websocket for subscriber client '{client_id}' on '{topic}'")

    def _create_subscriber(self, topic: str, msg_type: str, client_id: str = None):
        """Create or retain a shared ROS subscription for a UI topic client."""
        msg_pkg, msg_name = msg_type.split('/')
        msg_module = importlib.import_module(f'{msg_pkg}.msg')
        msg_class = getattr(msg_module, msg_name)

        with self._sub_lock:
            existing = self._sub_data.get(topic)
            if existing is not None:
                if existing['msg_type'] != msg_type:
                    raise ValueError(
                        f"Subscriber for '{topic}' already uses {existing['msg_type']}, not {msg_type}"
                    )
                existing.setdefault('clients', set())
                existing.setdefault('anonymous_ref_count', existing.get('ref_count', 0))
                if client_id is None:
                    existing['anonymous_ref_count'] += 1
                elif client_id not in existing['clients']:
                    existing['clients'].add(client_id)
                existing['ref_count'] = self._subscriber_ref_count(existing)
                return existing['subscription'], existing['ref_count'], False

            qos_profile = self._subscriber_qos_for_topic(topic)
            subscription = self.create_subscription(
                msg_class,
                topic,
                lambda msg: self._sub_callback(msg, topic),
                qos_profile,
            )
            clients = set()
            anonymous_ref_count = 1
            if client_id is not None:
                clients.add(client_id)
                anonymous_ref_count = 0
            self._sub_data[topic] = {
                'anonymous_ref_count': anonymous_ref_count,
                'clients': clients,
                'msg_class': msg_class,
                'msg_type': msg_type,
                'ref_count': 1,
                'subscription': subscription,
            }
            return subscription, 1, True

    def _queue_destroy_subscription(self, subscription):
        """Queue subscription destruction so the ROS executor owns entity teardown."""
        if not hasattr(self, '_destroy_subscription_queue'):
            self.destroy_subscription(subscription)
            return
        with self._destroy_subscription_lock:
            self._destroy_subscription_queue.append(subscription)

    def _destroy_queued_subscriptions(self):
        """Destroy queued subscriptions from the ROS executor thread."""
        while True:
            with self._destroy_subscription_lock:
                if len(self._destroy_subscription_queue) == 0:
                    return
                subscription = self._destroy_subscription_queue.popleft()
            try:
                self.destroy_subscription(subscription)
            except rclpy._rclpy_pybind11.InvalidHandle as exc:
                if not _is_expected_shutdown_exception(exc):
                    print(f'\x1b[91mFailed queued subscriber destruction - {exc}\x1b[0m', flush=True)
            except rclpy._rclpy_pybind11.RCLError as exc:
                print(f'\x1b[91mFailed queued subscriber destruction - {exc}\x1b[0m', flush=True)

    def _close_subscriber(self, topic: str, client_id: str = None):
        """Release a UI topic client and destroy the ROS subscription at zero users."""
        with self._sub_lock:
            existing = self._sub_data.get(topic)
            if existing is None:
                return 0, False

            existing.setdefault('clients', set())
            existing.setdefault('anonymous_ref_count', existing.get('ref_count', 0))
            if client_id is None:
                if existing['anonymous_ref_count'] > 0:
                    existing['anonymous_ref_count'] -= 1
            elif client_id not in existing['clients']:
                return self._subscriber_ref_count(existing), False
            else:
                existing['clients'].remove(client_id)

            ref_count = self._subscriber_ref_count(existing)
            if ref_count > 0:
                existing['ref_count'] = ref_count
                return ref_count, False

            self._queue_destroy_subscription(existing['subscription'])
            self._sub_data.pop(topic)
            return 0, True

    def _release_websocket_subscriber(self, topic: str, client_id: str):
        """Release a subscriber when its owning websocket disconnects."""
        try:
            ref_count, removed = self._close_subscriber(topic, client_id)
            if removed:
                print(f"\x1b[91mRemoved subscriber for '{topic}' after websocket disconnect\x1b[0m", flush=True)
            elif ref_count > 0:
                print(
                    f"\x1b[91mRetained subscriber for '{topic}' after websocket disconnect; clients={ref_count}\x1b[0m",
                    flush=True,
                )
        except (KeyError, RuntimeError, ValueError, TypeError) as exc:
            print(f"\x1b[91mFailed websocket subscriber cleanup for '{topic}' - {exc}\x1b[0m", flush=True)

    @staticmethod
    def _message_field_names(msg) -> List[str]:
        """Return known field names for a ROS/message-like object."""
        if hasattr(msg, 'get_fields_and_field_types'):
            try:
                return list(msg.get_fields_and_field_types().keys())
            except (RuntimeError, TypeError, ValueError, AttributeError):
                pass
        if hasattr(msg, '__slots__'):
            return [slot[1:] if slot.startswith('_') else slot for slot in msg.__slots__]
        return []

    @staticmethod
    def _message_has_field(msg, field_name: str) -> bool:
        """Return whether the message exposes the given field."""
        return field_name in WebuiNode._message_field_names(msg)

    @staticmethod
    def _classify_field_type(field_type: str) -> str:
        """Classify a ROS field type into a frontend-friendly kind."""
        if field_type in ('string', 'wstring'):
            return 'string'
        if field_type in ('bool', 'boolean'):
            return 'boolean'
        if field_type.startswith(('float', 'double')):
            return 'number'
        if field_type.startswith(('int', 'uint')):
            return 'integer'
        if '/' in field_type:
            return 'message'
        return 'string'

    @staticmethod
    def _extract_sequence_element_type(field_type: str) -> str:
        """Extract the element type from a ROS sequence type string."""
        if '<' in field_type and '>' in field_type:
            return field_type[field_type.find('<') + 1:field_type.rfind('>')]
        return ''

    @classmethod
    def _build_message_schema(cls, msg) -> List[Dict[str, object]]:
        """Build a recursive schema for a ROS/message-like object."""
        try:
            field_types = msg.get_fields_and_field_types()
        except (RuntimeError, TypeError, ValueError, AttributeError):
            field_types = {}

        fields = []
        for field_name in cls._message_field_names(msg):
            field_type = field_types.get(field_name, '')
            schema_entry = {
                'name': field_name,
                'type': field_type,
            }
            if field_type.startswith(('sequence<', 'bounded_sequence<')):
                element_type = cls._extract_sequence_element_type(field_type)
                schema_entry['kind'] = 'sequence'
                schema_entry['element_kind'] = cls._classify_field_type(element_type)
                schema_entry['element_type'] = element_type
            else:
                try:
                    field_value = getattr(msg, field_name)
                except AttributeError:
                    field_value = None

                if field_value is not None and hasattr(field_value, 'get_fields_and_field_types'):
                    schema_entry['kind'] = 'message'
                    schema_entry['fields'] = cls._build_message_schema(field_value)
                else:
                    schema_entry['kind'] = cls._classify_field_type(field_type)
            fields.append(schema_entry)

        return fields

    @staticmethod
    def _load_action_class(action_type: str):
        """Load an action class from a package/type string."""
        action_def = action_type.split('/')
        action_pkg = action_def[0]
        action_name = action_def[1]
        action_module = importlib.import_module(f'{action_pkg}.action')
        return getattr(action_module, action_name)

    @staticmethod
    def _resolve_message_field_name(msg, key: str) -> str:
        """Resolve semantic aliases against actual message fields."""
        fields = WebuiNode._message_field_names(msg)
        if key in fields:
            return key

        alias_groups = [
            ('name', 'spec_name'),
            ('system', 'system_name'),
            ('goal', 'goals'),
            ('initial_condition', 'initial_conditions'),
        ]
        for group in alias_groups:
            if key not in group:
                continue
            for candidate in group:
                if candidate in fields:
                    return candidate
        return key

    @staticmethod
    def _coerce_value_for_message_field(msg, field_name: str, value):
        """Coerce values to the target field type when needed."""
        try:
            field_types = msg.get_fields_and_field_types()
            field_type = field_types.get(field_name, '')
        except (RuntimeError, TypeError, ValueError, AttributeError):
            field_type = ''

        def coerce_float(field_value):
            if isinstance(field_value, bool):
                raise ValueError(f"Field '{field_name}' expects a floating-point value, got boolean")
            try:
                return float(field_value)
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"Field '{field_name}' expects a floating-point value, got {field_value!r}"
                ) from exc

        if field_type.startswith('sequence<') or field_type.startswith('bounded_sequence<'):
            if isinstance(value, list):
                sequence_value = value
            elif isinstance(value, tuple):
                sequence_value = list(value)
            else:
                sequence_value = [value]

            element_type = WebuiNode._extract_sequence_element_type(field_type)
            if element_type.startswith(('float', 'double')):
                return [coerce_float(sequence_item) for sequence_item in sequence_value]
            return sequence_value
        if field_type.startswith(('float', 'double')):
            return coerce_float(value)
        return value

    def _get_server_timeout(self) -> float:
        """Return the configured action server wait timeout."""
        try:
            if self._server is not None and hasattr(self._server, '_settings'):
                return float(self._server._settings.get('server_timeout', 0.25))
        except (AttributeError, TypeError, ValueError):
            pass
        return 0.25

    @staticmethod
    async def _wait_for_ros_future(future, timeout_sec: float = None) -> bool:
        """Wait for a ROS future without blocking the FastAPI event loop."""
        if timeout_sec is None:
            timeout_sec = _DEFAULT_ROS_FUTURE_TIMEOUT_SEC
        deadline = asyncio.get_running_loop().time() + timeout_sec

        while rclpy.ok() and not future.done():
            if asyncio.get_running_loop().time() >= deadline:
                return False
            await asyncio.sleep(0.01)
        return future.done()

    async def _cancel_active_goal(self, topic: str, clear_on_timeout: bool = True) -> bool:
        """
        Cancel any active goal for the given action topic.

        clear_on_timeout=False preserves goal_handle/future when the cancel acknowledgment
        times out, allowing the caller to retry without losing the handle.  Internal callers
        (pre-dispatch cleanup, result timeout) should leave this True so stale state is
        always removed.
        """
        action_data = self._action_clients.get(topic)
        if action_data is None:
            return False

        future = action_data.get('future')
        goal_handle = action_data.get('goal_handle')

        if future is None and goal_handle is None:
            return False

        try:
            if goal_handle is None and future is not None:
                if not await self._wait_for_ros_future(future, self._get_server_timeout()):
                    action_data['future'] = None
                    action_data['goal_handle'] = None
                    action_data['result_future'] = None
                    return False
                goal_handle = future.result()
                action_data['goal_handle'] = goal_handle
        except (RuntimeError, TypeError, ValueError, AttributeError) as exc:
            print(f"Failed to retrieve active goal handle for '{topic}' - {exc}", flush=True)
            action_data['future'] = None
            action_data['goal_handle'] = None
            action_data['result_future'] = None
            return False

        if goal_handle is None or not goal_handle.accepted:
            action_data['future'] = None
            action_data['goal_handle'] = None
            action_data['result_future'] = None
            return False

        cancel_timed_out = False
        try:
            cancel_timeout = self._get_server_timeout() if clear_on_timeout else max(5.0, self._get_server_timeout())
            cancel_future = goal_handle.cancel_goal_async()
            if not await self._wait_for_ros_future(cancel_future, cancel_timeout):
                print(f"Timed out while canceling active goal for '{topic}'.", flush=True)
                cancel_timed_out = True
                return False
            cancel_response = cancel_future.result()
            canceled = bool(cancel_response.goals_canceling)
            if not canceled:
                print(f"Action goal for '{topic}' did not acknowledge cancellation.", flush=True)
                return False
            print(f"Canceled existing goal for '{topic}'", flush=True)
            return True
        except (RuntimeError, TypeError, ValueError, AttributeError) as exc:
            print(f"Failed to cancel active goal for '{topic}' - {exc}", flush=True)
            return False
        finally:
            if not (cancel_timed_out and not clear_on_timeout):
                action_data['future'] = None
                action_data['goal_handle'] = None
                action_data['result_future'] = None

    def _get_action_goal_lock(self, topic: str):
        """Return the per-topic action goal dispatch lock."""
        action_data = self._action_clients[topic]
        goal_lock = action_data.get('goal_lock')
        if goal_lock is None:
            goal_lock = asyncio.Lock()
            action_data['goal_lock'] = goal_lock
        return goal_lock

    async def _send_action_goal_locked(self, goal, topic: str, timeout_sec: float = None):
        """Send an action goal while the per-topic dispatch lock is held."""
        if self._action_clients[topic]['future']:
            print(f"Already have an active goal for '{topic}'", flush=True)
            canceled = await self._cancel_active_goal(topic)
            if not canceled:
                return self._server.api_success({
                    'goal_succeeded': False,
                    'reason': 'Failed to cancel the existing goal before sending a new one.',
                })

        try:
            print('create goal msg instance ...', flush=True)
            goal_class = self._action_clients[topic]['class']
            print(f'   goal class={goal_class}', flush=True)
            goal_msg = goal_class.Goal()
            print(f'Default goal msg: {goal_msg}', flush=True)

            print('Populate goal msg ...', flush=True)

            def recursive_set_msg_attr(msg, values):
                """Recursively set values from dictionary into a nested data structure."""
                for key, value in values.items():
                    field_name = self._resolve_message_field_name(msg, key)
                    if not self._message_has_field(msg, field_name):
                        continue
                    if isinstance(value, dict):
                        recursive_set_msg_attr(getattr(msg, field_name), value)
                    else:
                        coerced_value = self._coerce_value_for_message_field(msg, field_name, value)
                        setattr(msg, field_name, coerced_value)

            recursive_set_msg_attr(goal_msg, goal)
            print(f'Goal msg: {goal_msg}', flush=True)
        except (AttributeError, TypeError, ValueError, KeyError) as exc:
            msg = f"Invalid goal set for '{topic}' - {exc}"
            print(msg, flush=True)
            return self._server.api_success({'goal_succeeded': False, 'reason': str(exc)})

        if self._action_clients[topic]['client'].wait_for_server(timeout_sec=self._get_server_timeout()):
            print(f" Send goal to '{topic}' ...", flush=True)
            action_data = self._action_clients[topic]
            try:
                action_data['last_feedback'] = None

                def _store_feedback(feedback_msg):
                    try:
                        action_data['last_feedback'] = {
                            'status': str(feedback_msg.feedback.status),
                            'progress': float(feedback_msg.feedback.progress),
                        }
                    except (AttributeError, TypeError, ValueError):
                        pass

                action_data['future'] = \
                    self._action_clients[topic]['client'].send_goal_async(goal_msg,
                                                                          feedback_callback=_store_feedback)
                action_data['goal_handle'] = None
                action_data['result_future'] = None
            except (RuntimeError, TypeError, ValueError, AttributeError) as exc:
                print(f'Error: {exc}', flush=True)
                return self._server.api_success({'goal_succeeded': False, 'reason': str(exc)})
        else:
            msg = f"Action server is not available for '{topic}'"
            print(msg, flush=True)
            return self._server.api_success({'goal_succeeded': False, 'reason': msg})

        if self._action_clients[topic]['future']:
            print(f"Waiting on future goal handle from '{topic}' ...", flush=True)
            try:
                future = self._action_clients[topic]['future']
                if not await self._wait_for_ros_future(future, self._get_server_timeout()):
                    canceled = await self._cancel_active_goal(topic)
                    return self._server.api_success({
                        'goal_succeeded': False,
                        'timed_out': True,
                        'reason': 'Timed out waiting for goal acceptance.',
                        'canceled': canceled,
                    })

                goal_handle = future.result()
                self._action_clients[topic]['goal_handle'] = goal_handle
                if not goal_handle.accepted:
                    self._action_clients[topic]['future'] = None
                    self._action_clients[topic]['goal_handle'] = None
                    return self._server.api_success({'goal_succeeded': False, 'reason': 'Goal rejected!'})

                print(f"Waiting on future result from '{topic}' gh={goal_handle} ...", flush=True)
                result_future = goal_handle.get_result_async()
                self._action_clients[topic]['result_future'] = result_future
                if not await self._wait_for_ros_future(result_future, timeout_sec):
                    canceled = await self._cancel_active_goal(topic)
                    return self._server.api_success({
                        'goal_succeeded': False,
                        'timed_out': True,
                        'reason': 'Timed out waiting for action result.',
                        'canceled': canceled,
                    })

                result = result_future.result()
                self._action_clients[topic]['future'] = None
                self._action_clients[topic]['goal_handle'] = None
                self._action_clients[topic]['result_future'] = None
                if result.status == GoalStatus.STATUS_SUCCEEDED:
                    print(f"Goal '{topic}' succeeded!", flush=True)
                    result_json = json.dumps(yaml.load(rosidl_runtime_py.convert.message_to_yaml(result.result),
                                             Loader=yaml.SafeLoader))
                    return self._server.api_success({'goal_succeeded': True, 'result': result_json})
                elif result.status == GoalStatus.STATUS_CANCELED:
                    print(f"Goal '{topic}' was canceled!", flush=True)
                    return self._server.api_success({'goal_succeeded': False, 'reason': 'Goal was canceled!'})
                else:
                    print(f"Goal '{topic}' was not successful ({result.status})!", flush=True)
                    return self._server.api_success({
                        'goal_succeeded': False,
                        'reason': f"Did not succeed : Goal status='{result.status}'",
                    })
            except (RuntimeError, TypeError, ValueError, AttributeError) as exc:
                self._action_clients[topic]['future'] = None
                self._action_clients[topic]['goal_handle'] = None
                self._action_clients[topic]['result_future'] = None
                print(f'Error: {exc}', flush=True)
                return self._server.api_success({'goal_succeeded': False, 'reason': 'failed to retrieve future: ' + str(exc)})

        return self._server.api_success({'goal_succeeded': False, 'reason': 'Invalid goal future!'})

    def register(self, app: FastAPI):
        """Register web server resources."""
        @app.post('/api/v1/publish')
        async def publish(request: Request, publish_request: PublishRequest = Body(...)):
            """Publish message from UI."""
            topic = publish_request.topic
            req = publish_request.req
            try:
                self._server.authorize_request(request)
                # print(f"Request to publish data for '{topic}' ", flush=True)
                pub_data = self._pub_data[topic]
                publisher = pub_data['publisher']
                msg = pub_data['msg_class']()
                rosidl_runtime_py.set_message.set_message_fields(msg, req)
                publisher.publish(msg)
                return self._server.api_command_success()
            except (KeyError, AttributeError, TypeError, ValueError, RuntimeError) as exc:
                print(f"\x1b[91mFailed to publish '{topic}' - {exc}\n{req}\x1b[0m", flush=True)
                return self._server.api_command_failure(exc)

        @app.post('/api/v1/create_publisher')
        async def create_pub(request: Request, pub_request: CreatePublisherRequest = Body(...)):
            """Create ROS 2 publisher."""
            topic = pub_request.topic
            msg_type = pub_request.msg_type
            latched = pub_request.latched
            print(f"\x1b[92mCreating publisher for '{topic}' ({msg_type}) latched={latched}\x1b[0m", flush=True)
            try:
                self._server.authorize_request(request)
                msg_pkg, msg_name = msg_type.split('/')
                msg_module = importlib.import_module(f'{msg_pkg}.msg')
                msg_class = getattr(msg_module, msg_name)

                if latched:
                    print(f"Latched topic for {msg_class} '{topic}'!", flush=True)
                    latching_qos = QoSProfile(depth=1, durability=QoSDurabilityPolicy.TRANSIENT_LOCAL)
                    publisher = self.create_publisher(msg_class, topic, qos_profile=latching_qos)
                else:
                    publisher = self.create_publisher(msg_class, topic, 10)

                self._pub_data[topic] = {'msg_class': msg_class, 'publisher': publisher}
                return self._server.api_command_success()
            except (ImportError, AttributeError, IndexError, ValueError, TypeError, RuntimeError) as exc:
                print(f"Failed to create publisher for '{topic}' - {exc}", flush=True)
                return self._server.api_command_failure(exc)

        @app.post('/api/v1/close_publisher')
        async def close_pub(request: Request, close_request: ClosePublisherRequest = Body(...)):
            """Close ROS 2 publisher."""
            topic = close_request.topic
            try:
                self._server.authorize_request(request)
                if topic in self._pub_data:
                    self.destroy_publisher(self._pub_data[topic]['publisher'])
                    self._pub_data.pop(topic)
                    print(f"\x1b[91mClosed publisher for '{topic}' \x1b[0m", flush=True)
                else:
                    print(f"\x1b[95mRequest to close publisher for '{topic}' that is not active!\x1b[0m", flush=True)
                return self._server.api_command_success()
            except (KeyError, RuntimeError, ValueError, TypeError) as exc:
                print(f"Failed to remove publisher for '{topic}' - {exc}", flush=True)
                return self._server.api_command_failure(exc)

        @app.post('/api/v1/create_subscriber')
        async def create_sub(request: Request, sub_request: CreateSubscriberRequest = Body(...)):
            """Create ROS subscription."""
            topic = sub_request.topic
            msg_type = sub_request.msg_type
            client_id = sub_request.client_id
            try:
                self._server.authorize_request(request)
                self._require_active_subscriber_client(topic, client_id)
                _subscription, ref_count, created = self._create_subscriber(topic, msg_type, client_id)
                if created:
                    print(f"\x1b[92mCreated subscriber for '{topic}' ({msg_type}) \x1b[0m", flush=True)
                else:
                    print(
                        f"\x1b[92mReused subscriber for '{topic}' ({msg_type}); clients={ref_count} \x1b[0m",
                        flush=True,
                    )
                return self._server.api_command_success()
            except (ImportError, AttributeError, IndexError, ValueError, TypeError, RuntimeError) as exc:
                print(f"\x1b[91mFailed to create subscriber for '{topic}' - {exc}\x1b[0m", flush=True)
                return self._server.api_command_failure(exc)

        @app.post('/api/v1/close_subscriber')
        async def close_sub(request: Request, close_request: CloseSubscriberRequest = Body(...)):
            """Close ROS subscription."""
            topic = close_request.topic
            client_id = close_request.client_id
            try:
                self._server.authorize_request(request)
                ref_count, removed = self._close_subscriber(topic, client_id)
                if removed:
                    print(f"\x1b[91mRemoved subscriber for '{topic}' \x1b[0m", flush=True)
                elif ref_count > 0:
                    print(f"\x1b[91mRetained subscriber for '{topic}'; clients={ref_count} \x1b[0m", flush=True)
                else:
                    print(f"\x1b[95mRequest to close subscriber for '{topic}' that is not active!\x1b[0m", flush=True)
                return self._server.api_command_success()
            except (KeyError, RuntimeError, ValueError, TypeError) as exc:
                print(f"\x1b[91mFailed to remove subscriber for '{topic}' - {exc}\x1b[0m", flush=True)
                return self._server.api_command_failure(exc)

        @app.websocket('/ws/{topic}')
        async def websocket_endpoint(websocket: WebSocket, topic: str):
            if not await self._server.authorize_websocket(websocket):
                return
            try:
                self._ws_bridge.decode_topic_path(topic)
            except ValueError as exc:
                await websocket.close(code=1008, reason=str(exc))
                return
            await websocket.close(code=1008, reason='client_id required')

        @app.websocket('/ws/{topic}/{client_id}')
        async def websocket_client_endpoint(websocket: WebSocket, topic: str, client_id: str):
            if not await self._server.authorize_websocket(websocket):
                return
            try:
                self._ws_bridge.decode_topic_path(topic)
                self._ws_bridge.validate_client_id(client_id)
            except ValueError as exc:
                await websocket.close(code=1008, reason=str(exc))
                return
            await self._ws_bridge.handle_websocket(
                websocket,
                topic,
                lambda: self._running,
                client_id=client_id,
                disconnect_callback=self._release_websocket_subscriber,
            )

        @app.get('/api/v1/dev/diagnostics/node')
        async def diagnostics_node(request: Request):
            """Return ROS/websocket bridge diagnostics."""
            self._server._require_loopback(request)
            return self._server.api_success({
                'generated_at': datetime.now().isoformat(timespec='seconds'),
                'publishers_active': len(self._pub_data),
                'subscribers_active': len(self._sub_data),
                'action_clients_active': len(self._action_clients),
                'websocket_bridge': self._ws_bridge.get_diagnostics_snapshot(),
            })

        @app.get('/api/v1/ros/params/{key}')
        async def params(request: Request, key: str):
            self._server.authorize_request(request)
            print(f"app.get params for '{key}' - passing for now!", flush=True)
            return self._server.api_success(None)

        @app.get('/api/v1/ros/namespace')
        async def namespace(request: Request):
            self._server.authorize_request(request)
            print(f"requesting namespace '{self.get_namespace()}' !", flush=True)
            return self._server.api_success(self.get_namespace())

        @app.websocket('/ws/ros')
        async def ws_ros():
            print("websocket '/ws/ros' ... pass ", flush=True)

        @app.post('/api/v1/create_action_client')
        async def create_action_client(request: Request,
                                       action_request: ActionClientRequest = Body(...)):
            topic = action_request.topic
            action_type = action_request.action_type
            print(f"Creating action client for '{topic}' ({action_type})", flush=True)
            try:
                self._server.authorize_request(request)
                action_class = self._load_action_class(action_type)
                if topic in self._action_clients:
                    self.destroy_client(self._action_clients[topic]['client'])
                self._action_clients[topic] = {'client': ActionClient(self, action_class, topic),
                                               'class': action_class,
                                               'future': None,
                                               'goal_lock': asyncio.Lock(),
                                               'goal_handle': None,
                                               'result_future': None}
                print(f"Created action client for '{topic}' ({action_class})", flush=True)
                return self._server.api_command_success()
            except (ImportError, AttributeError, IndexError, ValueError, TypeError, RuntimeError) as exc:
                print(f"Failed to create action client for '{topic}' ({action_type}) - {exc}", flush=True)
                return self._server.api_command_failure(exc)

        @app.post('/api/v1/action_schema')
        async def action_schema(request: Request,
                                action_request: ActionSchemaRequest = Body(...)):
            """Return a recursive schema for the given action goal."""
            try:
                self._server.authorize_request(request)
                action_class = self._load_action_class(action_request.action_type)
                goal_msg = action_class.Goal()
                return self._server.api_success({
                    'action_type': action_request.action_type,
                    'goal_fields': self._build_message_schema(goal_msg),
                })
            except (ImportError, AttributeError, IndexError, ValueError, TypeError, RuntimeError) as exc:
                print(f"Failed to build action schema for '{action_request.action_type}' - {exc}", flush=True)
                return self._server.api_failure(str(exc), status_code=400)

        @app.post('/api/v1/send_action_goal')
        async def send_action_goal(request: Request, goal_request: SendActionGoalRequest = Body(...)):
            self._server.authorize_request(request)
            goal = goal_request.goal
            topic = goal_request.topic
            timeout_sec = goal_request.timeout_sec
            print(f"Goal for action client for '{topic}' ", flush=True)
            if topic not in self._action_clients:
                msg = f"Invalid action client topic '{topic}'!"
                print(msg, flush=True)
                return self._server.api_success({'goal_succeeded': False, 'reason': msg})

            goal_lock = self._get_action_goal_lock(topic)
            async with goal_lock:
                return await self._send_action_goal_locked(goal, topic, timeout_sec)

        @app.post('/api/v1/cancel_action_goal')
        async def cancel_action_goal(request: Request, cancel_request: CancelActionGoalRequest = Body(...)):
            self._server.authorize_request(request)
            topic = cancel_request.topic
            if topic not in self._action_clients:
                return self._server.api_success({'canceled': False, 'reason': f"No action client for '{topic}'"})
            canceled = await self._cancel_active_goal(topic, clear_on_timeout=False)
            return self._server.api_success({'canceled': canceled})

        @app.get('/api/v1/action_feedback')
        async def action_feedback(request: Request, topic: str):
            self._server.authorize_request(request)
            validated_topic = validate_ros_topic(topic)
            action_data = self._action_clients.get(validated_topic)
            if action_data is None:
                return self._server.api_success({'feedback': None})
            return self._server.api_success({'feedback': action_data.get('last_feedback')})

        # This block just lists all routes between server and client
        print('\x1b[95mRegistered routes for the FASTApi app.\x1b[0m', flush=True)
        # ----------------------------------------------------------------------------
        # from fastapi.routing import APIRoute
        # for route in app.routes:
        #     if isinstance(route, APIRoute):
        #         print(f"'{route.path}' ({route.methods})")
        #     else:
        #         print(f"'{route.path}' (no methods, possibly a Mount or WebSocket)")
        # print('------------------------------------------------\x1b[0m', flush=True)
        # ----------------------------------------------------------------------------


def main(args: List[str] = None):
    """Run ROS 2 Node and WebUI server."""
    # Initialize ROS node
    rclpy.init(args=args)

    args, _ = parse_args(args)

    try:
        port = int(args.port)
    except (TypeError, ValueError) as exc:
        print(f'  Invalid port = {args.port} - {exc}', flush=True)
        return

    try:
        host = str(args.host)
    except (TypeError, ValueError) as exc:
        print(f'\n  Invalid host = {args.host} - {exc}', flush=True)
        return

    print('\nStarting FlexBE WebUI ROS node with server at '
          f'port={port} logging={args.logging_level}...', flush=True)
    webui_node = WebuiNode(args)
    server = threading.Thread(target=webui_node._server.run, args=(port, host, args.logging_level), daemon=True)
    server.start()
    try:
        rclpy.spin(webui_node)
    except KeyboardInterrupt:
        print(f'Keyboard interrupt request  at {datetime.now()} - ! Shut the flexbe_webui node down!', flush=True)
    except (ExternalShutdownException, ShutdownException, rclpy._rclpy_pybind11.InvalidHandle) as exc:
        if not _is_expected_shutdown_exception(exc):
            raise
        print(f'ROS executor shutdown      at {datetime.now()} - {exc}', flush=True)
    except (RuntimeError, OSError, TypeError, ValueError) as exc:
        print(f'Exception in executor       at {datetime.now()} - ! {type(exc)}\n  {exc}', flush=True)
        import traceback
        print(f"{traceback.format_exc().replace('%', '%%')}", flush=True)
    webui_node._running = False

    try:
        webui_node.destroy_node()
        rclpy.shutdown()
    except rclpy._rclpy_pybind11.RCLError:
        pass
    except (RuntimeError, OSError, TypeError, ValueError) as exc:
        print(f'{type(exc)} - {exc}')

    print('FlexBE WebUI node shutdown!', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f'Keyboard interrupt request  at {datetime.now()} - ! Shut the flexbe_webui node down!', flush=True)
    except BaseException as exc:  # noqa: B902
        if isinstance(exc, (SystemExit, KeyboardInterrupt)):
            raise
        print(f'Exception in executor       at {datetime.now()} - ! {type(exc)}\n  {exc}', flush=True)
        import traceback
        print(f"{traceback.format_exc().replace('%', '%%')}", flush=True)
