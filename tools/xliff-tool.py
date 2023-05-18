#!/usr/bin/env python3

# MIT License
#
# Copyright (c) 2021 Henry Kielmann
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.


import argparse
import json
import xml.etree.ElementTree as ET
from collections import OrderedDict
import os.path
import re
import logging

encoding = 'utf-8' # used for all io operations

logging.basicConfig(style='{',
                    format='[{levelname:^7}] {message}')
log = logging.getLogger(__name__)

json_object_type = OrderedDict

def escape_dots(s):
    return s.replace('.', '\\.')

def unescape_dots(s):
    return s.replace('\\.', '.')

def flattened_json_items(data, dots_are_separators, key_prefix='', key_postfix=''):
    iterator = enumerate(data) if isinstance(data, list) else data.items()
    for (key, value) in iterator:
        escaped_key = key if dots_are_separators else escape_dots(key)
        key_string = f'{key_prefix}{escaped_key}{key_postfix}'
        if isinstance(value, json_object_type):
            yield from flattened_json_items(value, dots_are_separators, f'{key_string}.')
        elif isinstance(value, list):
            yield from flattened_json_items(value, dots_are_separators, f'{key_string}.[', ']')
        else:
            yield (key_string, value)

def flattened_json(data, dots_are_separators):
    return json_object_type(flattened_json_items(data, dots_are_separators))

def _get_group_key(group_name):
    match = re.fullmatch(r'\[(\d+)\]', group_name)
    if match:
        return int(match.group(1))
    else:
        return unescape_dots(group_name)

def _group_has_key(group, key):
    if isinstance(group, list):
        return len(group) > key and group[key] is not None
    else:
        return key in group

def _set_group_value(parent_group, key, value):
    if isinstance(parent_group, list):
        while len(parent_group) <= key:
            parent_group.append(None)
    parent_group[key] = value

def nested_json(flattened_data):
    r = json_object_type()
    for (key, value) in flattened_data.items():
        parent_group = r
        key_path = re.split(r'(?<!\\)\.', key) # don't match escaped dots
        for (i, group_name) in enumerate(key_path[:-1]):
            group_key = _get_group_key(group_name)
            if not _group_has_key(parent_group, group_key):
                group = None
                if isinstance(_get_group_key(key_path[i+1]), int):
                    group = list()
                else:
                    group = json_object_type()
                _set_group_value(parent_group, group_key, group)
            parent_group = parent_group[group_key]
        _set_group_value(parent_group, _get_group_key(key_path[-1]), value)
    return r

def read_json(file, dots_are_separators):
    raw_data = json.load(file, object_pairs_hook=json_object_type)
    return flattened_json(raw_data, dots_are_separators)

def write_json(file, data, nest_keys=True):
    indent = 0
    if nest_keys:
        data = nested_json(data)
        indent = 4
    json.dump(data, file,
              ensure_ascii=False,
              indent=indent)

def xml_get_index(container, element):
    for index, child in enumerate(container):
        if element == child:
            return index
    raise ValueError('Element not in container')

def xml_insert_after(container, new_child, reference_child):
    if reference_child != None:
        index = xml_get_index(container, reference_child)+1
        container.insert(index, new_child)
    else:
        container.append(new_child)

class XliffFile:
    def read(file_path):
        tree = ET.parse(file_path, ET.XMLParser(encoding=encoding))
        return XliffFile(file_path, tree)

    def create(file_path, source_language, target_language):
        tree = ET.ElementTree(
            ET.fromstring("<?xml version='1.0'?>\n"
                          '<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2">\n'
                         f'  <file source-language="{source_language}" target-language="{target_language}">\n'
                          '    <body></body>\n'
                          '  </file>\n'
                          '</xliff>'))
        return XliffFile(file_path, tree)

    def __init__(self, file_path, tree):
        self.file_path = file_path
        self.tree = tree
        root_tag = tree.getroot().tag
        namespace = root_tag.removeprefix('{').removesuffix('}xliff')
        if namespace == root_tag:
            raise ValueError('No namespace found')
        self.namespace = namespace
        self.namespaces = {'': namespace}
        ET.register_namespace('', namespace)
        self.body = self.find_xml_element(self.tree.getroot(), './file/body')

    def tag(self, name):
        return '{{{}}}{}'.format(self.namespace, name)

    def find_xml_element(self, root, xpath):
        return root.find(xpath, self.namespaces)

    def find_all_xml_elements(self, root, xpath):
        return root.findall(xpath, self.namespaces)

    def write(self):
        ET.indent(self.tree)
        string = ET.tostring(self.tree.getroot(), encoding=encoding).decode(encoding)
        string = re.sub(r' />', '/>', string)
        with open(self.file_path, 'wt', encoding=encoding) as file:
            file.write(string)
        #self.tree.write(self.file_path, encoding=encoding)

    def get_source_language(self):
        file = self.find_xml_element(self.tree.getroot(), './file')
        return file.get('source-language')

    source_language = property(get_source_language)

    def get_target_language(self):
        file = self.find_xml_element(self.tree.getroot(), './file')
        return file.get('target-language')

    target_language = property(get_target_language)

    def translation_units(self):
        for xml_unit in self.find_all_xml_elements(self.body, './trans-unit'):
            yield XliffTranslationUnit(self, xml_unit)

    def create_translation_unit(self, id, source_text, insert_after=None):
        xml_unit = ET.Element(self.tag('trans-unit'), id=id)
        ET.SubElement(xml_unit, self.tag('source')).text = source_text
        ET.SubElement(xml_unit, self.tag('target'))
        xml_insert_after(self.body, xml_unit, insert_after.xml_element if insert_after else None)
        unit = XliffTranslationUnit(self, xml_unit)
        unit.state = 'new'
        return unit

    def remove_translation_unit(self, unit):
        self.body.remove(unit.xml_element)

    def find_translation_unit(self, id):
        escaped_id = id.replace('"', '&quot;')
        xml_unit = self.find_xml_element(self.body, f'./trans-unit[@id="{escaped_id}"]')
        if xml_unit:
            return XliffTranslationUnit(self, xml_unit)
        else:
            return None

class XliffTranslationUnit:
    def __init__(self, xliff_file, xml_element):
        self.xliff_file = xliff_file
        self.xml_element = xml_element

    def get_id(self):
        return self.xml_element.get('id')

    id = property(get_id)

    # http://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html#approved
    # Indicates whether a translation is final or has passed its final review.
    def is_approved(self):
        return self.xml_element.get('approved') == 'yes'

    def approve(self, boolean):
        if boolean:
            self.xml_element.set('approved', 'yes')
        else:
            self.xml_element.attrib.pop('approved', None)

    def get_sub_element(self, name):
        element = self.xliff_file.find_xml_element(self.xml_element, name)
        if element is None:
            raise ValueError(f'Translation unit has no {name} entry')
        return element

    def get_source(self):
        return self.get_sub_element('source').text

    def set_source(self, text):
        self.get_sub_element('source').text = text

    source = property(get_source, set_source)

    def get_target(self):
        return self.get_sub_element('target').text

    def set_target(self, text):
        self.get_sub_element('target').text = text

    target = property(get_target, set_target)

    # http://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html#state
    # "final": Indicates the terminating state.
    # "needs-adaptation": Indicates only non-textual information needs adaptation.
    # "needs-l10n": Indicates both text and non-textual information needs adaptation.
    # "needs-review-adaptation": Indicates only non-textual information needs review.
    # "needs-review-l10n": Indicates both text and non-textual information needs review.
    # "needs-review-translation": Indicates that only the text of the item needs to be reviewed.
    # "needs-translation": Indicates that the item needs to be translated.
    # "new": Indicates that the item is new. For example, translation units that were not in a previous version of the document.
    # "signed-off": Indicates that changes are reviewed and approved.
    # "translated": Indicates that the item has been translated.
    def get_state(self):
        return self.get_sub_element('target').get('state')

    def set_state(self, state):
        if state is not None:
            self.get_sub_element('target').set('state', state)
        else:
            self.get_sub_element('target').attrib.pop('state', None)

    state = property(get_state, set_state)

    def notes(self):
        for xml_note in self.xliff_file.find_all_xml_elements(self.xml_element, 'note'):
            yield XliffNote(self, xml_note)

    def create_note(self, text, author=None, insert_after=None):
        xml_note = ET.Element(self.xliff_file.tag('note'))
        xml_note.text = text
        xml_insert_after(self.xml_element, xml_note, insert_after)
        note = XliffNote(self, xml_note)
        note.author = author
        return note

    def remove_note(self, note):
        self.xml_element.remove(note.xml_element)

class XliffNote:
    def __init__(self, unit, xml_element):
        self.unit = unit
        self.xml_element = xml_element

    def get_text(self):
        return self.xml_element.text

    def set_text(self, text):
        self.xml_element.text = text

    text = property(get_text, set_text)

    def get_author(self):
        return self.xml_element.get('from')

    def set_author(self, author):
        if author is not None:
            self.xml_element.set('from', author)
        else:
            self.xml_element.attrib.pop('from', None)

    author = property(get_author, set_author)

def create(xliff_file_path, source_language, target_language, source_json_file=None, target_json_file=None, dots_are_separators=True):
    xliff_file = XliffFile.create(xliff_file_path, source_language, target_language)
    if source_json_file:
        source_json = read_json(source_json_file, dots_are_separators)
        for (id, source_text) in source_json.items():
            xliff_file.create_translation_unit(id, source_text)
    if target_json_file:
        target_json = read_json(target_json_file, dots_are_separators)
        for (id, target_text) in target_json.items():
            unit = xliff_file.find_translation_unit(id)
            if unit:
                unit.target = target_text
                unit.state = 'signed-off'
                unit.approve(True)
            else:
                log.warning('"%s" not present; can\'t insert translated text', id)
    if writing_allowed:
        xliff_file.write()

def update(xliff_file_path, source_json_file, remove_nonexisting=True, dots_are_separators=True):
    """
    Konzept:
    Einträge die in en.json, aber nicht in de.xliff existieren dort hinzufügen.
    Einträge die in beiden Listen existieren, aber deren englische Texte sich unterscheiden in de.xliff aktualisieren.
    Einträge die in de.xliff, aber nicht in en.json existieren aus de.xliff löschen.
    """
    xliff_file = XliffFile.read(xliff_file_path)
    source_json = read_json(source_json_file, dots_are_separators)
    for unit in xliff_file.translation_units():
        if unit.id not in source_json:
            log.warning('%s: not present in source json, %s\n'
                        '%8s: %s\n'
                        '%8s: %s',
                        unit.id,
                        'removing it from xliff' if remove_nonexisting else 'but retaining it due to flag',
                        'source',
                        unit.source,
                        'target',
                        unit.target)
            if remove_nonexisting:
                xliff_file.remove_translation_unit(unit)
    previous_unit = None
    for (id, source_text) in source_json.items():
        unit = xliff_file.find_translation_unit(id)
        if unit is not None:
            if unit.source != source_text:
                log.warning('%s: source text differs, updating xliff\n'
                            '%8s: %s\n'
                            '%8s: %s',
                            id,
                            'old',
                            unit.source,
                            'new',
                            source_text)
                unit.create_note(f'Old source text:\n{unit.source}')
                unit.source = source_text
                unit.state = 'needs-translation'
                unit.approve(False)
        else:
            log.info('%s: not present in xliff, creating it from source json\n'
                     '%8s: %s',
                     id,
                     'source',
                     source_text)
            unit = xliff_file.create_translation_unit(id, source_text, previous_unit)
        previous_unit = unit
    if writing_allowed:
        xliff_file.write()

def export(xliff_file_path, target_json_file, write_nested_json, default_to_source):
    xliff_file = XliffFile.read(xliff_file_path)
    target_json = json_object_type()
    for unit in xliff_file.translation_units():
        text = unit.target
        if not text:
            log.error('%s: no translation, using source text\n'
                      '%8s: %s',
                      unit.id,
                      'source',
                      unit.source)
            if default_to_source:
                text = unit.source
        elif not unit.is_approved():
            log.warning('%s: missing approval\n'
                        '%8s: %s\n'
                        '%8s: %s',
                        unit.id,
                        'source',
                        unit.source,
                        'target',
                        unit.target)
        if text:
            target_json[unit.id] = text
    if writing_allowed:
        write_json(target_json_file, target_json, write_nested_json)

class HelpAction(argparse._HelpAction):
    # Code from https://stackoverflow.com/a/24122778
    def __call__(self, parser, namespace, values, option_string=None):
        parser.print_help()
        print('')
        subparsers_actions = [
            action for action in parser._actions
            if isinstance(action, argparse._SubParsersAction)]
        for subparsers_action in subparsers_actions:
            for choice, subparser in subparsers_action.choices.items():
                print(f'{choice} command:')
                print(subparser.format_help())
        parser.exit()

def parse_args():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('-h', '--help', action=HelpAction)
    parser.add_argument('-v', '--verbose',
                        action='count',
                        default=0,
                        help='Explain what the program is doing')
    parser.add_argument('-d', '--dry-run',
                        action='store_true',
                        help="Don't write any files")
    parser.add_argument('xliff',
                        help='The XLIFF file')

    subparsers = parser.add_subparsers(required=True,
                                       metavar='command',
                                       dest='command')

    create_parser = subparsers.add_parser('create',
                                          help='Create a new XLIFF file')
    create_parser.add_argument('-s', '--source-language',
                               default='en-US')
    create_parser.add_argument('-t', '--target-language',
                               required=True)
    create_parser.add_argument('--source-json',
                               type=argparse.FileType('r', encoding=encoding),
                               help='Original JSON file used to seed the XLIFF')
    create_parser.add_argument('--target-json',
                               type=argparse.FileType('r', encoding=encoding),
                               help='Translated JSON file used to seed the XLIFF')
    create_parser.add_argument('--tree',
                               action='store_true',
                               help='Explicitly import tree structure (Dots are retained and NOT used to split and group keys)')

    update_parser = subparsers.add_parser('update-from',
                                          help='Pull changes from the original JSON file')
    update_parser.add_argument('json',
                               type=argparse.FileType('r', encoding=encoding),
                               help='Use JSON file to update the XLIFF')
    update_parser.add_argument('-k', '--keep-nonexisting',
                               action='store_true',
                               default=False,
                               help="Don't remove XLIFF entries if they aren't existing in the source (anymore)")
    update_parser.add_argument('-t', '--tree',
                               action='store_true',
                               help='Explicitly import tree structure (Dots are retained and NOT used to split and group keys)')

    export_parser = subparsers.add_parser('export-to',
                                          help='Write translations to a JSON file')
    export_parser.add_argument('json',
                               type=argparse.FileType('w', encoding=encoding),
                               help='Target JSON file')
    export_parser.add_argument('-t', '--tree',
                               action='store_true',
                               help='Export as tree structure (Dots are used to split and group keys)')
    export_parser.add_argument('-i', '--ignore-missing',
                               action='store_true',
                               help="Don't export keys with missing translations (Might become default in the future)")

    return parser.parse_args()

if __name__ == '__main__':
    args = parse_args()
    global writing_allowed
    log.setLevel(30 - args.verbose * 10)
    writing_allowed = not args.dry_run
    if args.command == 'create':
        create(args.xliff, args.source_language, args.target_language, args.source_json, args.target_json, not args.tree)
    elif args.command == 'update-from':
        update(args.xliff, args.json, not args.keep_nonexisting, not args.tree)
    elif args.command == 'export-to':
        export(args.xliff, args.json, args.tree, not args.ignore_missing)
