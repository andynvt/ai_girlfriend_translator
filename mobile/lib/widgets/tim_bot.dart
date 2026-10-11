import 'package:flutter/material.dart';

/// Rows of assets/tim-bot-atlas.png (4 columns × 256 px), see assets/tim-bot/manifest.json.
enum BotState {
  greet(fps: 5, loop: false),
  choose(fps: 4, loop: false),
  input(fps: 4, loop: false),
  waiting(fps: 4, loop: true),
  reading(fps: 5, loop: true);

  const BotState({required this.fps, required this.loop});

  final int fps;
  final bool loop;
}

class TimBot extends StatefulWidget {
  const TimBot({super.key, required this.state, this.size = 120});

  final BotState state;
  final double size;

  @override
  State<TimBot> createState() => _TimBotState();
}

class _TimBotState extends State<TimBot> with SingleTickerProviderStateMixin {
  static const _frames = 4;
  late final _controller = AnimationController(vsync: this);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _play();
  }

  @override
  void didUpdateWidget(TimBot old) {
    super.didUpdateWidget(old);
    if (old.state != widget.state) _play();
  }

  void _play() {
    _controller
      ..stop()
      ..value = 0
      ..duration = Duration(milliseconds: 1000 * _frames ~/ widget.state.fps);
    if (MediaQuery.disableAnimationsOf(context)) return;
    if (widget.state.loop) {
      _controller.repeat();
    } else {
      _controller.forward().whenComplete(() {
        if (mounted) _controller.value = 0;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: s,
        child: ClipRect(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (_, child) {
              final frame = (_controller.value * _frames).floor().clamp(0, _frames - 1);
              return OverflowBox(
                alignment: Alignment.topLeft,
                maxWidth: s * 4,
                maxHeight: s * 5,
                child: Transform.translate(offset: Offset(-frame * s, -widget.state.index * s), child: child),
              );
            },
            child: Image.asset(
              'assets/tim-bot-atlas.png',
              width: s * 4,
              height: s * 5,
              filterQuality: FilterQuality.medium,
            ),
          ),
        ),
      ),
    );
  }
}
