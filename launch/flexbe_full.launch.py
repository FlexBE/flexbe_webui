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

"""Launch file for full FlexBE system (Onboard and OCS) for single computer use."""

from ament_index_python.packages import get_package_share_directory

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration


def generate_launch_description():
    """Generate launch description for full FlexBE system (Onboard and OCS) running in one terminal."""
    flexbe_webui_dir = get_package_share_directory('flexbe_webui')
    flexbe_onboard_dir = get_package_share_directory('flexbe_onboard')

    return LaunchDescription([
        DeclareLaunchArgument('log_enabled', default_value='False'),
        DeclareLaunchArgument('log_folder', default_value='~/.flexbe_logs'),
        DeclareLaunchArgument('log_serialize', default_value='yaml'),
        DeclareLaunchArgument('log_level', default_value='INFO'),
        DeclareLaunchArgument('use_sim_time', default_value='False'),
        DeclareLaunchArgument('enable_clear_imports', default_value='False',
                              description='Delete behavior-specific module imports after execution.'),
        DeclareLaunchArgument('client_delay', default_value='2.0',
                              description='Delay launch of client until the server is fully started.'),

        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(flexbe_webui_dir + '/launch/flexbe_ocs.launch.py'),
            launch_arguments={
                'offline': 'false',
                'use_sim_time': LaunchConfiguration('use_sim_time'),
                'client_delay': LaunchConfiguration('client_delay')
            }.items()
        ),

        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(flexbe_onboard_dir + '/behavior_onboard.launch.py'),
            launch_arguments={
                'log_enabled': LaunchConfiguration('log_enabled'),
                'log_folder': LaunchConfiguration('log_folder'),
                'log_serialize': LaunchConfiguration('log_serialize'),
                'log_level': LaunchConfiguration('log_level'),
                'enable_clear_imports': LaunchConfiguration('enable_clear_imports'),
                'use_sim_time': LaunchConfiguration('use_sim_time')
            }.items()
        )
    ])
