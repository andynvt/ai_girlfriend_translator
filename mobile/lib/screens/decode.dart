import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:just_audio/just_audio.dart';

import '../api.dart';
import '../i18n.dart';
import '../models.dart';
import '../store.dart';
import '../theme.dart';
import '../widgets/danger_meter.dart';
import '../widgets/tim_bot.dart';

const maxImageDataUrl = 4 * 1024 * 1024;

const _examples = {
  'vi': {
    'gf': ['Em không sao đâu', 'Tùy anh', 'Anh đi đi, em không giận'],
    'bf': ['Anh bận chút', 'Ừ', 'Để anh suy nghĩ đã'],
  },
  'en': {
    'gf': ["I'm fine", 'Whatever you want', "Go ahead, I'm not mad"],
    'bf': ["I'm a little busy", 'Yeah', 'Let me think about it'],
  },
};

const _loadingLines = [
  'Đang đếm số dấu chấm cuối câu…',
  'Đang tra từ điển Dỗi – Việt…',
  'Đang đo nhiệt độ tin nhắn… 🌡️',
  'Đang so sánh với 1.000 lần “em không sao”…',
  'Đang kiểm tra lịch sử seen không rep…',
  'Đang hỏi ý kiến hội bạn thân…',
];

Future<String> fileToDataUrl(String path) async {
  final type = path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  return 'data:image/$type;base64,${base64Encode(await File(path).readAsBytes())}';
}

Future<String?> pickImageDataUrl(ImageSource source) async {
  final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, imageQuality: 80);
  return file == null ? null : fileToDataUrl(file.path);
}

class DecodeScreen extends StatefulWidget {
  const DecodeScreen({
    super.key,
    required this.store,
    required this.api,
    required this.profile,
    required this.onReset,
    required this.onOpenHistory,
    this.resume,
    this.initialImageDataUrl,
  });

  final Store store;
  final Api api;
  final Profile profile;
  final Conversation? resume;
  final String? initialImageDataUrl;
  final VoidCallback onReset;
  final VoidCallback onOpenHistory;

  @override
  State<DecodeScreen> createState() => DecodeScreenState();
}

class DecodeScreenState extends State<DecodeScreen> {
  final text = TextEditingController();
  final context_ = TextEditingController();
  final sentReply = TextEditingController();
  final sourceText = TextEditingController();
  Conversation? conversation;
  int version = 0;
  String? image;
  Uint8List? imageBytes;
  bool loading = false;
  int loadingLine = 0;
  Timer? _ticker;
  String error = '';
  String status = '';
  AudioPlayer? _player;
  bool preparingSpeech = false;
  bool speaking = false;

  String get lang => widget.profile.language;
  String tr(String key) => t(key, lang);
  List<Turn> get turns => conversation?.turns ?? const [];
  Turn? get last => turns.isEmpty ? null : turns.last;
  bool get atLimit => turns.length >= maxConversationTurns;
  bool get canDecode =>
      !loading &&
      !atLimit &&
      !(last != null && last!.selection == null) &&
      (text.text.trim().isNotEmpty || image != null);
  bool get sourceOk => !last!.fromImage || (sourceText.text.trim().isNotEmpty && sourceText.text.trim().length <= 1000);
  bool get canChoose => last != null && last!.selection == null && sourceOk;

  @override
  void initState() {
    super.initState();
    final resume = widget.resume;
    if (resume != null) {
      conversation = Conversation.fromJson(jsonDecode(jsonEncode(resume.toJson())));
      context_.text = resume.context;
      sentReply.text = last?.sentReply ?? '';
      sourceText.text = last?.text ?? '';
    }
    if (widget.initialImageDataUrl != null) attachImage(widget.initialImageDataUrl!);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _player?.dispose();
    for (final c in [text, context_, sentReply, sourceText]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Also used by the share-sheet intake.
  void attachImage(String dataUrl) {
    if (dataUrl.length > maxImageDataUrl) {
      setState(() => error = tr('Ảnh nặng quá (tối đa 4 MB).'));
      return;
    }
    setState(() {
      image = dataUrl;
      imageBytes = base64Decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
      error = '';
    });
  }

  void removeImage() => setState(() => image = imageBytes = null);

  Future<void> pick(ImageSource source) async {
    final v = version;
    try {
      final dataUrl = await pickImageDataUrl(source);
      if (dataUrl != null && mounted && v == version) attachImage(dataUrl);
    } on PlatformException {
      if (mounted) setState(() => error = tr('Có lỗi xảy ra, thử lại nhé.'));
    }
  }

  void stopSpeech() {
    _player?.stop();
    preparingSpeech = speaking = false;
  }

  void newConversation() {
    stopSpeech();
    _ticker?.cancel();
    setState(() {
      version++;
      conversation = null;
      loading = false;
      error = status = '';
      for (final c in [text, context_, sentReply, sourceText]) {
        c.clear();
      }
      image = imageBytes = null;
    });
  }

  Future<void> decode() async {
    if (!canDecode) return;
    conversation ??= Conversation(
      id: DateTime.now().microsecondsSinceEpoch.toRadixString(36) + Random().nextInt(1 << 30).toRadixString(36),
      profile: widget.profile,
    );
    final requestVersion = version;
    final conv = conversation!;
    final previous = last;
    if (previous?.selection != null) previous!.sentReply = sentReply.text.trim();
    final imageSnapshot = image;
    final requestText = text.text, requestContext = context_.text;
    stopSpeech();
    setState(() {
      error = '';
      loading = true;
      loadingLine = 0;
    });
    _ticker = Timer.periodic(const Duration(milliseconds: 1100), (_) => setState(() => loadingLine++));
    try {
      final r = await widget.api.translate(
        text: requestText,
        context: requestContext,
        imageDataUrl: imageSnapshot,
        direction: widget.profile.direction,
        language: lang,
        partnerName: widget.profile.partnerName,
        history: conv.turns,
      );
      if (!mounted || requestVersion != version) return;
      final turn = Turn(
        text: imageSnapshot != null ? (r.sourceText ?? '') : requestText.trim(),
        analysis: r.analysis,
        createdAt: DateTime.now().toUtc().toIso8601String(),
        fromImage: imageSnapshot != null,
      );
      setState(() {
        conv.context = requestContext.trim();
        conv.turns.add(turn);
        sourceText.text = turn.text;
      });
      final d = r.analysis.danger;
      d < 40
          ? HapticFeedback.lightImpact()
          : d < 70
          ? HapticFeedback.mediumImpact()
          : HapticFeedback.heavyImpact();
    } on ApiException catch (e) {
      if (mounted && requestVersion == version) setState(() => error = e.message);
    } finally {
      if (requestVersion == version) {
        _ticker?.cancel();
        if (mounted) setState(() => loading = false);
      }
    }
  }

  Future<bool> save() async {
    final ok = await widget.store.saveConversation(conversation!);
    final message = ok ? 'Đã lưu trên thiết bị.' : 'Lịch sử không hợp lệ; dữ liệu cũ được giữ nguyên.';
    if (mounted) setState(() => status = tr(message));
    return ok;
  }

  Future<void> choose(String selection) async {
    final turn = last;
    if (turn == null || turn.selection != null) return;
    if (!sourceOk) {
      setState(() => error = tr('Kiểm tra và nhập lời đọc từ ảnh trước khi lưu.'));
      return;
    }
    if (turn.fromImage) turn.text = sourceText.text.trim();
    final picked = turn.analysis.pick(selection);
    if (picked.trim().isEmpty) return;
    turn
      ..selection = selection
      ..selectedReply = picked;
    setState(() => error = '');
    await save();
    if (!mounted) return;
    text.clear();
    sentReply.clear();
    removeImage();
  }

  Future<void> saveSentReply() async {
    final turn = last;
    if (turn?.selection == null) return;
    turn!.sentReply = sentReply.text.trim();
    await save();
  }

  Future<void> speak() async {
    final meaning = last?.analysis.meaning;
    if (meaning == null || preparingSpeech) return;
    stopSpeech();
    final v = version;
    setState(() => preparingSpeech = true);
    try {
      final bytes = await widget.api.speak(text: meaning, direction: widget.profile.direction, language: lang);
      if (!mounted || v != version || !preparingSpeech) return;
      final player = _player ??= AudioPlayer();
      final file = await File('${Directory.systemTemp.path}/speak.mp3').writeAsBytes(bytes);
      await player.setFilePath(file.path);
      setState(() {
        preparingSpeech = false;
        speaking = true;
      });
      await player.play();
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } on PlayerException {
      if (mounted) setState(() => error = tr('Có lỗi xảy ra, thử lại nhé.'));
    } finally {
      if (mounted && v == version) setState(() => preparingSpeech = speaking = false);
    }
  }

  BotState get bot => loading
      ? BotState.waiting
      : speaking
      ? BotState.reading
      : last?.selection == null && last != null
      ? BotState.choose
      : BotState.input;

  Widget section(String title, String body, Color color) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: 12),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(tr(title), style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(body, style: const TextStyle(fontSize: 17)),
      ],
    ),
  );

  Widget input() {
    final followup = last?.selection != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          followup
              ? tr(widget.profile.direction == 'bf' ? 'Anh ấy trả lời thế nào?' : 'Cô ấy trả lời thế nào?')
              : tr('💌 Người ấy nói gì?'),
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('text'),
          controller: text,
          maxLength: 500,
          onChanged: (_) => setState(() {}),
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(
            labelText: tr('Lời nhắn cần giải mã'),
            helperText: tr('Tối đa 500 ký tự, hoặc chọn một ảnh đoạn chat.'),
          ),
        ),
        if (turns.isEmpty) ...[
          Text(tr('Thử một câu quen quen nhé ↓'), style: const TextStyle(color: AppColors.muted)),
          Wrap(
            spacing: 8,
            children: [
              for (final e in _examples[lang]![widget.profile.direction]!)
                ActionChip(label: Text(e), onPressed: () => setState(() => text.text = e)),
            ],
          ),
        ],
        if (followup)
          TextField(
            key: const Key('sentReply'),
            controller: sentReply,
            maxLength: 1000,
            decoration: InputDecoration(labelText: tr('Câu bạn thực sự đã gửi — không bắt buộc')),
            onSubmitted: (_) => saveSentReply(),
          ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('context'),
          controller: context_,
          enabled: turns.isEmpty,
          maxLength: 1000,
          maxLines: 3,
          minLines: 1,
          decoration: InputDecoration(
            labelText: tr('Bối cảnh — không bắt buộc'),
            helperText: tr('Trước đó hai người nói gì? Có chuyện gì vừa xảy ra? Tối đa 1.000 ký tự.'),
            helperMaxLines: 2,
          ),
        ),
        const SizedBox(height: 8),
        if (imageBytes != null)
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.memory(
                  imageBytes!,
                  height: 96,
                  semanticLabel: tr('Ảnh đoạn chat đã chọn'),
                  errorBuilder: (_, _, _) => const SizedBox(width: 96, height: 96, child: Icon(Icons.image)),
                ),
              ),
              TextButton(onPressed: removeImage, child: Text(tr('✕ Xóa ảnh'))),
            ],
          )
        else
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => pick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: Text(tr('Chọn ảnh đoạn chat')),
              ),
              OutlinedButton.icon(
                onPressed: () => pick(ImageSource.camera),
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(tr('Chụp ảnh')),
              ),
            ],
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: canDecode ? decode : null,
          child: Text(tr(loading ? 'Đang phân tích tâm lý…' : 'Giải mã! ✨')),
        ),
        if (atLimit || (last != null && !followup))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              tr(
                atLimit
                    ? 'Đã đạt giới hạn. Bắt đầu cuộc trò chuyện mới để hỏi tiếp.'
                    : 'Chọn một câu gợi ý trước khi hỏi tiếp.',
              ),
              style: const TextStyle(color: AppColors.muted),
            ),
          ),
      ],
    );
  }

  Widget result(Turn turn) {
    final a = turn.analysis;
    final pending = turn.selection == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${tr('Lượt')} ${turns.length}/$maxConversationTurns', style: const TextStyle(color: AppColors.muted)),
        if (turn.fromImage)
          TextField(
            key: const Key('sourceText'),
            controller: sourceText,
            enabled: pending,
            maxLines: 4,
            minLines: 1,
            decoration: InputDecoration(labelText: tr('Lời đọc từ ảnh — kiểm tra trước khi lưu')),
            onChanged: (_) => setState(() {}),
          ),
        section('🧠 Ý thật sự', a.meaning, AppColors.lavender),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: preparingSpeech ? null : speak,
            child: Text(tr(preparingSpeech ? 'Đang chuẩn bị giọng đọc…' : '🔊 Đọc tôi nghe')),
          ),
        ),
        DangerMeter(danger: a.danger, language: lang),
        section('💬 Nên trả lời', a.reply, AppColors.mint),
        if (pending)
          FilledButton(onPressed: canChoose ? () => choose('reply') : null, child: Text(tr('Chọn câu này & lưu'))),
        section('🙊 Tuyệt đối đừng nói', a.avoid, AppColors.primarySoft),
        if (pending)
          FilledButton(onPressed: canChoose ? () => choose('avoid') : null, child: Text(tr('Chọn câu này & lưu'))),
        if (!pending) ...[
          const SizedBox(height: 8),
          Text('${tr('Bạn đã chọn:')} ${turn.selectedReply}', style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ],
    );
  }

  Widget log() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (var i = 0; i < turns.length - 1; i++)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              [
                '${tr('Lượt')} ${i + 1} · ${tr('Người ấy:')} ${turns[i].text}',
                turns[i].analysis.meaning,
                '${tr('Bạn đã chọn:')} ${turns[i].selectedReply}',
                if (turns[i].sentReply.isNotEmpty) '${tr('Đã gửi:')} ${turns[i].sentReply}',
              ].join('\n'),
            ),
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text('${widget.profile.partnerName} 💗'),
      actions: [
        IconButton(onPressed: widget.onOpenHistory, icon: const Icon(Icons.history), tooltip: tr('Lịch sử')),
        PopupMenuButton<VoidCallback>(
          onSelected: (f) => f(),
          itemBuilder: (_) => [PopupMenuItem(value: widget.onReset, child: Text(tr('Làm lại từ đầu')))],
        ),
      ],
    ),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                TimBot(state: bot, size: 80),
                const SizedBox(width: 8),
                Expanded(
                  child: loading
                      ? Semantics(liveRegion: true, child: Text(tr(_loadingLines[loadingLine % _loadingLines.length])))
                      : Text(
                          tr(last == null ? 'Bạn nhập lời nhắn hoặc gửi ảnh đoạn chat nhé 💌' : 'Kết quả giải mã'),
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                        ),
                ),
                TextButton(onPressed: newConversation, child: Text(tr('Cuộc trò chuyện mới'))),
              ],
            ),
            if (error.isNotEmpty)
              Semantics(
                liveRegion: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    error,
                    style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            log(),
            if (last != null)
              Card(
                child: Padding(padding: const EdgeInsets.all(16), child: result(last!)),
              ),
            const SizedBox(height: 12),
            Card(
              child: Padding(padding: const EdgeInsets.all(16), child: input()),
            ),
            if (status.isNotEmpty) Text(status, style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 12),
            Text(
              tr('Giải mã cho vui thôi nhé. Muốn hiểu thật, hãy hỏi người ấy 💗'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted),
            ),
          ],
        ),
      ),
    ),
  );
}
