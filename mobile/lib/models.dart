// Mirrors the web app's stored JSON (js/app.js, js/onboarding.js) so both clients share one shape.

const maxConversationTurns = 10;
const _maxStoredTurns = 50;
final _control = RegExp(r'[\u0000-\u001f\u007f]');

String dangerLabelKey(int danger) => danger < 40
    ? 'Êm đẹp'
    : danger < 70
    ? 'Có mùi dỗi'
    : 'Báo động đỏ';

bool _str(Object? v, [int max = 1000]) => v is String && v.length <= max;

class Profile {
  Profile({required this.language, required this.direction, required this.partnerName});

  final String language;
  final String direction;
  final String partnerName;

  static bool validName(String name) => name.trim().isNotEmpty && name.length <= 60 && !_control.hasMatch(name);

  static Profile? fromJson(Object? j) {
    if (j is! Map ||
        j['onboardingCompleted'] != true ||
        !const ['vi', 'en'].contains(j['language']) ||
        !const ['gf', 'bf'].contains(j['direction']) ||
        j['partnerName'] is! String ||
        !validName(j['partnerName'] as String)) {
      return null;
    }
    return Profile(language: j['language'], direction: j['direction'], partnerName: j['partnerName']);
  }

  Map<String, dynamic> toJson() => {
    'language': language,
    'direction': direction,
    'partnerName': partnerName,
    'onboardingCompleted': true,
  };
}

class Analysis {
  Analysis({required this.meaning, required this.danger, required this.reply, required this.avoid});

  final String meaning;
  final int danger;
  final String reply;
  final String avoid;

  /// Lenient parse of a server response: same normalisation as `normalize()` in api/translate.js.
  factory Analysis.fromApi(Map j) {
    String s(Object? v) => v is String ? v : '';
    final d = j['danger'] is num ? (j['danger'] as num).round() : 0;
    return Analysis(meaning: s(j['meaning']), danger: d.clamp(0, 100), reply: s(j['reply']), avoid: s(j['avoid']));
  }

  /// Strict parse of stored data.
  static Analysis? fromJson(Object? j) {
    if (j is! Map || j['danger'] is! int || (j['danger'] as int) < 0 || (j['danger'] as int) > 100) return null;
    if (!['meaning', 'reply', 'avoid'].every((k) => _str(j[k]))) return null;
    return Analysis(meaning: j['meaning'], danger: j['danger'], reply: j['reply'], avoid: j['avoid']);
  }

  String pick(String selection) => selection == 'reply' ? reply : avoid;

  Map<String, dynamic> toJson() => {'meaning': meaning, 'danger': danger, 'reply': reply, 'avoid': avoid};
}

class Turn {
  Turn({
    required this.text,
    required this.analysis,
    required this.createdAt,
    required this.fromImage,
    this.selection,
    this.selectedReply = '',
    this.sentReply = '',
  });

  String text;
  final Analysis analysis;
  String? selection;
  String selectedReply;
  String sentReply;
  final String createdAt;
  final bool fromImage;

  static Turn? _fromJson(Object? j) {
    if (j is! Map || !['text', 'selectedReply', 'sentReply', 'createdAt'].every((k) => _str(j[k]))) return null;
    if ((j['text'] as String).trim().isEmpty || DateTime.tryParse(j['createdAt']) == null || j['fromImage'] is! bool) {
      return null;
    }
    if (!const [null, 'reply', 'avoid'].contains(j['selection'])) return null;
    final analysis = Analysis.fromJson(j['analysis']);
    if (analysis == null) return null;
    return Turn(
      text: j['text'],
      analysis: analysis,
      selection: j['selection'],
      selectedReply: j['selectedReply'],
      sentReply: j['sentReply'],
      createdAt: j['createdAt'],
      fromImage: j['fromImage'],
    );
  }

  Map<String, dynamic> toHistoryJson() => {
    'text': text,
    'analysis': analysis.toJson(),
    'selection': selection,
    'selectedReply': selectedReply,
    'sentReply': sentReply,
  };

  Map<String, dynamic> toJson() => {...toHistoryJson(), 'createdAt': createdAt, 'fromImage': fromImage};
}

class Conversation {
  Conversation({required this.id, required this.profile, this.context = '', List<Turn>? turns}) : turns = turns ?? [];

  final String id;
  final Profile profile;
  String context;
  final List<Turn> turns;

  static Conversation? fromJson(Object? j) {
    if (j is! Map || !_str(j['id'], 100) || !_str(j['context'])) return null;
    final profile = Profile.fromJson(j['profile']);
    final raw = j['turns'];
    if (profile == null || raw is! List || raw.isEmpty || raw.length > _maxStoredTurns) return null;
    final turns = <Turn>[];
    for (var i = 0; i < raw.length; i++) {
      final turn = Turn._fromJson(raw[i]);
      if (turn == null) return null;
      final pending = turn.selection == null;
      if (pending && (i != raw.length - 1 || turn.selectedReply.isNotEmpty)) return null;
      if (!pending && turn.selectedReply.trim().isEmpty) return null;
      turns.add(turn);
    }
    return Conversation(id: j['id'], profile: profile, context: j['context'], turns: turns);
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'profile': profile.toJson(),
    'context': context,
    'turns': turns.map((t) => t.toJson()).toList(),
  };
}
