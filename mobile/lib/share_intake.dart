import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

List<String> _images(List<SharedMediaFile> files) =>
    files.where((f) => f.type == SharedMediaType.image).map((f) => f.path).toList();

/// Holds the first image shared into the app (cold start or while running) until the shell consumes it.
class ShareIntake extends ChangeNotifier {
  ShareIntake({Stream<List<String>>? stream, Future<List<String>> Function()? initial, VoidCallback? reset})
    : _reset = reset ?? ReceiveSharingIntent.instance.reset {
    _sub = (stream ?? ReceiveSharingIntent.instance.getMediaStream().map(_images)).listen(_take);
    (initial ?? () async => _images(await ReceiveSharingIntent.instance.getInitialMedia()))().then(_take);
  }

  final VoidCallback _reset;
  late final StreamSubscription<List<String>> _sub;
  String? pendingImagePath;

  void _take(List<String> paths) {
    if (paths.isEmpty) return;
    pendingImagePath = paths.first;
    notifyListeners();
  }

  void consume() {
    pendingImagePath = null;
    _reset();
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
