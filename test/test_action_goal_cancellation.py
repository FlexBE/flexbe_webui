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

import flexbe_webui.webui_node as webui_node
from flexbe_webui.webui_node import WebuiNode

import pytest


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

    __slots__ = ['spec_name', 'system_name', 'goals', 'initial_conditions', 'sm_outcomes', 'specification_file_name']

    def __init__(self):
        self.spec_name = ''
        self.system_name = ''
        self.goals = ''
        self.initial_conditions = ''
        self.sm_outcomes = []
        self.specification_file_name = ''

    @staticmethod
    def get_fields_and_field_types():
        """Return message field metadata."""
        return {
            'spec_name': 'string',
            'system_name': 'string',
            'goals': 'string',
            'initial_conditions': 'string',
            'sm_outcomes': 'sequence<string>',
            'specification_file_name': 'string',
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
                {'name': 'goals', 'type': 'string', 'kind': 'string'},
                {'name': 'initial_conditions', 'type': 'string', 'kind': 'string'},
                {
                    'name': 'sm_outcomes',
                    'type': 'sequence<string>',
                    'kind': 'sequence',
                    'element_kind': 'string',
                    'element_type': 'string',
                },
                {'name': 'specification_file_name', 'type': 'string', 'kind': 'string'},
            ],
        },
        {
            'name': 'synthesis_options',
            'type': 'string',
            'kind': 'string',
        },
    ]
