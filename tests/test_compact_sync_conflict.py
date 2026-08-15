from pathlib import Path

source = Path('app.py').read_text()
conflict = source.split('                if conflicting:', 1)[1].split(
    '                logical_history_delete:', 1
)[0]

assert '"reset": True' in conflict
assert '"conflict": True' in conflict
assert 'serialize_change_rows(concurrent_rows)' not in conflict
print('Compact sync conflict regression test passed.')
