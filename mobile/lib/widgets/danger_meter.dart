import 'package:flutter/material.dart';

import '../i18n.dart';
import '../models.dart';
import '../theme.dart';

/// Colour always comes with the number and a label, never alone.
class DangerMeter extends StatelessWidget {
  const DangerMeter({super.key, required this.danger, required this.language});

  final int danger;
  final String language;

  @override
  Widget build(BuildContext context) {
    final color = danger < 40
        ? AppColors.safe
        : danger < 70
        ? AppColors.warning
        : AppColors.danger;
    final duration = MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 600);
    final label = t(dangerLabelKey(danger), language);
    return Semantics(
      label: '${t('Mức nguy hiểm', language)} $danger/100, $label',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(t('Mức nguy hiểm', language), style: const TextStyle(color: AppColors.muted)),
              const Spacer(),
              Text(
                '$danger',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color),
              ),
              const Text('/100', style: TextStyle(color: AppColors.muted)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: danger / 100),
              duration: duration,
              curve: Curves.easeOutCubic,
              builder: (_, v, _) => LinearProgressIndicator(
                value: v,
                minHeight: 14,
                color: color,
                backgroundColor: AppColors.primarySoft,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(color: color, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
