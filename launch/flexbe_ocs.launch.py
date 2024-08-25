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

"""Generate launch description for full FlexBE OCS system."""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.conditions import UnlessCondition
from launch.substitutions import LaunchConfiguration

from launch_ros.actions import Node


def generate_launch_description():
    """Generate launch description for full FlexBE OCS system."""
    offline = DeclareLaunchArgument('offline',
                                    description='Treat FlexBE WebUI as an offline editor (default=false (online))',
                                    default_value='false')

    headless = DeclareLaunchArgument('headless',
                                     description='Launch without UI (default=false)',
                                     default_value='false')

    config_folder = DeclareLaunchArgument('config_folder',
                                          description='FlexBE WebUI Server configuration file folder'
                                                      " (default='' use 'flexbe_webui/config')",
                                          default_value=''
                                          )

    config_file = DeclareLaunchArgument('config_file',
                                        description="FlexBE configuration file to load ('' for default settings)",
                                        default_value=''
                                        )
    port = DeclareLaunchArgument('port', description="FlexBE WebUI Server port (default='8000')",
                                 default_value='8000'
                                 )

    clear_cache = DeclareLaunchArgument('clear_cache',
                                        description='Clear existing package data cache and reprocess',
                                        default_value='false')

    use_sim_time = DeclareLaunchArgument('use_sim_time', default_value='false')

    client_delay = DeclareLaunchArgument('client_delay',
                                         description='Delay launch of client until the server is fully started.',
                                         default_value='1.0')

    def start_webui(context, *args, **kwargs):
        """Run this OpaqueFunction after context defined."""
        offline = LaunchConfiguration('offline').perform(context).lower()
        config_folder = LaunchConfiguration('config_folder').perform(context)
        config_file = LaunchConfiguration('config_file').perform(context)
        port = LaunchConfiguration('port').perform(context)
        clear_cache = LaunchConfiguration('clear_cache').perform(context)
        print('Setting up launch for FlexBE WebUI')
        print(f"    offline      : '{offline}'")
        print(f"    config_folder: '{config_folder}'")
        print(f"    config_file  : '{config_file}'")
        print(f"    port         : '{port}'")
        print(f"    clear_cache  : '{clear_cache}'")

        node_args = []
        if config_folder != '':
            node_args += ['--config_folder', config_folder]
        if config_file != '':
            node_args += ['--config_file', config_file]
        if port != '':
            node_args += ['--port', port]
        if clear_cache.lower() == 'true':
            node_args += ['--clear_cache', 'true']

        if offline.lower() == 'true':
            # Launch either node or server but not both based on the offline argument (default false to launch online node)
            print(f'Launching offline FlexBE WebUI Server with {node_args}')
            return [Node(name='flexbe_webui_server', package='flexbe_webui', executable='webui_server',
                         output='screen', arguments=node_args
                         )
                    ]
        else:
            print(f'Launching online FlexBE WebUI Server node with {node_args}')
            return [Node(name='flexbe_webui_node', package='flexbe_webui', executable='webui_node',
                         output='screen',
                         arguments=node_args
                         )
                    ]

    behavior_mirror = Node(name='behavior_mirror', package='flexbe_mirror',
                           executable='behavior_mirror_sm',
                           condition=UnlessCondition(LaunchConfiguration('offline')))

    behavior_launcher = Node(name='behavior_launcher', package='flexbe_widget',
                             executable='be_launcher', output='screen',
                             condition=UnlessCondition(LaunchConfiguration('offline')))

    # opens web browser in a new window  (-t instead of -n opens in existing broswer in new tab)
    # webui_client = ExecuteProcess(cmd=['python3', '-m', 'webbrowser', '-n', 'http://127.0.0.1:8000'])
    webui_client = Node(name='flexbe_webui_client', package='flexbe_webui',
                        executable='webui_client',
                        arguments=['--port', LaunchConfiguration('port'), '--client_delay', LaunchConfiguration('client_delay')],
                        output='screen',
                        condition=UnlessCondition(LaunchConfiguration('headless')))

    return LaunchDescription([
        offline,
        use_sim_time,
        headless,
        config_folder,
        config_file,
        port,
        clear_cache,
        behavior_mirror,
        client_delay,
        OpaqueFunction(function=start_webui),
        behavior_launcher,
        webui_client
    ])
