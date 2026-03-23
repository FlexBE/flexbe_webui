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

"""Base model classes."""

import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, root_validator, validator

_ROS_ACTION_TYPE_RE = re.compile(r'^[A-Za-z][A-Za-z0-9_]*/[A-Za-z][A-Za-z0-9_]*$')


class State(BaseModel):
    """Class to hold state information."""

    state_name: str
    state_class: str
    state_import: str
    state_pkg: str
    state_path: str
    behavior: Optional[str] = None
    parameters: List[str] = []
    parameter_values: List[Optional[str]] = []
    outcomes: List[str] = []
    autonomy: List[int] = []
    meta_outcomes: List[str] = []
    outcomes_unc: List[str] = []
    outcomes_con: List[str] = []
    input_keys: List[str] = []
    output_keys: List[str] = []
    meta_input: List[str] = []
    meta_output: List[str] = []
    input_mapping: List[Optional[str]] = []
    output_mapping: List[Optional[str]] = []
    position_x: float
    position_y: float
    # container: dict | None = None
    container: Optional[dict] = None
    resolved_parameter_outcome_values_old: List[object] = []  # mostly str or list of strings
    resolved_parameter_input_values_old: List[object] = []    # mostly str or list of strings
    resolved_parameter_output_values_old: List[object] = []   # mostly str or list of strings
    behavior_state: bool
    state_machine: bool

    @root_validator(skip_on_failure=True)
    def _validate_parallel_list_lengths(cls, values):
        """Ensure parallel lists have matching lengths to prevent IndexError in code generation."""
        state_name = values.get('state_name', 'unknown')
        pairs = [
            ('parameter_values', 'parameters'),
            ('autonomy', 'outcomes'),
            ('input_mapping', 'input_keys'),
            ('output_mapping', 'output_keys'),
        ]
        for name_a, name_b in pairs:
            list_a = values.get(name_a, [])
            list_b = values.get(name_b, [])
            if len(list_a) != len(list_b):
                raise ValueError(
                    f"State '{state_name}': '{name_a}' length {len(list_a)}"
                    f" does not match '{name_b}' length {len(list_b)}"
                )
        return values


class Transition(BaseModel):
    """Class to hold transition information."""

    from_state_name: str
    to_state_name: str
    to_state_class: str
    outcome: str
    autonomy: int
    x: Optional[float] = None
    y: Optional[float] = None
    beg_x: Optional[float] = None
    beg_y: Optional[float] = None
    end_x: Optional[float] = None
    end_y: Optional[float] = None


class StateMachine(State):
    """Class to hold state machine information."""

    states: Optional[List['StateMachine']] = None
    transitions: Optional[List[Transition]] = None
    dataflow: Optional[List[Transition]] = None
    concurrent: Optional[bool] = None
    priority: Optional[bool] = None
    initial_state: Optional[State] = None
    sm_outcomes: Optional[List[State]] = None
    conditions: Optional[dict] = None


class Comment(BaseModel):
    """Class to hold comment information."""

    content: str
    position_x: int
    position_y: int
    container_path: str
    is_collapsed: bool
    is_important: bool


class Behavior(BaseModel):
    """Class to hold behavior information."""

    behavior_name: str
    behavior_package: str
    behavior_description: str
    tags: str
    author: str
    creation_date: str
    private_variables: List[dict] = []  # {key value}
    default_userdata: List[dict] = []  # {key value}
    private_functions: List[dict] = []  # {name params}
    behavior_parameters: List[dict] = []  # {type name default label hint additional}
    interface_outcomes: List[str] = []
    interface_input_keys: List[str] = []
    interface_output_keys: List[str] = []
    comment_notes: List[Comment] = []
    root_sm: StateMachine
    file_name: Optional[str] = None
    manifest_path: Optional[str] = None
    readonly: bool
    manual_code_import: List[str] = []
    manual_code_init: str
    manual_code_create: str
    manual_code_func: str


class FileRequest(BaseModel):
    """Request model for source-view operations."""

    package: str
    file: str
    manifest_path: Optional[str] = None


class OpenFileEditorRequest(FileRequest):
    """Request model for editor-open operations."""

    line: Optional[str] = ''


class BehaviorCodeGeneratorRequest(BaseModel):
    """Request model for behavior code generation."""

    ws: str
    package_name: str
    file_name: str
    save_as: bool = False
    explicit_package: bool
    behavior_names: List[str]
    behavior: Dict[str, Any]


class ActionClientRequest(BaseModel):
    """Request model for action client creation."""

    topic: str
    action_type: str

    @validator('action_type')
    def validate_action_type(cls, v):
        """Validate action_type is a safe 'package/ActionName' string."""
        if not _ROS_ACTION_TYPE_RE.match(v):
            raise ValueError(f"action_type must be 'package/ActionName', got: {v!r}")
        return v


class ActionSchemaRequest(BaseModel):
    """Request model for action schema introspection."""

    action_type: str

    @validator('action_type')
    def validate_action_type(cls, v):
        """Validate action_type is a safe 'package/ActionName' string."""
        if not _ROS_ACTION_TYPE_RE.match(v):
            raise ValueError(f"action_type must be 'package/ActionName', got: {v!r}")
        return v


class SendActionGoalRequest(BaseModel):
    """Request model for action goal submission."""

    goal: Dict[str, Any]
    topic: str
