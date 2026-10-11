import 'package:flutter/material.dart';

// Cupcake tokens from css/app.css (docs/design/design-system.md).
abstract final class AppColors {
  static const background = Color(0xFFFFF8F3);
  static const surface = Color(0xFFFFFFFF);
  static const primary = Color(0xFFB4235A);
  static const primarySoft = Color(0xFFFFE6EE);
  static const lavender = Color(0xFFF0E9FF);
  static const mint = Color(0xFFE6F6ED);
  static const text = Color(0xFF291B23);
  static const muted = Color(0xFF715363);
  static const border = Color(0xFFE6C8D6);
  static const focus = Color(0xFF6744A3);
  static const safe = Color(0xFF237A4B);
  static const warning = Color(0xFF946000);
  static const danger = Color(0xFFB42332);
}

ThemeData appTheme() {
  const pill = StadiumBorder();
  const minSize = Size(48, 48);
  final input = OutlineInputBorder(
    borderRadius: BorderRadius.circular(16),
    borderSide: const BorderSide(color: AppColors.border),
  );
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      surface: AppColors.surface,
      onSurface: AppColors.text,
      error: AppColors.danger,
    ),
    scaffoldBackgroundColor: AppColors.background,
    textTheme: const TextTheme(bodyLarge: TextStyle(fontSize: 18), bodyMedium: TextStyle(fontSize: 17)),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      border: input,
      enabledBorder: input,
      focusedBorder: input.copyWith(borderSide: const BorderSide(color: AppColors.focus, width: 3)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(shape: pill, minimumSize: minSize),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(shape: pill, minimumSize: minSize),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(shape: pill, minimumSize: minSize),
    ),
  );
}
