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

import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNNER = REPO_ROOT / 'test' / 'frontend_regression_runner.js'


@pytest.mark.parametrize('case_name', [
    'behavior_saver',
    'settings_flows',
    'menu_flows',
    'action_client',
    'render_config',
    'tuple_parameter',
    'dashboard_parameter_edit',
    'runtime_flows',
    'synthesis_payload',
    'synthesis_form',
    'state_panel_flows',
    'api_client',
    'helper_flows',
    'validation_report',
    'events_flows',
    'command_update_behavior',
])
def test_frontend_regressions(case_name):
    """Run frontend regression scenarios without a browser."""
    result = subprocess.run(
        ['node', str(RUNNER), case_name],
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
