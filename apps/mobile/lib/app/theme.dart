import 'package:flutter/material.dart';

abstract final class FitFuelColors {
  static const green = Color(0xFF18A85D);
  static const greenDark = Color(0xFF0C8246);
  static const ink = Color(0xFF17221E);
  static const paper = Color(0xFFF6F8F6);
  static const line = Color(0xFFE7ECE9);
  static const muted = Color(0xFF78857F);
  static const blue = Color(0xFF4F9FE8);
  static const purple = Color(0xFF8E68D8);
  static const yellow = Color(0xFFF1B946);
  static const orange = Color(0xFFF28A42);
}

ThemeData buildFitFuelTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: FitFuelColors.green,
    brightness: Brightness.light,
  ).copyWith(
    primary: FitFuelColors.green,
    onPrimary: Colors.white,
    surface: Colors.white,
    onSurface: FitFuelColors.ink,
    outline: FitFuelColors.line,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: FitFuelColors.paper,
    fontFamily: 'sans',
    appBarTheme: const AppBarTheme(
      backgroundColor: FitFuelColors.paper,
      foregroundColor: FitFuelColors.ink,
      elevation: 0,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: FitFuelColors.green.withValues(alpha: .12),
      labelTextStyle: WidgetStatePropertyAll(
        const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: FitFuelColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: FitFuelColors.line),
      ),
    ),
  );
}
