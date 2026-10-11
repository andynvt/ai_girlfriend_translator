import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:thongdichtinhyeu/models.dart';
import 'package:thongdichtinhyeu/store.dart';

const historyKey = 'love-interpreter.conversations.v1';
const profileKey = 'love-interpreter.preferences.v1';
final profileJson = {'language': 'vi', 'direction': 'gf', 'partnerName': 'Lan', 'onboardingCompleted': true};

Map<String, dynamic> conv(String id) => {
  'id': id,
  'profile': profileJson,
  'context': '',
  'turns': [
    {
      'text': 'Ừ',
      'analysis': {'meaning': 'm', 'danger': 50, 'reply': 'r', 'avoid': 'a'},
      'selection': null,
      'selectedReply': '',
      'sentReply': '',
      'createdAt': '2026-10-11T10:00:00.000Z',
      'fromImage': false,
    },
  ],
};

Future<Store> storeWith(Map<String, Object> values) async {
  SharedPreferences.setMockInitialValues(values);
  return Store(await SharedPreferences.getInstance());
}

void main() {
  test('corrupt history skipped', () async {
    final store = await storeWith({
      historyKey: jsonEncode([
        conv('a'),
        {'id': 1},
        'x',
      ]),
    });
    expect(store.loadConversations().map((c) => c.id), ['a']);
  });

  test('invalid JSON returns empty', () async {
    final store = await storeWith({historyKey: '{', profileKey: 'nope'});
    expect(store.loadConversations(), isEmpty);
    expect(store.loadProfile(), isNull);
  });

  test('save moves to top and dedupes', () async {
    final store = await storeWith({
      historyKey: jsonEncode([conv('a'), conv('b')]),
    });
    final b = Conversation.fromJson(conv('b'))!..context = 'mới';
    expect(await store.saveConversation(b), isTrue);
    final list = store.loadConversations();
    expect(list.map((c) => c.id), ['b', 'a']);
    expect(list.first.context, 'mới');
  });

  test('save refuses invalid conversation and keeps old data', () async {
    final store = await storeWith({
      historyKey: jsonEncode([conv('a')]),
    });
    final bad = Conversation.fromJson(conv('b'))!..turns.clear();
    expect(await store.saveConversation(bad), isFalse);
    expect(store.loadConversations().map((c) => c.id), ['a']);
  });

  test('delete removes by id', () async {
    final store = await storeWith({
      historyKey: jsonEncode([conv('a'), conv('b')]),
    });
    expect(await store.deleteConversation('a'), isTrue);
    expect(store.loadConversations().map((c) => c.id), ['b']);
  });

  test('profile round-trip and clear', () async {
    final store = await storeWith({});
    expect(store.loadProfile(), isNull);
    await store.saveProfile(Profile.fromJson(profileJson)!);
    expect(store.loadProfile()!.partnerName, 'Lan');
    await store.clearProfile();
    expect(store.loadProfile(), isNull);
  });
}
