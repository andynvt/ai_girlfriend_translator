import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// Same keys and JSON as the web app's localStorage.
class Store {
  Store(this._prefs);

  static const profileKey = 'love-interpreter.preferences.v1';
  static const historyKey = 'love-interpreter.conversations.v1';
  final SharedPreferences _prefs;

  Object? _read(String key) {
    try {
      final raw = _prefs.getString(key);
      return raw == null ? null : jsonDecode(raw);
    } on FormatException {
      return null;
    }
  }

  Profile? loadProfile() => Profile.fromJson(_read(profileKey));

  Future<bool> saveProfile(Profile p) => _prefs.setString(profileKey, jsonEncode(p.toJson()));

  Future<void> clearProfile() => _prefs.remove(profileKey);

  /// Invalid records are skipped, never thrown.
  List<Conversation> loadConversations() {
    final raw = _read(historyKey);
    return raw is List ? raw.map(Conversation.fromJson).whereType<Conversation>().toList() : [];
  }

  Future<bool> saveConversation(Conversation c) async {
    final snapshot = Conversation.fromJson(jsonDecode(jsonEncode(c.toJson())));
    if (snapshot == null) return false;
    return _write([snapshot, ...loadConversations().where((x) => x.id != c.id)]);
  }

  Future<bool> deleteConversation(String id) => _write(loadConversations().where((x) => x.id != id).toList());

  Future<bool> _write(List<Conversation> list) =>
      _prefs.setString(historyKey, jsonEncode(list.map((c) => c.toJson()).toList()));
}
