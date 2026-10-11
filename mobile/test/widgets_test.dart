import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:thongdichtinhyeu/widgets/danger_meter.dart';
import 'package:thongdichtinhyeu/widgets/tim_bot.dart';

Widget host(Widget child, {bool disableAnimations = false}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: disableAnimations),
    child: Scaffold(body: child),
  ),
);

void main() {
  testWidgets('danger meter shows number and label', (tester) async {
    await tester.pumpWidget(host(const DangerMeter(danger: 72, language: 'vi')));
    await tester.pumpAndSettle();
    expect(find.text('72'), findsOneWidget);
    expect(find.text('Báo động đỏ'), findsOneWidget);
  });

  testWidgets('danger meter label follows language', (tester) async {
    await tester.pumpWidget(host(const DangerMeter(danger: 10, language: 'en')));
    await tester.pumpAndSettle();
    expect(find.text('All good'), findsOneWidget);
  });

  testWidgets('tim bot static when animations disabled', (tester) async {
    await tester.pumpWidget(host(const TimBot(state: BotState.waiting), disableAnimations: true));
    await tester.pump(const Duration(seconds: 1));
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('tim bot loops while waiting', (tester) async {
    await tester.pumpWidget(host(const TimBot(state: BotState.waiting)));
    await tester.pump(const Duration(seconds: 2));
    expect(tester.hasRunningAnimations, isTrue);
  });

  testWidgets('tim bot greet plays once then stops', (tester) async {
    await tester.pumpWidget(host(const TimBot(state: BotState.greet)));
    await tester.pump(const Duration(seconds: 2));
    expect(tester.hasRunningAnimations, isFalse);
  });
}
