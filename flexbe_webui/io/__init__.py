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

"""Initialization of flexbe_webui.io python module."""

from typing import Any, List, Optional, Union

from pydantic import BaseModel


class StateDefinition(BaseModel):
    """State definition information."""

    state_class: str
    state_docstring: str
    import_path: str
    file_path: str
    state_params: List[str]
    state_outcomes: Union[List[str], str]
    state_input: Union[List[str], str]
    state_output: Union[List[str], str]
    state_params_values: List[str]
    state_autonomy: List[int]
    class_vars: List[str]


class BehaviorDefinition(BaseModel):
    """Behavior definition information."""

    name: str
    description: str
    tags: str
    author: str
    rosnode_name: str
    codefile_name: str
    codefile_path: str
    codefile_content: str
    class_name: str
    manifest_path: str
    editable: bool = False
    params: List[Any] = []
    contains: List[str] = []
    date: Optional[str] = None
    state_definition: Optional[StateDefinition] = None


class ParameterDefinition(BaseModel):
    """Parameter definition information."""

    type: str
    name: str
    default: str
    label: Optional[str] = None
    hint: Optional[str] = None
    additional: Optional[dict] = None
