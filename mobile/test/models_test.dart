import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:thongdichtinhyeu/models.dart';

Map<String, dynamic> webConversation() => jsonDecode(
  jsonEncode({
    'id': 'abc123',
    'profile': {'language': 'vi', 'direction': 'gf', 'partnerName': 'Lan', 'onboardingCompleted': true},
    'context': 'Vừa cãi nhau',
    'turns': [
      {
        'text': 'Em không sao đâu',
        'analysis': {'meaning': 'Có sao.', 'danger': 85, 'reply': 'Anh xin lỗi.', 'avoid': 'Ừ.'},
        'selection': 'reply',
        'selectedReply': 'Anh xin lỗi.',
        'sentReply': 'Anh xin lỗi em.',
        'createdAt': '2026-10-11T10:00:00.000Z',
        'fromImage': false,
      },
      {
        'text': 'Tùy anh',
        'analysis': {'meaning': 'Không tùy.', 'danger': 70, 'reply': 'Em chọn nhé.', 'avoid': 'Ok tùy.'},
        'selection': null,
        'selectedReply': '',
        'sentReply': '',
        'createdAt': '2026-10-11T10:05:00.000Z',
        'fromImage': true,
      },
    ],
  }),
) as Map<String, dynamic>;

void main() {
  test('web conversation round-trips', () {
    final j = webConversation();
    expect(Conversation.fromJson(j)!.toJson(), j);
  });

  test('rejects selection null on non-last turn', () {
    final j = webConversation();
    (j['turns'] as List)[0]['selection'] = null;
    (j['turns'] as List)[0]['selectedReply'] = '';
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects selection without selected reply', () {
    final j = webConversation();
    (j['turns'] as List)[0]['selectedReply'] = ' ';
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects empty text', () {
    final j = webConversation();
    (j['turns'] as List)[0]['text'] = '  ';
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects 51 turns', () {
    final j = webConversation();
    final turn = (j['turns'] as List)[0];
    j['turns'] = [...List.filled(50, turn), (j['turns'] as List)[1]];
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects bad createdAt', () {
    final j = webConversation();
    (j['turns'] as List)[0]['createdAt'] = 'yesterday';
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects fromImage missing', () {
    final j = webConversation();
    (j['turns'] as List)[0].remove('fromImage');
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects stored danger out of range', () {
    final j = webConversation();
    (j['turns'] as List)[0]['analysis']['danger'] = 101;
    expect(Conversation.fromJson(j), isNull);
  });

  test('rejects non-map input', () {
    expect(Conversation.fromJson('x'), isNull);
    expect(Conversation.fromJson({'id': 1}), isNull);
  });

  test('analysis from API clamps danger and fills missing fields', () {
    expect(Analysis.fromApi({'danger': 140}).danger, 100);
    expect(Analysis.fromApi({'danger': -3}).danger, 0);
    expect(Analysis.fromApi({'danger': 41.6, 'meaning': 'x'}).danger, 42);
    expect(Analysis.fromApi({}).reply, '');
  });

  test('danger labels', () {
    expect(dangerLabelKey(39), 'Êm đẹp');
    expect(dangerLabelKey(40), 'Có mùi dỗi');
    expect(dangerLabelKey(69), 'Có mùi dỗi');
    expect(dangerLabelKey(70), 'Báo động đỏ');
  });

  test('profile validation', () {
    const ok = {'language': 'en', 'direction': 'bf', 'partnerName': 'Emma', 'onboardingCompleted': true};
    expect(Profile.fromJson(ok)!.toJson(), ok);
    expect(Profile.fromJson({...ok, 'partnerName': 'a' * 61}), isNull);
    expect(Profile.fromJson({...ok, 'partnerName': ' '}), isNull);
    expect(Profile.fromJson({...ok, 'partnerName': 'a\nb'}), isNull);
    expect(Profile.fromJson({...ok, 'language': 'fr'}), isNull);
    expect(Profile.fromJson({...ok, 'onboardingCompleted': false}), isNull);
  });

  test('history json matches web request shape', () {
    final c = Conversation.fromJson(webConversation())!;
    expect(c.turns[0].toHistoryJson(), {
      'text': 'Em không sao đâu',
      'analysis': {'meaning': 'Có sao.', 'danger': 85, 'reply': 'Anh xin lỗi.', 'avoid': 'Ừ.'},
      'selection': 'reply',
      'selectedReply': 'Anh xin lỗi.',
      'sentReply': 'Anh xin lỗi em.',
    });
  });
}
