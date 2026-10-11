import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:thongdichtinhyeu/api.dart';
import 'package:thongdichtinhyeu/models.dart';
import 'package:thongdichtinhyeu/screens/onboarding.dart';
import 'package:thongdichtinhyeu/store.dart';

class FakeRecorder implements VoiceRecorder {
  FakeRecorder({this.allowed = true});

  final bool allowed;
  bool recording = false;

  @override
  Future<bool> start() async => recording = allowed;

  @override
  Future<String?> stop() async {
    recording = false;
    return 'data:audio/mp4;base64,AA==';
  }

  @override
  Future<void> cancel() async => recording = false;
}

class Harness {
  Profile? done;
  late Store store;
}

Future<Harness> pump(WidgetTester tester, {String voiceJson = '{}', bool micAllowed = true, Profile? initial}) async {
  SharedPreferences.setMockInitialValues({});
  final h = Harness()..store = Store(await SharedPreferences.getInstance());
  final api = Api(baseUrl: 'https://x.test', client: MockClient((_) async => http.Response(voiceJson, 200)));
  await tester.pumpWidget(
    MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: OnboardingScreen(
          store: h.store,
          api: api,
          recorder: FakeRecorder(allowed: micAllowed),
          initial: initial,
          onDone: (p) => h.done = p,
        ),
      ),
    ),
  );
  return h;
}

Future<void> tap(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text));
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

final seal = find.byKey(const Key('seal'));
// The selected option is the one circled in ink, like the web letter.
bool picked(WidgetTester tester, String label) => find.byKey(Key('ink-$label')).evaluate().isNotEmpty;

void main() {
  testWidgets('chosen option is circled with a ring that draws in', (tester) async {
    await pump(tester);
    await tester.tap(find.text('English'));
    await tester.pump(const Duration(milliseconds: 100));
    final ring = find.ancestor(of: find.byKey(const Key('ink-English')), matching: find.byType(ClipRect));
    final box = tester.renderObject<RenderClipRect>(ring.first);
    expect(box.clipper!.getClip(box.size).width, lessThan(box.size.width), reason: 'ring still being drawn');
    await tester.pumpAndSettle();
    expect(box.clipper!.getClip(box.size).width, greaterThanOrEqualTo(box.size.width));
  });

  testWidgets('letter is one screen with language preselected and seal disabled', (tester) async {
    await pump(tester);
    expect(find.text('Thân gửi Tim,'), findsOneWidget);
    expect(picked(tester, 'Tiếng Việt'), isTrue);
    expect(tester.widget<FilledButton>(seal).onPressed, isNull);
  });

  testWidgets('switching to English rewrites the letter', (tester) async {
    await pump(tester);
    await tap(tester, 'English');
    expect(find.text('Dear Tim,'), findsOneWidget);
    expect(find.text('Seal & send 💌'), findsOneWidget);
  });

  testWidgets('seal needs direction and a non-blank name', (tester) async {
    await pump(tester);
    await tap(tester, 'bạn gái');
    expect(tester.widget<FilledButton>(seal).onPressed, isNull);
    await tester.enterText(find.byType(TextField), '   ');
    await tester.pump();
    expect(tester.widget<FilledButton>(seal).onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'Lan');
    await tester.pump();
    expect(tester.widget<FilledButton>(seal).onPressed, isNotNull);
  });

  testWidgets('sealing saves the trimmed profile and calls onDone', (tester) async {
    final h = await pump(tester);
    await tap(tester, 'bạn trai');
    await tester.enterText(find.byType(TextField), '  Minh ');
    await tester.pump();
    await tester.ensureVisible(seal);
    await tester.tap(seal);
    await tester.pumpAndSettle();
    expect(h.done!.partnerName, 'Minh');
    expect(h.store.loadProfile()!.direction, 'bf');
  });

  testWidgets('voice result fills the letter without sealing it', (tester) async {
    final h = await pump(tester, voiceJson: '{"transcript":"t","language":"en","direction":"bf","partnerName":"Emma"}');
    await tap(tester, '🎤 Thiết lập bằng giọng nói');
    await tap(tester, 'Dừng và xử lý');
    expect(picked(tester, 'English'), isTrue);
    expect(picked(tester, 'boyfriend'), isTrue);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'Emma');
    expect(
      tester
          .widget<FilledButton>(seal.evaluate().isEmpty ? find.widgetWithText(FilledButton, 'Seal & send 💌') : seal)
          .onPressed,
      isNotNull,
    );
    expect(h.done, isNull);
  });

  testWidgets('voice null field leaves it blank and seal disabled', (tester) async {
    await pump(tester, voiceJson: '{"transcript":"t","language":"vi","direction":null,"partnerName":"Lan"}');
    await tap(tester, '🎤 Thiết lập bằng giọng nói');
    await tap(tester, 'Dừng và xử lý');
    expect(picked(tester, 'bạn gái'), isFalse);
    expect(picked(tester, 'bạn trai'), isFalse);
    expect(find.textContaining('Đã điền theo lời nói'), findsOneWidget);
    expect(tester.widget<FilledButton>(seal).onPressed, isNull);
  });

  testWidgets('mic denied shows manual hint', (tester) async {
    await pump(tester, micAllowed: false);
    await tap(tester, '🎤 Thiết lập bằng giọng nói');
    expect(find.text('Không thể ghi âm. Bạn vẫn có thể nhập bằng tay.'), findsOneWidget);
    expect(find.text('🎤 Thiết lập bằng giọng nói'), findsNothing);
  });

  testWidgets('start over keeps language, clears the rest, cancel returns old profile', (tester) async {
    final old = Profile(language: 'en', direction: 'bf', partnerName: 'Minh');
    final h = await pump(tester, initial: old);
    expect(picked(tester, 'English'), isTrue);
    expect(picked(tester, 'boyfriend'), isFalse);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    await tap(tester, 'Cancel changes');
    expect(h.done, same(old));
  });
}
