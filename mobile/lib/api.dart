import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:http/http.dart' as http;

import 'i18n.dart';
import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, [this.status]);

  final String message;
  final int? status;

  @override
  String toString() => message;
}

class DecodeResult {
  DecodeResult(this.analysis, this.sourceText);

  final Analysis analysis;
  final String? sourceText;
}

// --dart-define=API_BASE_URL wins; debug builds fall back to `vercel dev` on the host machine
// (10.0.2.2 is the host as seen from the Android emulator). Release builds must define it.
String get _defaultBase {
  const defined = String.fromEnvironment('API_BASE_URL');
  if (defined.isNotEmpty || !kDebugMode) return defined;
  return Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

/// Client for the existing Vercel endpoints (api/translate.js, api/speak.js, api/onboarding.js).
class Api {
  Api({http.Client? client, String? baseUrl, this.timeout = const Duration(seconds: 30)})
    : _client = client ?? http.Client(),
      _base = baseUrl ?? _defaultBase;

  final http.Client _client;
  final String _base;
  final Duration timeout;

  Future<DecodeResult> translate({
    required String text,
    required String context,
    String? imageDataUrl,
    required String direction,
    required String language,
    required String partnerName,
    required List<Turn> history,
  }) async {
    final r = await _post('translate', language, {
      'text': text,
      'context': context,
      'image': ?imageDataUrl,
      'direction': direction,
      'language': language,
      'partnerName': partnerName,
      if (history.isNotEmpty) 'history': history.map((t) => t.toHistoryJson()).toList(),
    });
    final j = _json(r, language);
    return DecodeResult(Analysis.fromApi(j), j['sourceText'] is String ? j['sourceText'] : null);
  }

  Future<Uint8List> speak({required String text, required String direction, required String language}) async =>
      (await _post('speak', language, {'text': text, 'direction': direction, 'language': language})).bodyBytes;

  Future<Map<String, dynamic>> onboarding({required String audioDataUrl, required String language}) async =>
      _json(await _post('onboarding', language, {'audio': audioDataUrl, 'language': language}), language);

  Future<http.Response> _post(String path, String language, Map<String, dynamic> body) async {
    final http.Response r;
    try {
      r = await _client
          .post(Uri.parse('$_base/api/$path'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(timeout);
    } on TimeoutException {
      throw ApiException(t('Mạng chập chờn, thử lại nhé.', language));
    } on http.ClientException {
      throw ApiException(t('Mạng chập chờn, thử lại nhé.', language));
    }
    if (r.statusCode >= 200 && r.statusCode < 300) return r;
    final error = _tryJson(r)?['error'];
    if (error is String && error.isNotEmpty) throw ApiException(error, r.statusCode);
    throw ApiException(
      r.statusCode == 429
          ? t('Bạn hỏi nhanh quá, thử lại sau ít phút nhé.', language)
          : t('Có lỗi xảy ra, thử lại nhé.', language),
      r.statusCode,
    );
  }

  Map<String, dynamic>? _tryJson(http.Response r) {
    try {
      final j = jsonDecode(utf8.decode(r.bodyBytes));
      return j is Map<String, dynamic> ? j : null;
    } on FormatException {
      return null;
    }
  }

  Map<String, dynamic> _json(http.Response r, String language) =>
      _tryJson(r) ?? (throw ApiException(t('Có lỗi xảy ra, thử lại nhé.', language), r.statusCode));
}
