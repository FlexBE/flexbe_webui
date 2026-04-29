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

"""Browser-free frontend regression tests executed through Node.js."""

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNNER = REPO_ROOT / 'test' / 'frontend_regression_runner.js'
NODE = shutil.which('node')

pytestmark = pytest.mark.skipif(
    NODE is None,
    reason='node is required for frontend regression tests',
)


@pytest.mark.parametrize('case_name', [
    'behavior_saver',
    'settings_flows',
    'menu_flows',
    'action_client',
    'render_config',
    'tuple_parameter',
    'dashboard_parameter_edit',
    'dashboard_outcome_collision',
    'dashboard_outcome_undo',
    'dashboard_interface_key_flows',
    'model_generator_interface_validation',
    'behavior_interface_key_rename',
    'behavior_interface_outcome_rename',
    'behavior_structure_outcome_copy',
    'runtime_flows',
    'synthesis_payload',
    'synthesis_form',
    'state_panel_flows',
    'state_panel_duplicate_guards',
    'api_client',
    'helper_flows',
    'validation_report',
    'events_flows',
    'command_update_behavior',
    'outcome_copy_comment_encoding',
    'outcome_copy_build_roundtrip',
    'outcome_copy_reconnect_undo',
    'outcome_copy_remove_undo',
    'outcome_copy_single_spare',
    'outcome_copy_container_outcome_undo',
    'tools_outcome_copy_paste',
    'tools_outcome_copy_paste_history',
    'tools_outcome_copy_cut_history',
])
def test_frontend_regressions(case_name):
    """Run frontend regression scenarios without a browser."""
    result = subprocess.run(
        [NODE, str(RUNNER), case_name],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, (
        f'frontend regression case failed: {case_name}\n'
        f'stdout:\n{result.stdout}\n'
        f'stderr:\n{result.stderr}'
    )
