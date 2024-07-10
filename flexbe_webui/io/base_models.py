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

"""Base model class."""

from typing import List, Optional

from pydantic import BaseModel


class State(BaseModel):
    """Class to hold state information."""

    state_name: str
    state_class: str
    state_import: str
    state_pkg: str
    state_path: str
    behavior: Optional[str] = None
    parameters: List[str] = []
    parameter_values: List[str] = []
    outcomes: List[str] = []
    autonomy: List[int] = []
    meta_outcomes: List[str] = []
    outcomes_unc: List[str] = []
    outcomes_con: List[str] = []
    input_keys: List[str] = []
    output_keys: List[str] = []
    meta_input: List[str] = []
    meta_output: List[str] = []
    input_mapping: List[str] = []
    output_mapping: List[str] = []
    position_x: float
    position_y: float
    # container: dict | None = None
    container: Optional[dict] = None
    resolved_parameter_outcome_values_old: List[object] = []  # mostly str or list of strings
    resolved_parameter_input_values_old: List[object] = []    # mostly str or list of strings
    resolved_parameter_output_values_old: List[object] = []   # mostly str or list of strings
    behavior_state: bool
    state_machine: bool


class Transition(BaseModel):
    """Class to hold transition information."""

    from_state: State
    to: State
    outcome: str
    autonomy: int
    # x: int | None = None
    # y: int | None = None
    # beg_x: int | None = None
    # beg_y: int | None = None
    # end_x: int | None = None
    # end_y: int | None = None
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
