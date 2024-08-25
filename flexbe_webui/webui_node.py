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
from datetime import datetime
from typing import Dict, List

from action_msgs.msg import GoalStatus

from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect

from pydantic import BaseModel

import rclpy
import rclpy._rclpy_pybind11
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.qos import QoSDurabilityPolicy, QoSProfile

import rosidl_runtime_py.convert
import rosidl_runtime_py.set_message

import yaml

from .webui_server import WebuiServer, parse_args


class _PublishRequest(BaseModel):
    """Dictionary to hold message to publish."""

    msg: dict


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
        self._websockets = {}
        self.register(self._server._app)
        self._running = True

    def _sub_callback(self, msg, topic):
        """Call on message receipt."""
        if topic not in self._websockets:
            print(f"\x1b[93mUI is offline (socket for '{topic}' does not exist)!\x1b[0m", flush=True)
            return
        try:
            # print(f"Request to post data for '{topic}' ...", flush=True)
            msg_json = json.dumps(yaml.load(rosidl_runtime_py.convert.message_to_yaml(msg),
                                            Loader=yaml.SafeLoader))
            asyncio.run(self._websockets[topic].send_text(msg_json))
        except Exception as exc:
            print(f"\x1b[93mFailed to send data for '{topic}' - {exc}\x1b[0m", flush=True)

    def register(self, app: FastAPI):
        """Register web server resources."""
        @app.post('/api/v1/publish')
        async def publish(req: Dict = Body(...), topic: str = Body(...)):
            """Publish message from UI."""
            try:
                # print(f"Request to publish data for '{topic}' ", flush=True)
                pub_data = self._pub_data[topic]
                publisher = pub_data['publisher']
                msg = pub_data['msg_class']()
                rosidl_runtime_py.set_message.set_message_fields(msg, req)
                publisher.publish(msg)
                return True
            except Exception as exc:
                print(f"\x1b[91mFailed to publish '{topic}' - {exc}\n{req}\x1b[0m", flush=True)
                return False

        @app.post('/api/v1/create_publisher')
        async def create_pub(topic: str = Body(...),
                             msg_type: str = Body(...),
                             latched: bool = Body(...)):
            """Create ROS 2 publisher."""
            print(f"\x1b[92mCreating publisher for '{topic}' ({msg_type}) latched={latched}\x1b[0m", flush=True)
            try:
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
                return True
            except Exception as exc:
                print(f"Failed to create publisher for '{topic}' - {exc}", flush=True)
                return False

        @app.post('/api/v1/close_publisher')
        async def close_pub(topic: str = Body(...)):
            """Close ROS 2 publisher."""
            try:
                if topic in self._pub_data:
                    self.destroy_publisher(self._pub_data[topic]['publisher'])
                    self._pub_data.pop(topic)
                    print(f"\x1b[91mClosed publisher for '{topic}' \x1b[0m", flush=True)
                else:
                    print(f"\x1b[95mRequest to close publisher for '{topic}' that is not active!\x1b[0m", flush=True)
                return True
            except Exception as exc:
                print(f"Failed to remove publisher for '{topic}' - {exc}", flush=True)
                return False

        @app.post('/api/v1/create_subscriber')
        async def create_sub(topic: str = Body(...), msg_type: str = Body(...)):
            """Create ROS subscription."""
            try:
                msg_def = msg_type.split('/')
                msg_pkg = msg_def[0]
                msg_name = msg_def[1]
                msg_module = importlib.import_module(f'{msg_pkg}.msg')
                msg_class = getattr(msg_module, msg_name)

                # Note: This presumes all relevant FlexBE topics have default QoS!
                self._sub_data[topic] = self.create_subscription(msg_class, topic, lambda msg: self._sub_callback(msg, topic), 10)
                print(f"\x1b[92mCreated subscriber for '{topic}' ({msg_type}) \x1b[0m", flush=True)
                return True
            except Exception as exc:
                print(f"\x1b[91mFailed to create subscriber for '{topic}' - {exc}\x1b[0m", flush=True)
                return False

        @app.post('/api/v1/close_subscriber')
        async def close_sub(topic: str = Body(...)):
            """Close ROS subscription."""
            try:
                if topic in self._sub_data:
                    self.destroy_subscription(self._sub_data[topic])
                    self._sub_data.pop(topic)
                    print(f"\x1b[91mRemoved subscriber for '{topic}' \x1b[0m", flush=True)
                else:
                    print(f"\x1b[95mRequest to close subscriber for '{topic}' that is not active!\x1b[0m", flush=True)
                return True
            except Exception as exc:
                print(f"\x1b[91mFailed to remove subscriber for '{topic}' - {exc}\x1b[0m", flush=True)
                return False

        @app.websocket('/ws/{topic}')
        async def websocket_endpoint(websocket: WebSocket, topic: str):

            await websocket.accept()
            print(f"accepted websocket for '{topic}'", flush=True)
            topic = topic.replace('-', '/')
            self._websockets[topic] = websocket

            try:
                while self._running:
                    data = await websocket.receive()
                    if 'type' in data and data['type'] == 'websocket.disconnect':
                        # print(f"Websocket disconnect received for '{topic}'")
                        break
                    # print(f"Received data from websocket for '{topic}' - {data}")
            except WebSocketDisconnect as exc:
                print(f"flexbe_webui_node: '{topic}' - WebSocket disconnected! ({exc})", flush=True)
            except RuntimeError as exc:
                print(f"flexbe_webui_node: '{topic}' - {exc}", flush=True)

            if topic in self._websockets:
                # print(f"Remove websocket for '{topic}' !", flush=True)
                del self._websockets[topic]

            # print(f"finished with websocket for '{topic}' !", flush=True)

        @app.get('/api/v1/ros/params/{key}')
        async def params(key: str):
            print(f"app.get params for '{key}' - passing for now!", flush=True)

        @app.get('/api/v1/ros/namespace')
        async def namespace():
            print(f"requesting namespace '{self.get_namespace()}' !", flush=True)
            return self.get_namespace()

        @app.websocket('/ws/ros')
        async def ws_ros():
            print("websocket '/ws/ros' ... pass ", flush=True)

        @app.post('/api/v1/create_action_client')
        async def create_action_client(topic: str = Body(...),
                                       action_type: str = Body(...)):
            print(f"Creating action client for '{topic}' ({action_type})", flush=True)
            try:
                action_def = action_type.split('/')
                action_pkg = action_def[0]
                action_name = action_def[1]
                action_module = importlib.import_module(f'{action_pkg}.action')
                action_class = getattr(action_module, action_name)
                self._action_clients[topic] = {'client': ActionClient(self, action_class, topic),
                                               'class': action_class,
                                               'future': None}
                print(f"Created action client for '{topic}' ({action_class})", flush=True)
                return True
            except Exception as exc:
                print(f"Failed to create action client for '{topic}' ({action_type}) - {exc}", flush=True)
                return False

        @app.post('/api/v1/send_action_goal')
        async def send_action_goal(goal: Dict = Body(...), topic: str = Body(...)):
            print(f"Goal for action client for '{topic}' ", flush=True)
            if topic not in self._action_clients:
                msg = f"Invalid action client topic '{topic}'!"
                print(msg, flush=True)
                return {'success': False, 'reason': msg}

            if self._action_clients[topic]['future']:
                print(f"Already have an active goal for '{topic}'", flush=True)
                self._action_clients[topic]['future'] = None  # @todo - fix this with cancel

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
                        if isinstance(value, dict):
                            recursive_set_msg_attr(getattr(msg, key), value)
                        else:
                            setattr(msg, key, value)

                recursive_set_msg_attr(goal_msg, goal)
                print(f'Goal msg: {goal_msg}', flush=True)
            except Exception as exc:
                msg = f"Invalid goal set for '{topic}' - {exc}"
                print(msg, flush=True)
                return {'success': False, 'reason': str(exc)}

            # @todo - make timeout configurable
            if self._action_clients[topic]['client'].wait_for_server(timeout_sec=0.25):
                print(f" Send goal to '{topic}' ...", flush=True)
                try:
                    self._action_clients[topic]['future'] = \
                        self._action_clients[topic]['client'].send_goal_async(goal_msg)
                except Exception as exc:
                    print(f'Error: {exc}', flush=True)
                    return {'success': False, 'reason': str(exc)}
            else:
                msg = f"Action server is not available for '{topic}'"
                print(msg, flush=True)
                return {'success': False, 'reason': msg}

            if self._action_clients[topic]['future']:
                print(f"Waiting on future goal handle from '{topic}' ...", flush=True)
                try:
                    future = self._action_clients[topic]['future']
                    while rclpy.ok() and not future.done():
                        await asyncio.sleep(0.01)

                    goal_handle = future.result()
                    if not goal_handle.accepted:
                        return {'success': False, 'reason': 'Goal rejected!'}

                    print(f"Waiting on future result from '{topic}' gh={goal_handle} ...", flush=True)
                    result_future = goal_handle.get_result_async()
                    while rclpy.ok() and not result_future.done():
                        await asyncio.sleep(0.01)

                    result = result_future.result()
                    self._action_clients[topic]['future'] = None
                    if result.status == GoalStatus.STATUS_SUCCEEDED:
                        print(f"Goal '{topic}' succeeded!", flush=True)
                        result_json = json.dumps(yaml.load(rosidl_runtime_py.convert.message_to_yaml(result.result),
                                                 Loader=yaml.SafeLoader))
                        return {'success': True, 'result': result_json}
                    elif result.status == GoalStatus.STATUS_CANCELED:
                        print(f"Goal '{topic}' was canceled!", flush=True)
                        return {'success': False, 'reason': 'Goal was canceled!'}
                    else:
                        print(f"Goal '{topic}' was not successful ({result.status})!", flush=True)
                        return {'success': False, 'reason': "Did not success : Goal status='{result.status}'"}
                except Exception as exc:
                    print(f'Error: {exc}', flush=True)
                    return {'success': False, 'reason': 'failed to retrieve future: ' + str(exc)}

            return {'success': False, 'reason': 'Invalid goal future!'}

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
    except Exception as exc:
        print(f'  Invalid port = {args.port} - {exc}', flush=True)
        return

    print('\nStarting FlexBE WebUI ROS node with server at '
          f'port={port} logging={args.logging_level}...', flush=True)
    webui_node = WebuiNode(args)
    server = threading.Thread(target=webui_node._server.run, args=(port, args.logging_level), daemon=True)
    server.start()
    try:
        rclpy.spin(webui_node)
    except KeyboardInterrupt:
        print(f'Keyboard interrupt request  at {datetime.now()} - ! Shut the flexbe_webui node down!', flush=True)
    except Exception as exc:
        print(f'Exception in executor       at {datetime.now()} - ! {type(exc)}\n  {exc}', flush=True)
        import traceback
        print(f"{traceback.format_exc().replace('%', '%%')}", flush=True)
    webui_node._running = False

    try:
        webui_node.destroy_node()
        rclpy.shutdown()
    except rclpy._rclpy_pybind11.RCLError:
        pass
    except Exception as exc:
        print(f'{type(exc)} - {exc}')

    print('FlexBE WebUI node shutdown!', flush=True)


if __name__ == '__main__':
    main()
