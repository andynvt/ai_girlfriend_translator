import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:thongdichtinhyeu/i18n.dart';

void main() {
  test('every used key has English', () {
    final used = RegExp(r"""\bt\('((?:[^'\\]|\\.)*)'""");
    final missing = <String>[];
    for (final f in Directory(
      'lib',
    ).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
      for (final m in used.allMatches(f.readAsStringSync())) {
        final key = m.group(1)!.replaceAll(r"\'", "'");
        if (!en.containsKey(key)) missing.add('${f.path}: $key');
      }
    }
    expect(missing, isEmpty);
  });

  test('t falls back to key in Vietnamese and for unknown keys', () {
    expect(t('Gửi', 'vi'), 'Gửi');
    expect(t('Gửi', 'en'), 'Send');
    expect(t('không có', 'en'), 'không có');
  });
}
