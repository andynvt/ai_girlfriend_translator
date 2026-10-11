import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:thongdichtinhyeu/api.dart';
import 'package:thongdichtinhyeu/main.dart';
import 'package:thongdichtinhyeu/share_intake.dart';
import 'package:thongdichtinhyeu/store.dart';

void main() {
  test('initial share sets pending', () async {
    final s = ShareIntake(stream: const Stream.empty(), initial: () async => ['/a.png'], reset: () {});
    await pumpEventQueue();
    expect(s.pendingImagePath, '/a.png');
    s.consume();
    expect(s.pendingImagePath, isNull);
  });

  test('stream share sets pending and notifies', () async {
    final c = StreamController<List<String>>();
    final s = ShareIntake(stream: c.stream, initial: () async => [], reset: () {});
    var notified = 0;
    s.addListener(() => notified++);
    c.add(['/b.jpg']);
    await pumpEventQueue();
    expect(s.pendingImagePath, '/b.jpg');
    expect(notified, 1);
  });

  test('multiple images takes first', () async {
    final s = ShareIntake(stream: Stream.value(['/1.png', '/2.png']), initial: () async => [], reset: () {});
    await pumpEventQueue();
    expect(s.pendingImagePath, '/1.png');
  });

  testWidgets('pending image survives onboarding', (tester) async {
    final file = File('${Directory.systemTemp.createTempSync().path}/chat.png')..writeAsBytesSync([1, 2, 3]);
    SharedPreferences.setMockInitialValues({});
    final store = Store(await SharedPreferences.getInstance());
    final share = ShareIntake(stream: const Stream.empty(), initial: () async => [file.path], reset: () {});
    final api = Api(baseUrl: 'https://x.test', client: MockClient((_) async => http.Response('{}', 500)));
    await tester.pumpWidget(App(store: store, api: api, share: share));
    await tester.pumpAndSettle();
    await tester.tap(find.text('bạn gái'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'Lan');
    await tester.pump();
    await tester.tap(find.byKey(const Key('seal')));
    await tester.pump(const Duration(milliseconds: 1000)); // stamp
    await tester.pump(const Duration(milliseconds: 700)); // letter flies away
    // Real file IO needs real event-loop turns between its async steps.
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future.delayed(const Duration(milliseconds: 20)));
      await tester.pump();
    }
    await tester.pumpAndSettle();
    expect(find.text('✕ Xóa ảnh'), findsOneWidget);
    expect(share.pendingImagePath, isNull);
  });
}
