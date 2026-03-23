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
import importlib
import json
import threading
from collections import deque
from concurrent.futures import Future
from datetime import datetime
from typing import Dict, List

from action_msgs.msg import GoalStatus

from fastapi import Body, FastAPI, Request, WebSocket, WebSocketDisconnect

from pydantic import BaseModel

import rclpy
import rclpy._rclpy_pybind11
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.qos import QoSDurabilityPolicy, QoSProfile

import rosidl_runtime_py.convert
import rosidl_runtime_py.set_message

import yaml

from .io.base_models import ActionClientRequest, ActionSchemaRequest, SendActionGoalRequest
from .webui_server import WebuiServer, parse_args


class _PublishRequest(BaseModel):
    """Dictionary to hold message to publish."""

    msg: dict


class _RosWebsocketBridge:
    """Bridge ROS subscriber callbacks to websocket clients."""

    def __init__(self):
        """Initialize bridge state."""
        self._websockets = {}  # topic -> (websocket, loop)
        self._websocket_lock = threading.Lock()
        self._diag_lock = threading.Lock()
        self._send_failures = 0
        self._send_successes = 0
        self._recent_failures = deque(maxlen=100)

    def publish_msg(self, topic, msg):
        """Serialize and forward ROS messages to an active websocket topic."""
        with self._websocket_lock:
            entry = self._websockets.get(topic)

        if entry is None:
            print(f"\x1b[93mUI is offline (socket for '{topic}' does not exist)!\x1b[0m", flush=True)
            return
        websocket, websocket_loop = entry

        try:
            msg_json = json.dumps(yaml.load(rosidl_runtime_py.convert.message_to_yaml(msg), Loader=yaml.SafeLoader))
            send_future = asyncio.run_coroutine_threadsafe(websocket.send_text(msg_json), websocket_loop)

            def _log_send_failure(future: Future):
                try:
                    future.result()
                    with self._diag_lock:
                        self._send_successes += 1
                except (RuntimeError, OSError, ValueError, TypeError) as exc:
                    with self._diag_lock:
                        self._send_failures += 1
                        self._recent_failures.append({
                            'ts': datetime.now().isoformat(timespec='seconds'),
                            'topic': topic,
                            'error': str(exc),
                        })
                    print(f"\x1b[93mFailed to send data for '{topic}' - {exc}\x1b[0m", flush=True)

            send_future.add_done_callback(_log_send_failure)
        except (RuntimeError, OSError, ValueError, TypeError, KeyError, yaml.YAMLError) as exc:
            with self._diag_lock:
                self._send_failures += 1
                self._recent_failures.append({
                    'ts': datetime.now().isoformat(timespec='seconds'),
                    'topic': topic,
                    'error': str(exc),
                })
            print(f"\x1b[93mFailed to send data for '{topic}' - {exc}\x1b[0m", flush=True)

    async def handle_websocket(self, websocket: WebSocket, raw_topic: str, running_check):
        """Register websocket and keep receiving until disconnect/shutdown."""
        await websocket.accept()
        print(f"accepted websocket for '{raw_topic}'", flush=True)
        topic = raw_topic.replace('-', '/')
        with self._websocket_lock:
            self._websockets[topic] = (websocket, asyncio.get_running_loop())

        try:
            while running_check():
                data = await websocket.receive()
                if 'type' in data and data['type'] == 'websocket.disconnect':
                    break
        except WebSocketDisconnect as exc:
            print(f"flexbe_webui_node: '{topic}' - WebSocket disconnected! ({exc})", flush=True)
        except RuntimeError as exc:
            print(f"flexbe_webui_node: '{topic}' - {exc}", flush=True)
        finally:
            with self._websocket_lock:
                if topic in self._websockets:
                    del self._websockets[topic]

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
        self._ws_bridge = _RosWebsocketBridge()
        self.register(self._server._app)
        self._running = True

    def _sub_callback(self, msg, topic):
        """Call on message receipt."""
        self._ws_bridge.publish_msg(topic, msg)

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

        if field_type.startswith('sequence<') or field_type.startswith('bounded_sequence<'):
            if isinstance(value, list):
                return value
            if isinstance(value, tuple):
                return list(value)
            return [value]
        return value

    def _get_server_timeout(self) -> float:
        """Return the configured action server wait timeout."""
        try:
            if self._server is not None and hasattr(self._server, '_settings'):
                return float(self._server._settings.get('server_timeout', 0.25))
        except (AttributeError, TypeError, ValueError):
            pass
        return 0.25

    async def _cancel_active_goal(self, topic: str) -> bool:
        """Cancel any active goal for the given action topic."""
        action_data = self._action_clients.get(topic)
        if action_data is None:
            return False

        future = action_data.get('future')
        goal_handle = action_data.get('goal_handle')

        if future is None and goal_handle is None:
            return False

        try:
            if goal_handle is None and future is not None:
                while rclpy.ok() and not future.done():
                    await asyncio.sleep(0.01)

                goal_handle = future.result()
                action_data['goal_handle'] = goal_handle
        except (RuntimeError, TypeError, ValueError, AttributeError) as exc:
            print(f"Failed to retrieve active goal handle for '{topic}' - {exc}", flush=True)
            action_data['future'] = None
            action_data['goal_handle'] = None
            action_data['result_future'] = None
            return False

        if goal_handle is None or not getattr(goal_handle, 'accepted', False):
            action_data['future'] = None
            action_data['goal_handle'] = None
            action_data['result_future'] = None
            return False

        try:
            cancel_future = goal_handle.cancel_goal_async()
            while rclpy.ok() and not cancel_future.done():
                await asyncio.sleep(0.01)

            cancel_response = cancel_future.result()
            canceled = bool(getattr(cancel_response, 'goals_canceling', []))
            if not canceled:
                print(f"Action goal for '{topic}' did not acknowledge cancellation.", flush=True)
                return False
            print(f"Canceled existing goal for '{topic}'", flush=True)
            return True
        except (RuntimeError, TypeError, ValueError, AttributeError) as exc:
            print(f"Failed to cancel active goal for '{topic}' - {exc}", flush=True)
            return False
        finally:
            action_data['future'] = None
            action_data['goal_handle'] = None
            action_data['result_future'] = None

    def register(self, app: FastAPI):
        """Register web server resources."""
        @app.post('/api/v1/publish')
        async def publish(request: Request, req: Dict = Body(...), topic: str = Body(...)):
            """Publish message from UI."""
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
        async def create_pub(request: Request,
                             topic: str = Body(...),
                             msg_type: str = Body(...),
                             latched: bool = Body(...)):
            """Create ROS 2 publisher."""
            print(f"\x1b[92mCreating publisher for '{topic}' ({msg_type}) latched={latched}\x1b[0m", flush=True)
            try:
                self._server.authorize_request(request)
                msg_def = msg_type.split('/')
                msg_pkg = msg_def[0]
                msg_name = msg_def[1]
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
        async def close_pub(request: Request, topic: str = Body(...)):
            """Close ROS 2 publisher."""
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
        async def create_sub(request: Request, topic: str = Body(...), msg_type: str = Body(...)):
            """Create ROS subscription."""
            try:
                self._server.authorize_request(request)
                msg_def = msg_type.split('/')
                msg_pkg = msg_def[0]
                msg_name = msg_def[1]
                msg_module = importlib.import_module(f'{msg_pkg}.msg')
                msg_class = getattr(msg_module, msg_name)

                # Note: This presumes all relevant FlexBE topics have default QoS!
                self._sub_data[topic] = self.create_subscription(msg_class, topic, lambda msg: self._sub_callback(msg, topic), 10)
                print(f"\x1b[92mCreated subscriber for '{topic}' ({msg_type}) \x1b[0m", flush=True)
                return self._server.api_command_success()
            except (ImportError, AttributeError, IndexError, ValueError, TypeError, RuntimeError) as exc:
                print(f"\x1b[91mFailed to create subscriber for '{topic}' - {exc}\x1b[0m", flush=True)
                return self._server.api_command_failure(exc)

        @app.post('/api/v1/close_subscriber')
        async def close_sub(request: Request, topic: str = Body(...)):
            """Close ROS subscription."""
            try:
                self._server.authorize_request(request)
                if topic in self._sub_data:
                    self.destroy_subscription(self._sub_data[topic])
                    self._sub_data.pop(topic)
                    print(f"\x1b[91mRemoved subscriber for '{topic}' \x1b[0m", flush=True)
                else:
                    print(f"\x1b[95mRequest to close subscriber for '{topic}' that is not active!\x1b[0m", flush=True)
                return self._server.api_command_success()
            except (KeyError, RuntimeError, ValueError, TypeError) as exc:
                print(f"\x1b[91mFailed to remove subscriber for '{topic}' - {exc}\x1b[0m", flush=True)
                return self._server.api_command_failure(exc)

        @app.websocket('/ws/{topic}')
        async def websocket_endpoint(websocket: WebSocket, topic: str):
            await self._ws_bridge.handle_websocket(websocket, topic, lambda: self._running)

        @app.get('/api/v1/dev/diagnostics/node')
        async def diagnostics_node():
            """Return ROS/websocket bridge diagnostics."""
            return self._server.api_success({
                'generated_at': datetime.now().isoformat(timespec='seconds'),
                'publishers_active': len(self._pub_data),
                'subscribers_active': len(self._sub_data),
                'action_clients_active': len(self._action_clients),
                'websocket_bridge': self._ws_bridge.get_diagnostics_snapshot(),
            })

        @app.get('/api/v1/ros/params/{key}')
        async def params(key: str):
            print(f"app.get params for '{key}' - passing for now!", flush=True)
            return self._server.api_success(None)

        @app.get('/api/v1/ros/namespace')
        async def namespace():
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
                return self._server.api_failure(str(exc), 400)

        @app.post('/api/v1/send_action_goal')
        async def send_action_goal(request: Request, goal_request: SendActionGoalRequest = Body(...)):
            self._server.authorize_request(request)
            goal = goal_request.goal
            topic = goal_request.topic
            print(f"Goal for action client for '{topic}' ", flush=True)
            if topic not in self._action_clients:
                msg = f"Invalid action client topic '{topic}'!"
                print(msg, flush=True)
                return self._server.api_success({'goal_succeeded': False, 'reason': msg})

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
                try:
                    self._action_clients[topic]['future'] = \
                        self._action_clients[topic]['client'].send_goal_async(goal_msg)
                    self._action_clients[topic]['goal_handle'] = None
                    self._action_clients[topic]['result_future'] = None
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
                    while rclpy.ok() and not future.done():
                        await asyncio.sleep(0.01)

                    goal_handle = future.result()
                    self._action_clients[topic]['goal_handle'] = goal_handle
                    if not goal_handle.accepted:
                        self._action_clients[topic]['future'] = None
                        self._action_clients[topic]['goal_handle'] = None
                        return self._server.api_success({'goal_succeeded': False, 'reason': 'Goal rejected!'})

                    print(f"Waiting on future result from '{topic}' gh={goal_handle} ...", flush=True)
                    result_future = goal_handle.get_result_async()
                    self._action_clients[topic]['result_future'] = result_future
                    while rclpy.ok() and not result_future.done():
                        await asyncio.sleep(0.01)

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
