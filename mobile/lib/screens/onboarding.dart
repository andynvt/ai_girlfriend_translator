import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:record/record.dart';

import '../api.dart';
import '../i18n.dart';
import '../models.dart';
import '../store.dart';
import '../theme.dart';
import '../widgets/tim_bot.dart';

const _maxAudioBytes = 2 * 1024 * 1024;

/// Seam for the microphone so widget tests can run without one.
abstract class VoiceRecorder {
  /// Returns false when the microphone is unavailable or permission is denied.
  Future<bool> start();

  /// Returns a `data:audio/mp4;base64,…` URL, or null when nothing was recorded.
  Future<String?> stop();

  Future<void> cancel();
}

class DeviceVoiceRecorder implements VoiceRecorder {
  final _recorder = AudioRecorder();
  String? _path;

  @override
  Future<bool> start() async {
    if (!await _recorder.hasPermission()) return false;
    _path = '${Directory.systemTemp.path}/onboarding-${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000), path: _path!);
    return true;
  }

  @override
  Future<String?> stop() async {
    final path = await _recorder.stop() ?? _path;
    if (path == null) return null;
    final file = File(path);
    final bytes = await file.readAsBytes();
    await file.delete();
    return bytes.isEmpty ? null : 'data:audio/mp4;base64,${base64Encode(bytes)}';
  }

  @override
  Future<void> cancel() => _recorder.cancel();
}

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({
    super.key,
    required this.store,
    required this.api,
    required this.onDone,
    this.initial,
    this.recorder,
  });

  final Store store;
  final Api api;
  final Profile? initial;
  final VoiceRecorder? recorder;
  final void Function(Profile) onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

enum _Voice { idle, recording, processing, denied }

class _OnboardingScreenState extends State<OnboardingScreen> {
  late final recorder = widget.recorder ?? DeviceVoiceRecorder();
  late String? language = widget.initial?.language ?? 'vi';
  // Start over (initial != null) mirrors the web: keep language, clear direction and name.
  String? direction;
  final name = TextEditingController();
  BotState botMood = BotState.greet;
  late String tim = lang == 'en'
      ? 'Write Tim a little letter ✍️ Circle your picks and fill in the blank.'
      : 'Viết giúp Tim lá thư làm quen nhé ✍️ Khoanh tròn và điền tên vào chỗ trống.';
  bool sealed = false;
  bool flying = false;
  _Voice voice = _Voice.idle;
  String status = '';
  String error = '';
  Timer? _autoStop;

  String get lang => language!;
  String tr(String key) => t(key, lang);
  bool get nameOk => Profile.validName(name.text);
  @override
  void dispose() {
    _autoStop?.cancel();
    if (voice == _Voice.recording) recorder.cancel();
    name.dispose();
    super.dispose();
  }

  Future<void> startVoice() async {
    setState(() => error = status = '');
    if (!await recorder.start()) {
      setState(() {
        voice = _Voice.denied;
        error = tr('Không thể ghi âm. Bạn vẫn có thể nhập bằng tay.');
      });
      return;
    }
    setState(() {
      voice = _Voice.recording;
      status = tr('Đang ghi âm… Tối đa 30 giây.');
    });
    _autoStop = Timer(const Duration(seconds: 30), stopVoice);
  }

  Future<void> cancelVoice() async {
    _autoStop?.cancel();
    await recorder.cancel();
    setState(() {
      voice = _Voice.idle;
      status = tr('Đã hủy bản ghi.');
    });
  }

  Future<void> stopVoice() async {
    _autoStop?.cancel();
    if (voice != _Voice.recording) return;
    setState(() {
      voice = _Voice.processing;
      status = tr('Đang xử lý bản ghi…');
    });
    try {
      final audio = await recorder.stop();
      if (audio == null || audio.length > (_maxAudioBytes / 3).ceil() * 4 + 100) {
        throw ApiException(tr('Không có âm thanh hoặc bản ghi vượt quá 2 MB. Hãy ghi lại.'));
      }
      final r = await widget.api.onboarding(audioDataUrl: audio, language: lang);
      if (!mounted) return;
      setState(() {
        if (const ['vi', 'en'].contains(r['language'])) language = r['language'];
        if (const ['gf', 'bf'].contains(r['direction'])) direction = r['direction'];
        final spoken = r['partnerName'];
        if (spoken is String && Profile.validName(spoken)) name.text = spoken.trim();
        status = tr('Đã điền theo lời nói. Kiểm tra và bổ sung các trường còn thiếu trước khi lưu.');
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => voice = voice == _Voice.processing ? _Voice.idle : voice);
    }
  }

  bool get ready => direction != null && nameOk;

  Future<void> seal() async {
    final profile = Profile(language: lang, direction: direction!, partnerName: name.text.trim());
    await widget.store.saveProfile(profile);
    if (!mounted) return;
    if (!MediaQuery.disableAnimationsOf(context)) {
      setState(() => sealed = true);
      await Future<void>.delayed(const Duration(milliseconds: 900));
      if (!mounted) return;
      setState(() => flying = true);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (!mounted) return;
    }
    widget.onDone(profile);
  }

  // Tim's quip in the letter's language, like the web flow's timSays.
  void say(String vi, String en) => tim = lang == 'en' ? en : vi;

  BotState get bot => voice == _Voice.processing ? BotState.waiting : botMood;

  Widget pick(List<(String, String)> options, String? value, void Function(String) onPick, String label) => Semantics(
    label: label,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (i, (v, text)) in options.indexed) ...[
          if (i > 0) Text(' / ', style: _hand.copyWith(color: AppColors.muted)),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => onPick(v)),
            child: Semantics(
              button: true,
              selected: value == v,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    child: Text(
                      text,
                      style: value == v
                          ? _hand.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700,
                              fontStyle: FontStyle.normal,
                            )
                          : _hand.copyWith(color: AppColors.muted),
                    ),
                  ),
                  if (value == v)
                    Positioned.fill(
                      child: Transform.rotate(
                        angle: -0.05,
                        // Draws in left to right, like the web's ink-circle clip-path animation.
                        child: TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0, end: 1),
                          duration: const Duration(milliseconds: 350),
                          curve: Curves.easeOut,
                          builder: (_, t, child) => ClipRect(clipper: _Reveal(t), child: child),
                          child: CustomPaint(key: Key('ink-$text'), painter: _InkCircle()),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ],
    ),
  );

  Widget letter() {
    Widget line(List<Widget> children) =>
        Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, children: children);
    return AnimatedSlide(
      duration: const Duration(milliseconds: 600),
      offset: flying ? const Offset(0, -1.2) : Offset.zero,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 600),
        opacity: flying ? 0 : 1,
        child: Transform.rotate(
          angle: -0.6 * pi / 180,
          child: DecoratedBox(
            decoration: const BoxDecoration(
              boxShadow: [BoxShadow(color: Color(0x22713345), blurRadius: 40, offset: Offset(0, 14))],
              borderRadius: _paperRadius,
            ),
            child: CustomPaint(
              painter: _Paper(),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(40, 12, 12, 20),
                child: Stack(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('Thân gửi Tim,'), style: _hand),
                        line([
                          Text(tr('Mình nói'), style: _hand),
                          pick([('vi', 'Tiếng Việt'), ('en', 'English')], language, (v) {
                            language = v;
                            botMood = BotState.choose;
                            say('Tiếng Việt nhé, quá hợp 💗', 'English it is! 💗');
                          }, tr('Ngôn ngữ')),
                        ]),
                        line([
                          Text(tr('Mình muốn hiểu hơn về'), style: _hand),
                          pick([('gf', tr('bạn gái')), ('bf', tr('bạn trai'))], direction, (v) {
                            direction = v;
                            botMood = BotState.choose;
                            v == 'gf'
                                ? say('Ồ, một nàng thơ 💁‍♀️', 'Ooh, a girlfriend 💁‍♀️')
                                : say('Ồ, một chàng trai 💁‍♂️', 'Ooh, a boyfriend 💁‍♂️');
                          }, tr('Người ấy')),
                          Text(tr('của mình,'), style: _hand),
                        ]),
                        line([
                          Text(tr('người ấy tên là'), style: _hand),
                          const SizedBox(width: 8),
                          SizedBox(
                            width: 170,
                            height: 44,
                            child: CustomPaint(
                              painter: _DashedUnderline(),
                              child: TextField(
                                controller: name,
                                maxLength: 60,
                                autocorrect: false,
                                enableSuggestions: false,
                                textCapitalization: TextCapitalization.words,
                                textInputAction: TextInputAction.done,
                                style: _hand.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                                decoration: InputDecoration(
                                  hintText: tr('tên người ấy'),
                                  hintStyle: _hand.copyWith(color: const Color(0xFFC9A3B4)),
                                  counterText: '',
                                  isCollapsed: true,
                                  filled: false,
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 6),
                                ),
                                onTap: () => setState(() => botMood = BotState.input),
                                onChanged: (_) => setState(() {}),
                                onSubmitted: (_) {
                                  if (nameOk) {
                                    say(
                                      '${name.text.trim()}… nghe là thấy thương rồi 😍',
                                      '${name.text.trim()}… sounds lovely already 😍',
                                    );
                                  }
                                  setState(() => botMood = BotState.greet);
                                },
                              ),
                            ),
                          ),
                        ]),
                        Text(tr('Nhờ Tim giải mã giúp mình nha!'), style: _hand),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Text(
                            tr('— Một trái tim đang hơi rối 💗'),
                            style: _hand.copyWith(color: AppColors.muted),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Center(
                          child: FilledButton(
                            key: const Key('seal'),
                            onPressed: ready && !sealed ? seal : null,
                            child: Text(tr('Đóng dấu & gửi 💌')),
                          ),
                        ),
                      ],
                    ),
                    if (sealed)
                      const Positioned(right: 0, bottom: 0, child: Text('💗', style: TextStyle(fontSize: 56))),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget voiceControls() => switch (voice) {
    _Voice.denied => const SizedBox.shrink(),
    _Voice.recording => Wrap(
      spacing: 12,
      children: [
        FilledButton(onPressed: stopVoice, child: Text(tr('Dừng và xử lý'))),
        OutlinedButton(onPressed: cancelVoice, child: Text(tr('Hủy ghi âm'))),
      ],
    ),
    _ => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton(
          onPressed: voice == _Voice.processing ? null : startVoice,
          child: Text(tr('🎤 Thiết lập bằng giọng nói')),
        ),
        const SizedBox(height: 4),
        Text(
          tr('Ví dụ: “Dùng tiếng Anh, giải mã bạn gái, tên là Emma.”'),
          style: const TextStyle(color: AppColors.muted),
        ),
        Text(
          tr('Bản ghi tối đa 30 giây / 2 MB được gửi lên server và OpenAI để nhận diện; app không lưu bản ghi.'),
          style: const TextStyle(color: AppColors.muted, fontSize: 14),
        ),
      ],
    ),
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                TimBot(state: bot, size: 96),
                const SizedBox(width: 12),
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Text(tim, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            letter(),
            const SizedBox(height: 16),
            voiceControls(),
            if (status.isNotEmpty) Semantics(liveRegion: true, child: Text(status)),
            if (error.isNotEmpty)
              Semantics(
                liveRegion: true,
                child: Text(
                  error,
                  style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
                ),
              ),
            if (widget.initial != null)
              TextButton(onPressed: () => widget.onDone(widget.initial!), child: Text(tr('Hủy thay đổi'))),
          ],
        ),
      ),
    ),
  );
}

const _paperRadius = BorderRadius.vertical(top: Radius.circular(6), bottom: Radius.circular(18));

// 19px serif on a 44px ruled line, like the web letter.
const _hand = TextStyle(
  fontFamily: 'Georgia',
  fontFamilyFallback: ['Times New Roman', 'serif'],
  fontSize: 19,
  height: 44 / 19,
  leadingDistribution: TextLeadingDistribution.even,
  fontStyle: FontStyle.italic,
  color: AppColors.text,
);

/// Cream ruled paper with the pink margin line.
class _Paper extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rrect = _paperRadius.toRRect(Offset.zero & size);
    canvas.drawRRect(rrect, Paint()..color = const Color(0xFFFFFDF8));
    canvas.save();
    canvas.clipRRect(rrect);
    final rule = Paint()..color = const Color(0xFFF1D9E3);
    for (var y = 12 + 43.5; y < size.height; y += 44) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), rule);
    }
    canvas.drawLine(
      const Offset(26, 0),
      Offset(26, size.height),
      Paint()
        ..color = const Color(0xFFF6B3C8)
        ..strokeWidth = 2,
    );
    canvas.restore();
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = AppColors.border
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(_Paper old) => false;
}

/// The hand-drawn ring around the chosen word.
class _InkCircle extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) => canvas.drawOval(
    Rect.fromLTRB(-2, 4, size.width + 2, size.height - 4),
    Paint()
      ..color = AppColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5,
  );

  @override
  bool shouldRepaint(_InkCircle old) => false;
}

class _DashedUnderline extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 2;
    for (var x = 0.0; x < size.width; x += 8) {
      canvas.drawLine(Offset(x, size.height - 2), Offset(min(x + 5, size.width), size.height - 2), p);
    }
  }

  @override
  bool shouldRepaint(_DashedUnderline old) => false;
}

/// Shows the left [t] of the box (plus the ring's overhang), so the ring appears to be drawn.
class _Reveal extends CustomClipper<Rect> {
  _Reveal(this.t);

  final double t;

  @override
  Rect getClip(Size size) => Rect.fromLTRB(-4, -4, -4 + (size.width + 8) * t, size.height + 4);

  @override
  bool shouldReclip(_Reveal old) => old.t != t;
}
