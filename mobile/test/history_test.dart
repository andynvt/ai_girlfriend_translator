import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:thongdichtinhyeu/api.dart';
import 'package:thongdichtinhyeu/main.dart';
import 'package:thongdichtinhyeu/models.dart';
import 'package:thongdichtinhyeu/screens/history.dart';
import 'package:thongdichtinhyeu/store.dart';

final lan = Profile(language: 'vi', direction: 'gf', partnerName: 'Lan');
final minh = Profile(language: 'en', direction: 'bf', partnerName: 'Minh');

Conversation conv(String id, Profile p, String text) => Conversation(
  id: id,
  profile: p,
  turns: [
    Turn(
      text: text,
      analysis: Analysis(meaning: 'meaning-$id', danger: 30, reply: 'r', avoid: 'a'),
      createdAt: '2026-10-11T10:00:00.000Z',
      fromImage: false,
      selection: 'reply',
      selectedReply: 'r',
    ),
  ],
);

Future<Store> seeded(List<Conversation> list, {Profile? profile}) async {
  SharedPreferences.setMockInitialValues({});
  final store = Store(await SharedPreferences.getInstance());
  if (profile != null) await store.saveProfile(profile);
  for (final c in list.reversed) {
    await store.saveConversation(c);
  }
  return store;
}

Future<void> pumpHistory(WidgetTester tester, Store store, {void Function(Conversation)? onOpen}) => tester.pumpWidget(
  MaterialApp(
    home: HistoryScreen(store: store, language: 'vi', onOpen: onOpen ?? (_) {}),
  ),
);

void main() {
  testWidgets('lists saved conversations', (tester) async {
    final store = await seeded([conv('a', lan, 'Tùy anh'), conv('b', minh, 'x' * 80)]);
    await pumpHistory(tester, store);
    expect(find.textContaining('Lan'), findsOneWidget);
    expect(find.textContaining('Tùy anh'), findsOneWidget);
    expect(find.textContaining('${'x' * 60}…'), findsOneWidget);
  });

  testWidgets('empty state', (tester) async {
    await pumpHistory(tester, await seeded([]));
    expect(find.text('Chưa có lịch sử đã lưu.'), findsOneWidget);
  });

  testWidgets('delete asks confirmation then removes', (tester) async {
    final store = await seeded([conv('a', lan, 'Tùy anh')]);
    await pumpHistory(tester, store);
    await tester.tap(find.byTooltip('Xóa cuộc này'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hủy'));
    await tester.pumpAndSettle();
    expect(store.loadConversations(), hasLength(1));
    await tester.tap(find.byTooltip('Xóa cuộc này'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Xóa cuộc này'));
    await tester.pumpAndSettle();
    expect(store.loadConversations(), isEmpty);
    expect(find.text('Chưa có lịch sử đã lưu.'), findsOneWidget);
  });

  testWidgets('open resumes conversation with its profile', (tester) async {
    final store = await seeded([conv('b', minh, 'Busy')], profile: lan);
    final api = Api(baseUrl: 'https://x.test', client: MockClient((_) async => http.Response('{}', 500)));
    await tester.pumpWidget(App(store: store, api: api));
    await tester.tap(find.byTooltip('Lịch sử'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Busy'));
    await tester.pumpAndSettle();
    expect(find.text('meaning-b'), findsOneWidget);
    expect(find.text('Minh 💗'), findsOneWidget);
    expect(store.loadProfile()!.partnerName, 'Minh');
  });
}
