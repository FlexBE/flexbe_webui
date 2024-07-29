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

"""Behavior code generator."""

import datetime
import re

from flexbe_webui.tools import left_align_block, format_state_code_string, break_long_line


class CodeGenerator:
    """Behavior Code Generator."""

    def __init__(self, ws='    ', target_line_length=100):
        """Initialize behavior generator."""
        self.manual = ['', '', '', '']  # [manual_code_import, manual_code_init, manual_code_create, manual_code_func]
        self.ws = ws
        self.target_line_length = target_line_length
        self.state_init_list = []
        self.sm_counter = 0
        self.sm_names = []
        self.explicit_package = False

        self.author = None
        self.creation_date = None

    def set_white_space(self, _ws):
        """Set the white space characters."""
        self.ws = _ws

    def set_explicit_package(self, exp):
        """Specify whether to use explicit package names."""
        self.explicit_package = exp

    def generate_behavior_code(self, behavior):
        """Generate the behavior python code."""
        class_name = re.sub('[^0-9a-zA-Z]+', '', behavior.behavior_name)
        states = get_all_states(behavior.root_sm)
        outcomes = behavior.root_sm.sm_outcomes
        self.author = behavior.author
        self.creation_date = behavior.creation_date
        self.manual = [behavior.manual_code_import,
                       behavior.manual_code_init,
                       behavior.manual_code_create,
                       behavior.manual_code_func]

        # prefix
        code = '#!/usr/bin/env python\n'
        code += '# -*- coding: utf-8 -*-\n'
        code += '\n'
        code += self.generate_license_text()
        code += '\n'
        code += '###########################################################\n'
        code += '#               WARNING: Generated code!                  #\n'
        code += '#              **************************                 #\n'
        code += '# Manual changes may get lost if file is generated again. #\n'
        code += '# Only code inside the [MANUAL] tags will be kept.        #\n'
        code += '###########################################################\n'
        code += '\n'

        # behavior header
        code += self.generate_behavior_head(behavior.creation_date,
                                            behavior.author,
                                            behavior.behavior_name,
                                            behavior.behavior_description)
        code += '\n\n'

        code += self.generate_imports(states)
        code += '\n\n'

        # class definition
        code += self.generate_class_definition(class_name + 'SM',
                                               behavior.behavior_name,
                                               behavior.behavior_description)
        code += '\n'

        code += self.generate_init(behavior.behavior_name,
                                   behavior.behavior_parameters,
                                   states, behavior.comment_notes)
        code += ''
        code += self.generate_creation(behavior.private_variables,
                                       outcomes,
                                       behavior.interface_input_keys,
                                       behavior.interface_output_keys,
                                       behavior.default_userdata,
                                       states,
                                       behavior.root_sm)
        code += '\n'
        code += self.generate_functions()
        return code

    def generate_license_text(self):
        """Generate the license text."""
        # @todo - make the license configurable
        code = ''
        code += '# Copyright ' + str(self.get_year_from_creation_date()) + ' ' + self.author + '\n'
        code += '#\n'
        code += '# Licensed under the Apache License, Version 2.0 (the "License");\n'
        code += '# you may not use this file except in compliance with the License.\n'
        code += '# You may obtain a copy of the License at\n'
        code += '#\n'
        code += '#     http://www.apache.org/licenses/LICENSE-2.0\n'
        code += '#\n'
        code += '# Unless required by applicable law or agreed to in writing, software\n'
        code += '# distributed under the License is distributed on an "AS IS" BASIS,\n'
        code += '# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n'
        code += '# See the License for the specific language governing permissions and\n'
        code += '# limitations under the License.\n'
        return code

    def generate_class_definition(self, class_name, behavior_name, description):
        """Generate the class definition."""
        code = ''
        code += 'class ' + class_name + '(Behavior):\n'
        code += self.ws + '"""\n'
        code += self.ws + 'Define ' + behavior_name + '.\n\n'  # pep257 style single line comment
        for line in description.split('\n'):
            split_lines = break_long_line(line)
            for line2 in split_lines:
                code += self.ws + line2.rstrip() + '\n'

        code += self.ws + '"""\n'
        return code

    def get_year_from_creation_date(self):
        """Get year from creation date."""
        # Copyright only wants year
        date_string = self.creation_date
        try:
            try:
                date_object = datetime.datetime.fromisoformat(date_string)
                year = int(date_object.year)
            except Exception:
                # Search for 4 digit integer
                items = re.split(r'(?<=\D),\s*|\s*,(?=\D)', date_string)
                year = None
                for item in items:
                    try:
                        year = int(item)
                        if year > 2000:
                            break
                    except Exception:
                        pass
            if year is not None and year > 2000:
                return year

            # Last ditch attempt to find year
            try:
                # assume year is last in date
                def _split_year(string, delimiter):
                    try:
                        items = string.strip().split(delimiter)
                        year = int(items[-1].strip())
                        if year < 2000:
                            # Presuming 2-digit year
                            year += 2000
                        elif 2000 <= year < 2500:
                            return year
                    except Exception:
                        pass
                    return None
                for delimiter in (' ', ',', '-'):
                    year = _split_year(date_string, delimiter)
                    if year is not None:
                        return year
            except Exception:
                pass
        except Exception as exc:
            print(f'getYearFromCreationDate Error: <{self.creation_date}>{exc}<', flush=True)

        print(f'   Invalid creation date=<{self.creation_date}> - use current time!', flush=True)
        creation_date = datetime.datetime.now()
        self.creation_date = str(creation_date)
        return creation_date.year

    def generate_imports(self, states):
        """Generate list of imports."""
        code = ''
        # generate list of states to import
        imported_states = []
        for state in states:
            if state.state_machine:
                continue
            if not any(obj.state_class == state.state_class
                       and obj.state_pkg == state.state_pkg
                       for obj in imported_states):
                imported_states.append(state)

        # generate import statements
        import_list = []
        # Add standard imports
        import_list.append('from flexbe_core import Autonomy')
        import_list.append('from flexbe_core import Behavior')
        import_list.append('from flexbe_core import ConcurrencyContainer')
        import_list.append('from flexbe_core import Logger')
        import_list.append('from flexbe_core import OperatableStateMachine')
        import_list.append('from flexbe_core import PriorityContainer')
        # @TODO fix this after OBE update --> import_list.append('from flexbe_core import initialize_flexbe_core')

        for imp_state in imported_states:
            try:
                use_explicit_package = self.explicit_package
                if not use_explicit_package:
                    # check for same state from different packages
                    for state in imported_states:
                        if state.state_class == imp_state.state_class and state.state_pkg != imp_state.state_pkg:
                            use_explicit_package = True
                            break

                if imp_state.behavior_state or not use_explicit_package:
                    import_list.append('from ' + imp_state.state_import
                                       + ' import ' + imp_state.state_class)
                    init_statement = self.ws + self.ws + imp_state.state_class + '.initialize_ros(node)'
                else:
                    print('Using explict package name for '
                          f'{imp_state.state_class} ({self.explicit_package}, '
                          f'{use_explicit_package})')
                    import_list.append('from ' + imp_state.state_import
                                       + ' import ' + imp_state.state_class + ' as '
                                       + imp_state.state_pkg + '__' + imp_state.state_class)
                    init_statement = (self.ws + self.ws + imp_state.state_pkg + '__'
                                      + imp_state.state_class + '.initialize_ros(node)')
            except Exception as exc:
                print(f'CodeGenerator: {exc}', flush=True)
                print(imp_state, flush=True)
                print(30 * '=', flush=True)
                raise exc

            if 'SM' not in imp_state.state_class and init_statement not in self.state_init_list:
                self.state_init_list.append(init_statement)

        import_list = list(set(import_list))  # eliminate any duplicates
        import_list.sort()
        code += '\n'.join(import_list)
        code += '\n\n'

        # add manual imports
        code += '# Additional imports can be added inside the following tags\n'
        code += '# [MANUAL_IMPORT]\n'
        code += '\n'.join(self.manual[0])
        if self.manual[0] == '' or len(self.manual[0]) < 2:
            code += (2 - len(self.manual[0])) * '\n'  # Guarantee at least two lines in section
        code += '\n# [/MANUAL_IMPORT]\n'

        return code

    def generate_behavior_head(self, date, author, behavior_name, desc):
        """Generate the behavior header."""
        code = ''
        code += '"""\n'
        code += 'Define ' + behavior_name + '.\n'
        code += '\n'

        for line in desc.split('\n'):
            split_lines = break_long_line(line)
            for line2 in split_lines:
                code += line2.rstrip() + '\n'

        code += '\nCreated on ' + date + '\n'
        code += '@author: ' + author + '\n'
        code += '"""\n'
        return code

    def generate_init(self, behavior_name, params, states, notes):
        """Generate the initialization block."""
        code = ''
        # header
        code += self.ws + 'def __init__(self, node):\n'
        code += self.ws + self.ws + 'super().__init__()\n'
        code += self.ws + self.ws + "self.name = '" + behavior_name + "'\n"
        code += '\n'

        # parameters
        code += self.ws + self.ws + '# parameters of this behavior\n'
        for param in params:
            default_value = ''
            if param['type'] == 'text' or param['type'] == 'enum':
                default_value = "'" + param['default'] + "'"
            elif param['type'] == 'yaml':
                default_value = 'dict()'
            else:
                default_value = param['default']
            code += self.ws + self.ws + "self.add_parameter('" + param['name'] + "', " + default_value + ')\n'

        code += '\n'
        # contains
        code += self.ws + self.ws + '# references to used behaviors\n'
        code += self.ws + self.ws + 'ConcurrencyContainer' + '.initialize_ros(node)' + '\n'
        code += self.ws + self.ws + 'Logger' + '.initialize(node)' + '\n'
        code += self.ws + self.ws + 'OperatableStateMachine' + '.initialize_ros(node)' + '\n'
        code += self.ws + self.ws + 'PriorityContainer' + '.initialize_ros(node)' + '\n'
        self.state_init_list.sort()
        code += '\n'.join(self.state_init_list)
        # Updated common ROS initialization code - @TODO fix this after OBE update
        # code += self.ws + self.ws + '# Initialize ROS node information\n'
        # code += self.ws + self.ws + 'initialize_flexbe_core(node)\n'
        code += '\n'

        contained_behaviors = []
        for state in states:
            if not state.behavior_state:
                continue
            contained_behaviors.append(state)

        contained_behaviors.sort(key=lambda x: x.state_path)
        for beh in contained_behaviors:
            code += self.ws + self.ws + 'self.add_behavior(' + beh.state_class + \
                ", '" + beh.state_path[1:] + "', node)\n"
        code += '\n'
        # manual
        code += self.ws + self.ws + '# Additional initialization code can be added inside the following tags\n'
        code += self.ws + self.ws + '# [MANUAL_INIT]\n'
        # Look for first comment or self. to set block boundary
        code += left_align_block(self.manual[1], self.ws + self.ws, self.ws)
        code += self.ws + self.ws + '# [/MANUAL_INIT]\n'
        code += '\n'

        # comments
        code += self.ws + self.ws + '# Behavior comments:\n\n'

        notes.sort(key=lambda x: x.content)
        for note in notes:
            temp = '0'
            if note.is_important:
                temp = '!'
            code += self.ws + self.ws + '# ' + temp + ' ' + str(round(note.position_x))
            code += ' ' + str(round(note.position_y)) + ' ' + note.container_path + '\n'
            for line in note.content.strip().split('\n'):
                code += self.ws + self.ws + '# ' + line.strip() + '\n'
            code += '\n'

        return code

    def generate_creation(self, private_vars, outcomes, input_keys, output_keys, user_data, states, root_sm):
        """Generate behavior creation block."""
        code = ''
        code += self.ws + 'def create(self):\n'

        # private vars
        for _, val in enumerate(private_vars):
            code += self.ws + self.ws + val['key'] + ' = ' + val['value'].strip() + '\n'

        # root declaration
        pos = []
        for out in outcomes:
            pos.append('x:' + str(round(out.position_x)) + ' y:' + str(round(out.position_y)))

        code += self.ws + self.ws + '# ' + ', '.join(pos) + '\n'
        code += self.ws + self.ws +\
            "_state_machine = OperatableStateMachine(outcomes=['" + "', '".join([out.state_name for out in outcomes]) + "']"
        if len(input_keys) > 0:
            code += ", input_keys=['" + "', '".join(input_keys) + "']"

        if len(output_keys) > 0:
            code += ", output_keys=['" + "', '".join(output_keys) + "']"

        code += ')\n'

        # default userdata
        for udata in user_data:
            code += self.ws + self.ws + \
                '_state_machine.userdata.' + udata['key'].replace('"', '') + ' = ' + udata['value'].strip() + '\n'

        code += '\n'

        # manual creation code
        code += self.ws + self.ws + '# Additional creation code can be added inside the following tags\n'
        code += self.ws + self.ws + '# [MANUAL_CREATE]\n'
        # Look for first comment or self. to set block boundary
        code += left_align_block(self.manual[2], self.ws + self.ws, self.ws)
        code += self.ws + self.ws + '# [/MANUAL_CREATE]\n'
        code += '\n'

        # generate contained state machines
        sub_sms = get_all_sub_state_machines(states)
        sub_sms.sort(key=lambda x: x.state_path)
        for ndx in range(len(sub_sms) - 1, -1, -1):
            code += self.generate_state_machine(sub_sms[ndx], True, states)
            code += '\n'
        # generate root state machine
        code += '\n'
        code += self.generate_state_machine(root_sm, False, states)
        code += '\n'

        code += self.ws + self.ws + 'return _state_machine\n'
        return code

    def generate_state_machine(self, sm, include_header, states):
        """Generate the state machine code."""
        code = ''
        sm_name = ''
        if sm.state_name == '':
            sm_name = '_state_machine'
        else:
            sm_name = '_sm_' + sm.state_name.lower().replace(' ', '_') + '_' + str(self.sm_counter)
        self.sm_counter += 1
        self.sm_names.append({'sm': sm, 'name': sm_name})

        if include_header:
            pos = []
            for out in sm.sm_outcomes:
                pos.append('x:' + str(round(out.position_x))
                           + ' y:' + str(round(out.position_y)))
            code += self.ws + self.ws + '# ' + ', '.join(pos) + '\n'

            if sm.concurrent:
                prefix = self.ws + self.ws + sm_name + ' = ConcurrencyContainer('
                code += prefix + "outcomes=['" + "', '".join(sm.outcomes) + "']"
            elif sm.priority:
                prefix = self.ws + self.ws + sm_name + ' = PriorityContainer('
                code += prefix + "outcomes=['" + "', '".join(sm.outcomes) + "']"
            else:
                prefix = self.ws + self.ws + sm_name + ' = OperatableStateMachine('
                code += prefix + "outcomes=['" + "', '".join(sm.outcomes) + "']"

            if self.ws == '\t':
                prefix = 8 * self.ws
            else:
                prefix = len(prefix) * ' '

            if len(sm.input_keys) > 0:
                code += ',\n' + prefix + "input_keys=['" + "', '".join(sm.input_keys) + "']"
            if len(sm.output_keys) > 0:
                code += ',\n' + prefix + "output_keys=['" + "', '".join(sm.output_keys) + "']"

            if sm.concurrent:
                code += ',\n' + prefix + 'conditions=['
                list_entries = []
                for ndx, value in enumerate(sm.conditions['outcomes']):
                    outcome = value.split('#')[0]
                    transitions_list = []
                    for trans_list in sm.conditions['transitions'][ndx]:
                        transitions_list.append(f"('{trans_list[0]}', '{trans_list[1]}')")

                    list_entries.append(f"('{outcome}', [{', '.join(transitions_list)}])")
                code += list_entries[0]
                if len(list_entries) > 1:
                    code += f',\n{prefix}{" "*len("conditions=[")}'
                    code += f',\n{prefix}{" "*len("conditions=[")}'.join(list_entries[1:])
                    code += f'\n{prefix}{" "*len("conditions=[")}' + ']'
                else:
                    code += ']'
            code += ')\n\n'

        code += self.ws + self.ws + 'with ' + sm_name + ':\n'

        # state machine needs to start with initial state
        states = sm.states
        states.sort(key=lambda x: x.state_name)
        init_trans = next(x for x in sm.transitions if x.from_state_name == 'INIT')
        init_state = next(x for x in states if x.state_name == init_trans.to_state_name)

        if init_state != states[0]:
            states.remove(init_state)
            states.insert(0, init_state)

        # add states
        for state in states:
            code += self.generate_state(state, sm.transitions, states)

        return code

    def generate_state(self, state, transitions, states):
        """Generate the state definition."""
        state_code = ''

        # comment section for internal data
        state_code += self.ws + self.ws + self.ws + '# x:' + str(round(state.position_x)) + ' y:' + str(round(state.position_y))
        internal_param_list = []
        for ndx, p_k in enumerate(state.parameters):
            if not p_k.startswith('?'):
                break
            p_v = state.parameter_values[ndx]
            internal_param_list.append(p_k + ' = ' + p_v)

        if len(internal_param_list) > 0:
            state_code += ' {' + ','.join(internal_param_list) + '}'

        state_code += '\n'

        state_code += self.ws + self.ws + self.ws + f"OperatableStateMachine.add('{state.state_name}',\n"

        if self.ws != '\t':
            prepend = ' ' * len(self.ws + self.ws + self.ws + 'OperatableStateMachine.add(')
        else:
            prepend = '\t' * 7

        code = ''
        # class
        if state.state_machine:
            # temp = [x['sm'].state_path for x in self.sm_names]
            sm_name = next(x for x in self.sm_names if x['sm'].state_path == state.state_path)['name']
            code += sm_name + ',\n'
        elif state.behavior_state:
            defkeys_str = ''
            be_defkeys_str = []
            for ndx, in_key in enumerate(state.input_keys):
                if state.input_mapping[ndx] is not None:
                    continue
                be_defkeys_str.append("'" + in_key + "'")

            if len(be_defkeys_str) > 0:
                defkeys_str = 'default_keys=[' + ','.join(be_defkeys_str) + ']'

            params_str = ''
            be_params_str = []
            print(f'adding behavior {state.state_class} with params={state.parameter_values}', flush=True)
            for ndx, param in enumerate(state.parameters):
                if state.parameter_values[ndx] is None:
                    continue
                be_params_str.append("'" + param + "': " + state.parameter_values[ndx])

            if len(be_params_str) > 0:
                params_str = 'parameters={' + ', '.join(be_params_str) + '}'

            code += 'self.use_behavior('
            prepend_beh = ' ' * len(code)
            if self.ws == '\t':
                prepend_beh = '\t' * ((len(code) - 1) // 4 + 1)

            code += f"{state.state_class}, '{state.state_path[1:]}'"
            if defkeys_str != '':
                code += ",\n" + prepend_beh
                code += f'\n{prepend_beh}'.join(format_state_code_string(defkeys_str,
                                                                         self.target_line_length - len(prepend)
                                                                         - len(prepend_beh), self.ws).split('\n'))
            if params_str != '':
                code += ",\n" + prepend_beh
                code += f'\n{prepend_beh}'.join(format_state_code_string(params_str,
                                                                         self.target_line_length - len(prepend)
                                                                         - len(prepend_beh), self.ws).split('\n'))
            code += '),\n'
        else:
            class_key = ''
            use_explicit_package = self.explicit_package
            if not use_explicit_package:
                # check for same state from different packages
                for st_ in states:
                    if st_.state_class == state.state_class and st_.state_pkg != state.state_pkg:
                        use_explicit_package = True
                        break

            if not use_explicit_package:
                class_key = state.state_class
            else:
                class_key = state.state_pkg + '__' + state.state_class
            code += class_key + '('
            prepend_state = ' ' * len(code)
            if self.ws == '\t':
                prepend_state = '\t' * ((len(code) - 1) // 4 + 1)

            param_strings = []
            for ndx, param in enumerate(state.parameters):
                if param.startswith('?'):
                    continue
                formatted_string = format_state_code_string(param + '=' + state.parameter_values[ndx],
                                                            self.target_line_length - len(prepend) - len(prepend_state),
                                                            self.ws)
                param_strings.append(f'\n{prepend_state}'.join(formatted_string.split('\n')))

            code += f',\n{prepend_state}'.join(param_strings)
            code += '),\n'

        # transitions
        transition_strings = []
        state_transitions = [tran for tran in transitions if tran.from_state_name == state.state_name]

        for ndx, out in enumerate(state.outcomes):
            outcome_transition = next(tran for tran in state_transitions if tran.outcome == out)
            if outcome_transition is None:
                raise Exception("outcome '" + out + "' in state '"
                                + state.state_name + "' is not connected")
            if outcome_transition.to_state_name == state.state_name:
                print("Looping transition for outcome '" + out
                      + "' in state '" + state.state_name + "' detected")
            transition_target = outcome_transition.to_state_name
            if outcome_transition.to_state_class == ':CONDITION':
                transition_target = transition_target.split('#')[0]

            if (outcome_transition.x is not None or outcome_transition.beg_x is not None
                    or outcome_transition.end_x is not None):
                #  Track new Bezier information at end of transition in comment form
                temp = "'" + out + "': '" + transition_target + "'  # "
                if outcome_transition.x is None:
                    temp = temp + '-1 -1 '
                else:
                    temp = temp + str(round(outcome_transition.x)) + ' ' + str(round(outcome_transition.y)) + ' '

                if outcome_transition.beg_x is None:
                    temp = temp + '-1 -1 '
                else:
                    temp = temp + str(round(outcome_transition.beg_x)) + ' ' + str(round(outcome_transition.beg_y)) + ' '

                if outcome_transition.end_x is None:
                    temp = temp + '-1 -1'
                else:
                    temp = temp + str(round(outcome_transition.end_x)) + ' ' + str(round(outcome_transition.end_y))

                temp += '\n'
                if self.ws != '\t':
                    temp += len('transitions={') * ' '
                else:
                    temp += 3 * self.ws

                transition_strings.append(temp)
            else:
                transition_strings.append("'" + out + "': '" + transition_target + "'")

        transition_code = 'transitions={'

        transition_code += ', '.join(transition_strings) + '}'
        code += format_state_code_string(transition_code, self.target_line_length - len(prepend), self.ws)
        code += ',\n'

        # autonomy
        aut_code = 'autonomy={'
        autonomy_strings = []
        for ndx, out in enumerate(state.outcomes):
            autonomy_strings.append("'" + out + "': " + autonomy_mapping(state.autonomy[ndx]))

        aut_code += ', '.join(autonomy_strings) + "}"
        code += format_state_code_string(aut_code, self.target_line_length - len(prepend), self.ws)

        # remapping
        if len(state.input_keys) + len(state.output_keys) > 0:
            remapping_strings = []
            for ndx, in_key in enumerate(state.input_keys):
                if state.input_mapping[ndx] is None:
                    continue
                remapping_strings.append("'" + in_key + "': '" + state.input_mapping[ndx] + "'")
            for ndx, out_key in enumerate(state.output_keys):
                if out_key in state.input_keys:
                    continue
                remapping_strings.append("'" + out_key + "': '" + state.output_mapping[ndx] + "'")
            if len(remapping_strings) > 0:
                code += ',\n'
                input_key_code = 'remapping={' + ', '.join(remapping_strings) + "}"
                code += format_state_code_string(input_key_code, self.target_line_length - len(prepend), self.ws)

        state_code += prepend + f'\n{prepend}'.join(code.split('\n'))
        state_code += ')\n\n'
        return state_code

    def generate_functions(self):
        """Generate the function definitions."""
        code = ''
        code += self.ws + '# Private functions can be added inside the following tags\n'
        code += self.ws + '# [MANUAL_FUNC]\n'
        # Look for first comment, self., or 'def ' to set block boundary
        code += left_align_block(self.manual[3], self.ws[:], self.ws)
        code += self.ws + '# [/MANUAL_FUNC]\n'
        return code


def extract_manual(code):
    """Extract the existing manual code definitions."""
    manual = ['', '', '', '']

    # patterns
    manual_import_pattern_begin = '# [MANUAL_IMPORT]'
    manual_import_pattern_end = '# [/MANUAL_IMPORT]'
    manual_init_pattern_begin = '# [MANUAL_INIT]'
    manual_init_pattern_end = '# [/MANUAL_INIT]'
    manual_create_pattern_begin = '# [MANUAL_CREATE]'
    manual_create_pattern_end = '# [/MANUAL_CREATE]'
    manual_func_pattern_begin = '# [MANUAL_FUNC]'
    manual_func_pattern_end = '# [/MANUAL_FUNC]'
    comment_manual_pattern = '/s*# (Additional imports|Additional initialization code|Additional creation code \
    |Private functions) can be added inside the following tags\n\r?/ig'

    # manual import section
    import_split_begin = code.split(manual_import_pattern_begin)
    if len(import_split_begin) == 2:
        import_split_end = import_split_begin[1].split(manual_import_pattern_end)
        if len(import_split_end) != 2:
            raise Exception('inconsistent tag [MANUAL_IMPORT]')
        import_result = import_split_end[0]
        if import_result != '':
            manual[0] = left_align_block(import_result, '', '')
        code = code.replace(manual_import_pattern_begin + import_split_end[0] + manual_import_pattern_end, '')

    # manual init section
    init_split_begin = code.split(manual_init_pattern_begin)
    if len(init_split_begin) == 2:
        init_split_end = init_split_begin[1].split(manual_init_pattern_end)
        if len(init_split_end) != 2:
            raise Exception('inconsistent tag [MANUAL_INIT]')
        init_result = init_split_end[0]
        if init_result != '':
            manual[1] = left_align_block(init_result, '', '')
        code = code.replace(manual_init_pattern_begin + init_split_end[0] + manual_init_pattern_end, '')

    # manual create section
    create_split_begin = code.split(manual_create_pattern_begin)
    if len(create_split_begin) == 2:
        create_split_end = create_split_begin[1].split(manual_create_pattern_end)
        if len(create_split_end) != 2:
            raise Exception('inconsistent tag [MANUAL_CREATE]')
        create_result = create_split_end[0]
        if create_result != '':
            manual[2] = left_align_block(create_result, '', '')
        code = code.replace(manual_create_pattern_begin + create_split_end[0] + manual_create_pattern_end, '')

    # manual func section
    func_split_begin = code.split(manual_func_pattern_begin)
    # func_defs = []
    if len(func_split_begin) == 2:
        func_split_end = func_split_begin[1].split(manual_func_pattern_end)
        if len(func_split_end) != 2:
            raise Exception('inconsistent tag [MANUAL_FUNC]')
        func_result = func_split_end[0]
        if func_result != '':
            manual[3] = left_align_block(func_result, '', '')
        code = code.replace(manual_func_pattern_begin + func_split_end[0] + manual_func_pattern_end, '')

    code = re.sub(comment_manual_pattern, '', code)

    return manual


def autonomy_mapping(autonomy_int):
    """Define autonomy mapping."""
    autonomy_dict = {
        0: 'Autonomy.Off',
        1: 'Autonomy.Low',
        2: 'Autonomy.High',
        3: 'Autonomy.Full'
    }
    return autonomy_dict.get(autonomy_int, 'Autonomy.Inherit')


def get_all_sub_state_machines(states):
    """Get all sub-state machines."""
    sub_sms = [state for state in states if state.state_machine]

    return sub_sms


def get_all_states(state_machine):
    """Get all individual states."""
    states = []
    temp_states = []
    for state in state_machine.states:
        states.append(state)
        if state.state_machine:
            for each in get_all_states(state):
                temp_states.append(each)
    return states + temp_states
