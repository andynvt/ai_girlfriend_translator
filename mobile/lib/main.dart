import 'dart:io';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'models.dart';
import 'screens/decode.dart';
import 'screens/history.dart';
import 'screens/onboarding.dart';
import 'share_intake.dart';
import 'store.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(App(store: Store(await SharedPreferences.getInstance()), api: Api(), share: ShareIntake()));
}

class App extends StatefulWidget {
  const App({super.key, required this.store, required this.api, this.share});

  final Store store;
  final Api api;
  final ShareIntake? share;

  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  final _nav = GlobalKey<NavigatorState>();
  // New key per session (new profile or resumed conversation) = fresh DecodeScreen; stale responses die with the old one.
  var _decode = GlobalKey<DecodeScreenState>();
  late Profile? profile = widget.store.loadProfile();
  Conversation? resume;
  String? sharedImage;

  @override
  void initState() {
    super.initState();
    widget.share?.addListener(takeShare);
  }

  @override
  void dispose() {
    widget.share?.removeListener(takeShare);
    super.dispose();
  }

  void startSession(Profile p, [Conversation? c]) {
    setState(() {
      profile = p;
      resume = c;
      sharedImage = null;
      _decode = GlobalKey();
    });
    takeShare();
  }

  /// A shared image opens a new conversation; before onboarding it waits in [ShareIntake].
  Future<void> takeShare() async {
    final path = widget.share?.pendingImagePath;
    debugPrint("takeShare path=$path profile=$profile");
    if (path == null || profile == null) return;
    widget.share!.consume();
    final String dataUrl;
    try {
      dataUrl = await fileToDataUrl(path);
      debugPrint("read ok");
    } on FileSystemException {
      return;
    }
    if (!mounted) return;
    _nav.currentState?.popUntil((r) => r.isFirst);
    setState(() {
      resume = null;
      sharedImage = dataUrl;
      _decode = GlobalKey();
    });
  }

  // Pushed as a route so cancelling (button or back gesture) keeps the current conversation, like the web.
  void startOver() => _nav.currentState!.push(
    MaterialPageRoute<void>(
      builder: (_) => OnboardingScreen(
        store: widget.store,
        api: widget.api,
        initial: profile,
        onDone: (p) {
          _nav.currentState!.pop();
          if (!identical(p, profile)) startSession(p);
        },
      ),
    ),
  );

  void openHistory() => _nav.currentState!.push(
    MaterialPageRoute<void>(
      builder: (_) => HistoryScreen(
        store: widget.store,
        language: profile!.language,
        onOpen: (c) {
          _nav.currentState!.pop();
          widget.store.saveProfile(c.profile);
          startSession(c.profile, c);
        },
        onDeleted: (id) {
          if (_decode.currentState?.conversation?.id == id) _decode.currentState!.newConversation();
        },
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: _nav,
    title: 'Thông Dịch Viên Tình Yêu',
    theme: appTheme(),
    home: profile == null
        ? OnboardingScreen(store: widget.store, api: widget.api, onDone: startSession)
        : DecodeScreen(
            key: _decode,
            store: widget.store,
            api: widget.api,
            profile: profile!,
            resume: resume,
            initialImageDataUrl: sharedImage,
            onReset: startOver,
            onOpenHistory: openHistory,
          ),
  );
}
