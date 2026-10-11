import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:thongdichtinhyeu/api.dart';
import 'package:thongdichtinhyeu/models.dart';
import 'package:thongdichtinhyeu/screens/decode.dart';
import 'package:thongdichtinhyeu/store.dart';

final profile = Profile(language: 'vi', direction: 'gf', partnerName: 'Lan');

http.Response ok(Map<String, dynamic> body) =>
    http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> result(String meaning, {String? sourceText}) => {
  'meaning': meaning,
  'danger': 55,
  'reply': 'reply-$meaning',
  'avoid': 'avoid-$meaning',
  'sourceText': ?sourceText,
};

class Harness {
  final bodies = <Map<String, dynamic>>[];
  late Store store;
}

Future<Harness> pump(
  WidgetTester tester,
  Future<http.Response> Function(Map<String, dynamic> body) respond, {
  Conversation? resume,
  String? image,
}) async {
  SharedPreferences.setMockInitialValues({});
  final h = Harness()..store = Store(await SharedPreferences.getInstance());
  final api = Api(
    baseUrl: 'https://x.test',
    client: MockClient((req) {
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      h.bodies.add(body);
      return respond(body);
    }),
  );
  await tester.pumpWidget(
    MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: DecodeScreen(
          store: h.store,
          api: api,
          profile: profile,
          resume: resume,
          initialImageDataUrl: image,
          onReset: () {},
          onOpenHistory: () {},
        ),
      ),
    ),
  );
  await tester.pump();
  return h;
}

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.pump();
  await tester.ensureVisible(f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

final decodeButton = find.widgetWithText(FilledButton, 'Giải mã! ✨');
final chooseReply = find.widgetWithText(FilledButton, 'Chọn câu này & lưu').first;

Turn selected(int i) => Turn(
  text: 'câu $i',
  analysis: Analysis(meaning: 'm$i', danger: 10, reply: 'r$i', avoid: 'a$i'),
  createdAt: '2026-10-11T10:00:00.000Z',
  fromImage: false,
  selection: 'reply',
  selectedReply: 'r$i',
);

void main() {
  testWidgets('decode → result → choose → second turn sends history', (tester) async {
    var n = 0;
    final h = await pump(tester, (_) async => ok(result('m${++n}')));
    await tester.enterText(find.byKey(const Key('text')), 'Tùy anh');
    await tap(tester, decodeButton);
    expect(find.text('m1'), findsOneWidget);
    await tap(tester, chooseReply);
    final saved = h.store.loadConversations().single;
    expect(saved.turns.single.selection, 'reply');
    expect(saved.turns.single.selectedReply, 'reply-m1');
    await tester.enterText(find.byKey(const Key('text')), 'Ừ');
    await tap(tester, decodeButton);
    expect(h.bodies[0].containsKey('history'), isFalse);
    expect(h.bodies[1]['history'], hasLength(1));
    expect(h.bodies[1]['history'][0]['selection'], 'reply');
    expect(find.text('m2'), findsOneWidget);
  });

  testWidgets('turn limit disables decode', (tester) async {
    final full = Conversation(id: 'c1', profile: profile, turns: [for (var i = 0; i < 10; i++) selected(i)]);
    await pump(tester, (_) async => ok(result('x')), resume: full);
    expect(tester.widget<FilledButton>(decodeButton).onPressed, isNull);
    expect(find.text('Đã đạt giới hạn. Bắt đầu cuộc trò chuyện mới để hỏi tiếp.'), findsOneWidget);
  });

  testWidgets('oversized image blocked', (tester) async {
    final big = 'data:image/jpeg;base64,${'A' * (4 * 1024 * 1024)}';
    final h = await pump(tester, (_) async => ok(result('x')), image: big);
    await tap(tester, decodeButton);
    expect(find.text('Ảnh nặng quá (tối đa 4 MB).'), findsOneWidget);
    expect(h.bodies, isEmpty);
  });

  testWidgets('image turn requires source text', (tester) async {
    final h = await pump(tester, (_) async => ok(result('m1', sourceText: '')), image: 'data:image/png;base64,AAAA');
    await tap(tester, decodeButton);
    expect(h.bodies.single['image'], 'data:image/png;base64,AAAA');
    expect(tester.widget<FilledButton>(chooseReply).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('sourceText')), 'Em mệt');
    await tester.pump();
    await tap(tester, chooseReply);
    expect(h.store.loadConversations().single.turns.single.text, 'Em mệt');
  });

  testWidgets('stale response ignored', (tester) async {
    final pending = Completer<http.Response>();
    final h = await pump(tester, (_) => pending.future);
    await tester.enterText(find.byKey(const Key('text')), 'Tùy anh');
    await tester.pump();
    await tester.ensureVisible(decodeButton);
    await tester.tap(decodeButton);
    await tester.pump();
    expect(h.bodies, hasLength(1));
    await tap(tester, find.text('Cuộc trò chuyện mới'));
    pending.complete(ok(result('m1')));
    await tester.pumpAndSettle();
    expect(find.text('m1'), findsNothing);
    expect(h.store.loadConversations(), isEmpty);
    expect(decodeButton, findsOneWidget);
  });

  testWidgets('api error shown and input kept', (tester) async {
    await pump(
      tester,
      (_) async => http.Response(
        jsonEncode({'error': 'Dài quá, tối đa 500 ký tự thôi.'}),
        400,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ),
    );
    await tester.enterText(find.byKey(const Key('text')), 'Tùy anh');
    await tap(tester, decodeButton);
    expect(find.text('Dài quá, tối đa 500 ký tự thôi.'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('text'))).controller!.text, 'Tùy anh');
  });
}
