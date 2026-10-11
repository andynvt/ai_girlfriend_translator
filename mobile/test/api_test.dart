import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:thongdichtinhyeu/api.dart';
import 'package:thongdichtinhyeu/models.dart';

Turn selectedTurn() => Turn(
  text: 'Ừ',
  analysis: Analysis(meaning: 'm', danger: 50, reply: 'r', avoid: 'a'),
  selection: 'reply',
  selectedReply: 'r',
  sentReply: 'đã gửi',
  createdAt: '2026-10-11T10:00:00.000Z',
  fromImage: false,
);

Future<DecodeResult> translate(Api api, {String? image, List<Turn> history = const []}) => api.translate(
  text: 'Tùy anh',
  context: 'ctx',
  imageDataUrl: image,
  direction: 'gf',
  language: 'vi',
  partnerName: 'Lan',
  history: history,
);

void main() {
  test('translate sends web-shaped body', () async {
    final bodies = <Map<String, dynamic>>[];
    final api = Api(
      baseUrl: 'https://x.test',
      client: MockClient((req) async {
        expect(req.url.toString(), 'https://x.test/api/translate');
        expect(req.headers['Content-Type'], startsWith('application/json'));
        bodies.add(jsonDecode(req.body));
        return http.Response(jsonEncode({'meaning': 'm', 'danger': 10, 'reply': 'r', 'avoid': 'a'}), 200);
      }),
    );
    await translate(api);
    await translate(api, image: 'data:image/jpeg;base64,AA==', history: [selectedTurn()]);
    expect(bodies[0], {'text': 'Tùy anh', 'context': 'ctx', 'direction': 'gf', 'language': 'vi', 'partnerName': 'Lan'});
    expect(bodies[1]['image'], 'data:image/jpeg;base64,AA==');
    expect(bodies[1]['history'], [selectedTurn().toHistoryJson()]);
  });

  test('translate parses result and sourceText', () async {
    final api = Api(
      baseUrl: 'https://x.test',
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'meaning': 'Có thể buồn', 'danger': 140, 'reply': 'r', 'avoid': 'a', 'sourceText': 'chat'}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      ),
    );
    final r = await translate(api);
    expect(r.analysis.meaning, 'Có thể buồn');
    expect(r.analysis.danger, 100);
    expect(r.sourceText, 'chat');
  });

  test('server error message surfaces', () async {
    final api = Api(
      baseUrl: 'https://x.test',
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'error': 'Dài quá, tối đa 500 ký tự thôi.'}),
          400,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      ),
    );
    await expectLater(
      translate(api),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Dài quá, tối đa 500 ký tự thôi.')),
    );
  });

  test('429 without body uses fallback', () async {
    final api = Api(baseUrl: 'https://x.test', client: MockClient((_) async => http.Response('', 429)));
    await expectLater(
      translate(api),
      throwsA(
        isA<ApiException>()
            .having((e) => e.status, 'status', 429)
            .having((e) => e.message, 'message', 'Bạn hỏi nhanh quá, thử lại sau ít phút nhé.'),
      ),
    );
  });

  test('other error without body uses generic message', () async {
    final api = Api(baseUrl: 'https://x.test', client: MockClient((_) async => http.Response('<html>', 502)));
    await expectLater(
      translate(api),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Có lỗi xảy ra, thử lại nhé.')),
    );
  });

  test('timeout maps to friendly error', () async {
    final api = Api(
      baseUrl: 'https://x.test',
      timeout: const Duration(milliseconds: 10),
      client: MockClient((_) => Completer<http.Response>().future),
    );
    await expectLater(
      translate(api),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Mạng chập chờn, thử lại nhé.')),
    );
  });

  test('network failure maps to friendly error', () async {
    final api = Api(baseUrl: 'https://x.test', client: MockClient((_) async => throw http.ClientException('offline')));
    await expectLater(
      translate(api),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Mạng chập chờn, thử lại nhé.')),
    );
  });

  test('speak returns bytes', () async {
    Map<String, dynamic>? body;
    final api = Api(
      baseUrl: 'https://x.test',
      client: MockClient((req) async {
        expect(req.url.path, '/api/speak');
        body = jsonDecode(req.body);
        return http.Response.bytes([1, 2, 3], 200, headers: {'content-type': 'audio/mpeg'});
      }),
    );
    expect(await api.speak(text: 'Xin chào', direction: 'bf', language: 'en'), [1, 2, 3]);
    expect(body, {'text': 'Xin chào', 'direction': 'bf', 'language': 'en'});
  });

  test('onboarding posts audio and returns profile fields', () async {
    final api = Api(
      baseUrl: 'https://x.test',
      client: MockClient((req) async {
        expect(req.url.path, '/api/onboarding');
        expect(jsonDecode(req.body), {'audio': 'data:audio/mp4;base64,AA==', 'language': 'vi'});
        return http.Response(
          jsonEncode({'transcript': 't', 'language': 'en', 'direction': null, 'partnerName': 'Emma'}),
          200,
        );
      }),
    );
    final r = await api.onboarding(audioDataUrl: 'data:audio/mp4;base64,AA==', language: 'vi');
    expect(r['language'], 'en');
    expect(r['direction'], isNull);
    expect(r['partnerName'], 'Emma');
  });
}
